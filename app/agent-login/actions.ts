"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidApiToken } from "@/lib/api";
import { clearFailures, clientKey, isRateLimited, recordFailure } from "@/lib/auth/rateLimit";
import { createSessionValue, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export type AgentLoginState = { error?: string };

const MAX_TOKEN_LENGTH = 512;

export async function agentLoginAction(_prev: AgentLoginState, form: FormData): Promise<AgentLoginState> {
  const token = String(form.get("token") ?? "").trim();
  const key = clientKey(await headers());

  if (await isRateLimited("agent", key)) {
    return { error: "Too many attempts. Try again in a few minutes." };
  }
  if (token.length > MAX_TOKEN_LENGTH || !isValidApiToken(token)) {
    await recordFailure("agent", key);
    return { error: "Invalid token" };
  }

  await clearFailures("agent", key);
  (await cookies()).set(SESSION_COOKIE, createSessionValue("agent"), sessionCookieOptions());
  redirect("/");
}
