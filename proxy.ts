// Gatekeeper for the web UI (the JSON API under /api authenticates itself with a
// bearer token and is excluded here).
//  - ?key=<access-link token> on any page: rewritten to /auth/link, which swaps it
//    for a session cookie and redirects to the same URL without the token.
//  - No valid session: redirect to the PIN screen.
import { NextResponse, type NextRequest } from "next/server";
import { LINK_PARAM } from "@/lib/auth/link";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth/session";

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;

  if (searchParams.has(LINK_PARAM)) {
    const clean = req.nextUrl.clone();
    clean.searchParams.delete(LINK_PARAM);
    const target = new URL("/auth/link", req.url);
    target.searchParams.set(LINK_PARAM, searchParams.get(LINK_PARAM) ?? "");
    target.searchParams.set("next", pathname === "/login" ? "/" : clean.pathname + clean.search);
    return NextResponse.rewrite(target);
  }

  if (pathname.startsWith("/auth/")) return NextResponse.next();

  const authed = verifySessionValue(req.cookies.get(SESSION_COOKIE)?.value) !== null;
  if (pathname === "/login") {
    return authed ? NextResponse.redirect(new URL("/", req.url)) : NextResponse.next();
  }
  if (!authed) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|robots.txt).*)"],
};
