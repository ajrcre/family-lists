#!/usr/bin/env node
// Usage: npm run access-link -- https://your-app.vercel.app
// Prints a fresh web-UI access link (valid for 24 hours) using ACCESS_LINK_SECRET
// from the environment or .env.local. No redeploy needed. The same thing is
// available remotely via POST /api/access-link with the API bearer token.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";

if (!process.env.ACCESS_LINK_SECRET) {
  for (const file of [".env.local", ".env"]) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
const secret = process.env.ACCESS_LINK_SECRET;
const base = process.argv[2] || process.env.APP_URL;
if (!secret || secret.length < 32) {
  console.error("ACCESS_LINK_SECRET is missing or shorter than 32 characters.");
  process.exit(1);
}
if (!base) {
  console.error("Usage: npm run access-link -- <app base URL>   (or set APP_URL)");
  process.exit(1);
}

// Must match lib/auth/link.ts.
const exp = Date.now() + 24 * 60 * 60 * 1000;
const body = Buffer.from(JSON.stringify({ exp, n: randomBytes(9).toString("base64url") })).toString("base64url");
const sig = createHmac("sha256", secret).update(`access-link:${body}`).digest("base64url");
const url = new URL("/", base);
url.searchParams.set("key", `${body}.${sig}`);
console.log(url.toString());
console.error(`Expires: ${new Date(exp).toISOString()}`);
