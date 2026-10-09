"use client";
import { useActionState } from "react";
import { agentLoginAction, type AgentLoginState } from "./actions";

export function AgentLoginForm() {
  const [state, action, pending] = useActionState<AgentLoginState, FormData>(agentLoginAction, {});
  return (
    <form action={action} className="login-form">
      <label htmlFor="token">API token</label>
      <input id="token" name="token" type="password" autoComplete="off" spellCheck={false} required autoFocus />
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
