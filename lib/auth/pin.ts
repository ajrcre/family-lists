// The shared web PIN is stored only as a scrypt hash in PIN_HASH:
//   scrypt:<N>:<r>:<p>:<salt base64url>:<hash base64url>
// Generate one with `npm run hash-pin -- <4 digits>`.
import { scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { fromB64url } from "./crypto";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

export const PIN_RE = /^\d{4}$/;

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = process.env.PIN_HASH;
  if (!stored || !PIN_RE.test(pin)) return false;
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = fromB64url(hashB64);
  const N = Number(n);
  const actual = await scrypt(pin, fromB64url(saltB64), expected.length, {
    N,
    r: Number(r),
    p: Number(p),
    maxmem: 256 * N * Number(r) + 1024 * 1024,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
