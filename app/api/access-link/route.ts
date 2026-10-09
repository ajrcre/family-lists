// Bearer-protected helper (not part of the lists/items contract): returns a fresh
// web-UI access link valid for 24 hours. The link never grants API access.
import { apiRoute, json } from "@/lib/api";
import { buildAccessLink } from "@/lib/auth/link";

export const dynamic = "force-dynamic";

export const POST = apiRoute(async (req) => {
  const base = process.env.APP_URL || new URL(req.url).origin;
  const { url, expiresAt } = buildAccessLink(base);
  return json({ url, expires_at: expiresAt.toISOString() }, 201);
});
