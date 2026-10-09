"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="login-form">
      <label htmlFor="pin">קוד כניסה</label>
      <input
        id="pin"
        name="pin"
        type="password"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autoComplete="current-password"
        required
        autoFocus
        dir="ltr"
        className="pin-input"
      />
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "בודק…" : "כניסה"}
      </button>
    </form>
  );
}
