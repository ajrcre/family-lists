// Test-only secrets. The PIN hash below is for the PIN "4321" (generated with
// scripts/hash-pin.mjs); none of these values are used anywhere real.
import { randomBytes, scryptSync } from "node:crypto";

const salt = randomBytes(16);
const hash = scryptSync("4321", salt, 32, { N: 16384, r: 8, p: 1 });

process.env.API_TOKEN = "test-api-token-0123456789abcdefghijklmnop";
process.env.PIN_HASH = `scrypt:16384:8:1:${salt.toString("base64url")}:${hash.toString("base64url")}`;
process.env.SESSION_SECRET = "test-session-secret-0123456789abcdefghijkl";
process.env.ACCESS_LINK_SECRET = "test-link-secret-0123456789abcdefghijklmnop";
delete process.env.DATABASE_URL;
