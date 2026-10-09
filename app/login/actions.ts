"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { PIN_RE, verifyPin } from "@/lib/auth/pin";
import { clearFailures, clientKey, isRateLimited, recordFailure } from "@/lib/auth/rateLimit";
import { createSessionValue, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export type LoginState = { error?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const pin = String(form.get("pin") ?? "").trim();
  const key = clientKey(await headers());

  if (await isRateLimited("pin", key)) {
    return { error: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות." };
  }
  if (!PIN_RE.test(pin) || !(await verifyPin(pin))) {
    await recordFailure("pin", key);
    return { error: "קוד שגוי" };
  }

  await clearFailures("pin", key);
  (await cookies()).set(SESSION_COOKIE, createSessionValue("pin"), sessionCookieOptions());
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
