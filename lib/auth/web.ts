// Session helpers for server components and Server Actions.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionValue } from "./session";

export async function hasSession(): Promise<boolean> {
  const store = await cookies();
  return verifySessionValue(store.get(SESSION_COOKIE)?.value) !== null;
}

/** Redirects to the PIN screen when there is no valid web session. */
export async function requireSession(): Promise<void> {
  if (!(await hasSession())) redirect("/login");
}
