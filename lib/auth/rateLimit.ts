// Database-backed rate limiting of failed sign-in attempts, so it holds across
// serverless instances. Clients are identified by a salted hash of their IP.
import { createHash } from "node:crypto";
import { query } from "../db";

export type AttemptKind = "pin" | "link";

interface Rule {
  perClient: number;
  windowMinutes: number;
  /** Optional cap across all clients (protects the 10,000-value PIN space). */
  global?: number;
  globalWindowMinutes?: number;
}

export const RULES: Record<AttemptKind, Rule> = {
  pin: { perClient: 5, windowMinutes: 15, global: 30, globalWindowMinutes: 60 },
  link: { perClient: 10, windowMinutes: 15 },
};

export function clientKey(headers: Headers): string {
  const ip =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
  const salt = process.env.SESSION_SECRET ?? "";
  return createHash("sha256").update(`client:${salt}:${ip}`).digest("base64url").slice(0, 22);
}

async function count(kind: AttemptKind, minutes: number, key?: string): Promise<number> {
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM auth_attempts
     WHERE kind = $1 AND at > now() - make_interval(mins => $2) ${key ? "AND key = $3" : ""}`,
    key ? [kind, minutes, key] : [kind, minutes],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function isRateLimited(kind: AttemptKind, key: string): Promise<boolean> {
  const rule = RULES[kind];
  if ((await count(kind, rule.windowMinutes, key)) >= rule.perClient) return true;
  if (rule.global && (await count(kind, rule.globalWindowMinutes!)) >= rule.global) return true;
  return false;
}

export async function recordFailure(kind: AttemptKind, key: string): Promise<void> {
  await query(`INSERT INTO auth_attempts (kind, key, at) VALUES ($1, $2, now())`, [kind, key]);
  // Opportunistic cleanup of old rows.
  await query(`DELETE FROM auth_attempts WHERE at < now() - interval '1 day'`);
}

export async function clearFailures(kind: AttemptKind, key: string): Promise<void> {
  await query(`DELETE FROM auth_attempts WHERE kind = $1 AND key = $2`, [kind, key]);
}
