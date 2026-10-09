import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const b64url = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
export const fromB64url = (s: string) => Buffer.from(s, "base64url");

export function hmac(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/** Constant-time comparison of two strings of any length. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Short, non-reversible fingerprint of a secret (used to revoke sessions on rotation). */
export function fingerprint(secret: string): string {
  return createHash("sha256").update(`fingerprint:${secret}`).digest("base64url").slice(0, 16);
}

/** A secret is usable only if it is set and long enough. */
export function strongSecret(name: string, minLength = 32): string | null {
  const value = process.env[name];
  return value && value.length >= minLength ? value : null;
}
