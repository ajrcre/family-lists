// Shared plumbing for the bearer-token JSON API (/api/*).
import { createHash, timingSafeEqual } from "node:crypto";
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

/** Constant-time check of "Authorization: Bearer <API_TOKEN>". Fails closed when unset. */
export function isApiAuthorized(req: Request): boolean {
  const expected = process.env.API_TOKEN;
  if (!expected) return false;
  const match = /^Bearer ([^\s]+)$/.exec(req.headers.get("authorization") ?? "");
  if (!match) return false;
  return timingSafeEqual(digest(match[1]), digest(expected));
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

/** Wraps a route handler with bearer auth, error mapping and no-store caching. */
export function apiRoute<Ctx>(handler: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    if (!isApiAuthorized(req)) return unauthorized();
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ValidationError) return validation(err.message);
      console.error("API error:", err);
      return serverError();
    }
  };
}
