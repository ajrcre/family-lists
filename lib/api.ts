// Shared plumbing for the bearer-token JSON API (/api/*).
import { createHash, timingSafeEqual } from "node:crypto";
import { canReadApi, SESSION_COOKIE, verifySessionValue } from "./auth/session";
import { ValidationError } from "./validation";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

export const notFound = () => json({ error: "not_found" }, 404);
const unauthorized = () => json({ error: "unauthorized" }, 401);
const validation = (message: string) => json({ error: "validation", message }, 400);
const serverError = () => json({ error: "server_error" }, 500);

const digest = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time comparison with API_TOKEN. Fails closed when unset. */
export function isValidApiToken(token: string): boolean {
  const expected = process.env.API_TOKEN;
  if (!expected || !token) return false;
  return timingSafeEqual(digest(token), digest(expected));
}

/** Checks "Authorization: Bearer <API_TOKEN>". */
export function isApiAuthorized(req: Request): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.get("authorization") ?? "");
  return match !== null && isValidApiToken(match[1]);
}

function cookieValue(req: Request, name: string): string | undefined {
  for (const part of (req.headers.get("cookie") ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq !== -1 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

/** True for a browser signed in with the PIN or on /agent-login (see canReadApi). */
export function hasApiReadSession(req: Request): boolean {
  return canReadApi(verifySessionValue(cookieValue(req, SESSION_COOKIE)));
}

/** Parses the request body as JSON, mapping malformed input to a 400. */
export async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError("malformed JSON body");
  }
}

/**
 * Wraps a route handler with bearer auth, error mapping and no-store caching.
 * Read-only handlers may pass `{ sessionRead: true }` to also accept a PIN or agent
 * session cookie, so a signed-in browser can open GET URLs directly.
 */
export function apiRoute<Ctx>(
  handler: (req: Request, ctx: Ctx) => Promise<Response>,
  { sessionRead = false }: { sessionRead?: boolean } = {},
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    if (!isApiAuthorized(req) && !(sessionRead && hasApiReadSession(req))) return unauthorized();
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ValidationError) return validation(err.message);
      console.error("API error:", err);
      return serverError();
    }
  };
}
