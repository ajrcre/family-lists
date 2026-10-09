import { SCHEMA_SQL } from "./schema";

export type Row = Record<string, unknown>;

interface Driver {
  query(text: string, params?: unknown[]): Promise<Row[]>;
  exec(text: string): Promise<void>;
}

// One driver per server process. Stored on globalThis so dev hot-reloads and
// separately bundled entry points (proxy, routes) share a single connection.
const globalKey = Symbol.for("family-lists.db");
type GlobalWithDb = typeof globalThis & { [globalKey]?: Promise<Driver> };

async function createPostgresDriver(url: string): Promise<Driver> {
  const { default: postgres } = await import("postgres");
  const sql = postgres(url, {
    max: 5,
    idle_timeout: 20,
    prepare: false, // compatible with pooled (PgBouncer) connection strings
    onnotice: () => {},
  });
  return {
    async query(text, params = []) {
      return (await sql.unsafe(text, params as never[])) as unknown as Row[];
    },
    async exec(text) {
      await sql.unsafe(text);
    },
  };
}

// Local development and tests only: an in-process Postgres (PGlite).
async function createPgliteDriver(): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DIR || (process.env.VITEST ? "memory://" : "./.data/pglite");
  if (!dataDir.includes("://")) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(dataDir, { recursive: true });
  }
  const db = new PGlite(dataDir);
  return {
    async query(text, params = []) {
      return (await db.query<Row>(text, params)).rows;
    },
    async exec(text) {
      await db.exec(text);
    },
  };
}

async function connect(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  let driver: Driver;
  if (url) {
    driver = await createPostgresDriver(url);
  } else if (process.env.NODE_ENV === "production" && !process.env.ALLOW_PGLITE) {
    throw new Error("DATABASE_URL is not set");
  } else {
    driver = await createPgliteDriver();
  }
  await driver.exec(SCHEMA_SQL);
  return driver;
}

function getDriver(): Promise<Driver> {
  const g = globalThis as GlobalWithDb;
  if (!g[globalKey]) {
    g[globalKey] = connect().catch((err) => {
      g[globalKey] = undefined; // allow a retry on the next request
      throw err;
    });
  }
  return g[globalKey]!;
}

export async function query<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const driver = await getDriver();
  return (await driver.query(text, params)) as T[];
}
