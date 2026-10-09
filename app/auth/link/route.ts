// Exchanges an access-link token for a web session, then redirects to a clean URL
// so the token does not stay in the address bar, history or referrers.
// Requests to any page with ?key=... are rewritten here by proxy.ts.
import { NextResponse, type NextRequest } from "next/server";
import { LINK_PARAM, verifyLinkToken } from "@/lib/auth/link";
import { clientKey, isRateLimited, recordFailure } from "@/lib/auth/rateLimit";
import { createSessionValue, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Only same-origin absolute paths are allowed as redirect targets. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get(LINK_PARAM);
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");

  try {
    const key = clientKey(req.headers);
    if (token && !(await isRateLimited("link", key))) {
      if (verifyLinkToken(token)) {
        res.cookies.set(SESSION_COOKIE, createSessionValue("link"), sessionCookieOptions());
      } else {
        await recordFailure("link", key);
      }
    }
  } catch (err) {
    // Fall back to the PIN screen rather than failing the request.
    console.error("Access link error:", err);
  }
  return res;
}
