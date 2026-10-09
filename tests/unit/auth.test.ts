import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { verifyPin } from "@/lib/auth/pin";
import { buildAccessLink, createLinkToken, LINK_TTL_MS, verifyLinkToken } from "@/lib/auth/link";
import { createSessionValue, SESSION_COOKIE, verifySessionValue } from "@/lib/auth/session";
import { clientKey, isRateLimited, recordFailure } from "@/lib/auth/rateLimit";
import { proxy } from "@/proxy";
import * as linkRoute from "@/app/auth/link/route";
import * as accessLinkRoute from "@/app/api/access-link/route";
import * as listsRoute from "@/app/api/lists/route";

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env.ACCESS_LINK_SECRET = ORIGINAL.ACCESS_LINK_SECRET;
  process.env.PIN_HASH = ORIGINAL.PIN_HASH;
  process.env.SESSION_SECRET = ORIGINAL.SESSION_SECRET;
});

let ipCounter = 0;
const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${ipCounter % 250}`;

describe("PIN", () => {
  it("accepts the right PIN and rejects wrong ones", async () => {
    expect(await verifyPin("4321")).toBe(true);
    expect(await verifyPin("1234")).toBe(false);
    expect(await verifyPin("432")).toBe(false);
    expect(await verifyPin("43210")).toBe(false);
  });

  it("is stored only as a hash", () => {
    expect(process.env.PIN_HASH).toMatch(/^scrypt:/);
    expect(process.env.PIN_HASH).not.toContain("4321");
  });

  it("rate-limits repeated failures per client", async () => {
    const key = clientKey(new Headers({ "x-forwarded-for": freshIp() }));
    for (let i = 0; i < 5; i++) {
      expect(await isRateLimited("pin", key)).toBe(false);
      await recordFailure("pin", key);
    }
    expect(await isRateLimited("pin", key)).toBe(true);
    const other = clientKey(new Headers({ "x-forwarded-for": freshIp() }));
    expect(await isRateLimited("pin", other)).toBe(false);
  });
});

describe("access link tokens", () => {
  it("accepts a fresh token", () => {
    expect(verifyLinkToken(createLinkToken().token)).toBe(true);
  });

  it("expires after 24 hours", () => {
    const issued = Date.now() - LINK_TTL_MS - 1000;
    const { token } = createLinkToken(issued);
    expect(verifyLinkToken(token, issued + LINK_TTL_MS - 1000)).toBe(true);
    expect(verifyLinkToken(token)).toBe(false);
  });

  it("rejects wrong, tampered and missing tokens", () => {
    const { token } = createLinkToken();
    const [body, sig] = token.split(".");
    expect(verifyLinkToken(undefined)).toBe(false);
    expect(verifyLinkToken("")).toBe(false);
    expect(verifyLinkToken("abc")).toBe(false);
    expect(verifyLinkToken(`${body}.${sig.slice(0, -2)}xx`)).toBe(false);
    const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 10 * LINK_TTL_MS })).toString("base64url");
    expect(verifyLinkToken(`${forged}.${sig}`)).toBe(false);
  });

  it("stops working once the secret is rotated", () => {
    const { token } = createLinkToken();
    process.env.ACCESS_LINK_SECRET = "rotated-link-secret-0123456789abcdefghijk";
    expect(verifyLinkToken(token)).toBe(false);
  });

  it("scripts/access-link.mjs produces links the app accepts", () => {
    const out = execFileSync("node", ["scripts/access-link.mjs", "https://example.test"], {
      env: { ...process.env },
      stdio: ["ignore", "pipe", "ignore"],
    }).toString().trim();
    const url = new URL(out);
    expect(url.origin).toBe("https://example.test");
    expect(verifyLinkToken(url.searchParams.get("key"))).toBe(true);
  });

  it("is not the PIN and not the API token", () => {
    const { url } = buildAccessLink("https://example.test");
    expect(url).not.toContain(process.env.API_TOKEN!);
    expect(new URL(url).searchParams.get("key")!.length).toBeGreaterThan(60);
  });
});

describe("sessions", () => {
  it("round-trips and rejects tampering", () => {
    const value = createSessionValue("pin");
    expect(verifySessionValue(value)?.m).toBe("pin");
    expect(verifySessionValue(value + "x")).toBeNull();
    expect(verifySessionValue(undefined)).toBeNull();
  });

  it("revokes link sessions when the link secret rotates, PIN sessions when the PIN changes", () => {
    const link = createSessionValue("link");
    const pin = createSessionValue("pin");
    process.env.ACCESS_LINK_SECRET = "rotated-link-secret-0123456789abcdefghijk";
    expect(verifySessionValue(link)).toBeNull();
    expect(verifySessionValue(pin)).not.toBeNull();
    process.env.PIN_HASH = "scrypt:16384:8:1:AAAA:BBBB";
    expect(verifySessionValue(pin)).toBeNull();
  });
});

function linkRequest(path: string, ip = freshIp()) {
  return new NextRequest(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
}

describe("link exchange flow", () => {
  it("proxy rewrites ?key= on a page to the exchange route with the clean path", () => {
    const res = proxy(linkRequest("/lists/abc?key=TOKEN&x=1"));
    const rewrite = new URL(res.headers.get("x-middleware-rewrite")!);
    expect(rewrite.pathname).toBe("/auth/link");
    expect(rewrite.searchParams.get("key")).toBe("TOKEN");
    expect(rewrite.searchParams.get("next")).toBe("/lists/abc?x=1");
  });

  it("proxy sends visitors without a session to the PIN screen", () => {
    const res = proxy(linkRequest("/"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("a valid link sets a session cookie and redirects to a URL without the token", async () => {
    const { token } = createLinkToken();
    const res = await linkRoute.GET(linkRequest(`/auth/link?key=${token}&next=/`));
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).not.toContain(token);
    expect(new URL(location).pathname).toBe("/");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const cookie = res.cookies.get(SESSION_COOKIE);
    expect(cookie?.httpOnly).toBe(true);
    expect(verifySessionValue(cookie!.value)?.m).toBe("link");

    const after = proxy(
      new NextRequest("http://localhost/", { headers: { cookie: `${SESSION_COOKIE}=${cookie!.value}` } }),
    );
    expect(after.headers.get("location")).toBeNull(); // passes through
  });

  it.each([
    ["expired", () => createLinkToken(Date.now() - LINK_TTL_MS - 1).token],
    ["wrong", () => "eyJleHAiOjF9.d3Jvbmc"],
    ["empty", () => ""],
  ])("an %s link sets no cookie and falls back to the PIN screen", async (_label, make) => {
    const res = await linkRoute.GET(linkRequest(`/auth/link?key=${make()}&next=/`));
    expect(res.status).toBe(303);
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("a link made before rotating the secret no longer works", async () => {
    const { token } = createLinkToken();
    process.env.ACCESS_LINK_SECRET = "rotated-link-secret-0123456789abcdefghijk";
    const res = await linkRoute.GET(linkRequest(`/auth/link?key=${token}`));
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("only redirects to same-origin paths", async () => {
    const res = await linkRoute.GET(linkRequest(`/auth/link?key=x&next=//evil.example/`));
    expect(new URL(res.headers.get("location")!).origin).toBe("http://localhost");
  });

  it("rate-limits repeated bad tokens, even ignoring a valid one afterwards", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) await linkRoute.GET(linkRequest(`/auth/link?key=bad${i}`, ip));
    const { token } = createLinkToken();
    const res = await linkRoute.GET(linkRequest(`/auth/link?key=${token}`, ip));
    expect(res.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});

describe("credential separation", () => {
  it("a web session (from a link) gives no API access", async () => {
    const session = createSessionValue("link");
    const { token } = createLinkToken();
    for (const headers of <Record<string, string>[]>[
      { cookie: `${SESSION_COOKIE}=${session}` },
      { authorization: `Bearer ${token}` },
      { authorization: `Bearer ${session}` },
    ]) {
      const res = await listsRoute.GET(new Request("http://localhost/api/lists", { headers }), {} as never);
      expect(res.status).toBe(401);
    }
  });

  it("POST /api/access-link needs the API token and returns a working 24h link", async () => {
    const unauth = await accessLinkRoute.POST(new Request("http://localhost/api/access-link", { method: "POST" }), {} as never);
    expect(unauth.status).toBe(401);

    const res = await accessLinkRoute.POST(
      new Request("https://lists.example.test/api/access-link", {
        method: "POST",
        headers: { authorization: `Bearer ${process.env.API_TOKEN}` },
      }),
      {} as never,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["expires_at", "url"]);
    const url = new URL(body.url);
    expect(url.origin).toBe("https://lists.example.test");
    expect(verifyLinkToken(url.searchParams.get("key"))).toBe(true);
    const ttl = new Date(body.expires_at).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(LINK_TTL_MS - 60_000);
    expect(ttl).toBeLessThanOrEqual(LINK_TTL_MS);
  });
});
