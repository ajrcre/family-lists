#!/usr/bin/env node
// Usage: npm run hash-pin -- 1234
// Prints a scrypt hash to put in PIN_HASH. The PIN itself is never stored.
import { randomBytes, scryptSync } from "node:crypto";

const pin = process.argv[2] ?? "";
if (!/^\d{4}$/.test(pin)) {
  console.error("Usage: npm run hash-pin -- <4-digit PIN>");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(pin, salt, 32, { N, r, p });
console.log(`scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`);
