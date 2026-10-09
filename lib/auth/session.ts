// Web-UI sessions: a stateless, HMAC-signed cookie. A session never grants write
// access to the API; only "agent" sessions (signed in with the API token on
// /agent-login) may also read the API's GET endpoints, see lib/api.ts.
//
// Each session records the login method and a fingerprint of the credential it was
// created with. Rotating that credential (PIN_HASH, ACCESS_LINK_SECRET or API_TOKEN)
// therefore invalidates existing sessions of that method. To add passkeys/WebAuthn later, add
// a "passkey" method here with its own fingerprint source and a login route that
// calls createSessionCookie("passkey") — nothing else needs to change.
import { b64url, fingerprint, fromB64url, hmac, safeEqual, strongSecret } from "./crypto";

export type LoginMethod = "pin" | "link" | "agent";

export const SESSION_COOKIE = "fl_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface SessionPayload {
  m: LoginMethod;
  iat: number; // seconds
  exp: number; // seconds
  v: string; // credential fingerprint
}

const CREDENTIAL_SOURCES: Record<LoginMethod, string> = {
  pin: "PIN_HASH",
  link: "ACCESS_LINK_SECRET",
  agent: "API_TOKEN",
};

function credentialFingerprint(method: LoginMethod): string | null {
  const secret = process.env[CREDENTIAL_SOURCES[method]];
  return secret ? fingerprint(secret) : null;
}

const sign = (secret: string, body: string) => b64url(hmac(secret, `session:${body}`));

export function createSessionValue(method: LoginMethod, now = Date.now()): string {
  const secret = strongSecret("SESSION_SECRET");
  const v = credentialFingerprint(method);
  if (!secret || !v) throw new Error(`Cannot create a session: SESSION_SECRET or ${CREDENTIAL_SOURCES[method]} missing`);
  const iat = Math.floor(now / 1000);
  const payload: SessionPayload = { m: method, iat, exp: iat + SESSION_MAX_AGE_SECONDS, v };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(secret, body)}`;
}

export function verifySessionValue(value: string | undefined, now = Date.now()): SessionPayload | null {
  const secret = strongSecret("SESSION_SECRET");
  if (!secret || !value) return null;
  const [body, sig, extra] = value.split(".");
  if (!body || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, sign(secret, body))) return null;
  let payload: SessionPayload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return null;
  }
  if (!(payload.m in CREDENTIAL_SOURCES)) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= now) return null;
  const v = credentialFingerprint(payload.m);
  if (!v || payload.v !== v) return null;
  return payload;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
