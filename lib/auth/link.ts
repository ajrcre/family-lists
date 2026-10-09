// Shareable access links: <APP_URL>/?key=<token>
// token = base64url({"exp":<ms>,"n":<nonce>}) "." base64url(HMAC-SHA256(ACCESS_LINK_SECRET))
// Links expire 24 hours after generation. Changing ACCESS_LINK_SECRET revokes every
// link (and every session opened from one). Links grant web-UI access only.
import { randomBytes } from "node:crypto";
import { b64url, fromB64url, hmac, safeEqual, strongSecret } from "./crypto";

export const LINK_PARAM = "key";
export const LINK_TTL_MS = 24 * 60 * 60 * 1000;

const sign = (secret: string, body: string) => b64url(hmac(secret, `access-link:${body}`));

export function createLinkToken(now = Date.now()): { token: string; expiresAt: Date } {
  const secret = strongSecret("ACCESS_LINK_SECRET");
  if (!secret) throw new Error("ACCESS_LINK_SECRET is missing or shorter than 32 characters");
  const exp = now + LINK_TTL_MS;
  const body = b64url(JSON.stringify({ exp, n: b64url(randomBytes(9)) }));
  return { token: `${body}.${sign(secret, body)}`, expiresAt: new Date(exp) };
}

export function verifyLinkToken(token: string | null | undefined, now = Date.now()): boolean {
  const secret = strongSecret("ACCESS_LINK_SECRET");
  if (!secret || !token || token.length > 512) return false;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return false;
  if (!safeEqual(sig, sign(secret, body))) return false;
  try {
    const { exp } = JSON.parse(fromB64url(body).toString("utf8"));
    return typeof exp === "number" && now < exp && exp <= now + LINK_TTL_MS;
  } catch {
    return false;
  }
}

export function buildAccessLink(baseUrl: string, now = Date.now()): { url: string; expiresAt: Date } {
  const { token, expiresAt } = createLinkToken(now);
  const url = new URL("/", baseUrl);
  url.searchParams.set(LINK_PARAM, token);
  return { url: url.toString(), expiresAt };
}
