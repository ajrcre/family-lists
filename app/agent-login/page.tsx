import type { Metadata } from "next";
import { AgentLoginForm } from "./AgentLoginForm";

export const metadata: Metadata = { title: "Agent sign-in" };

// Sign-in for an AI agent with the API token instead of the family PIN. The page is
// in English (unlike the rest of the UI) because its audience is the agent.
export default function AgentLoginPage() {
  return (
    <main className="login" lang="en" dir="ltr">
      <div className="login-card">
        <div className="login-icon" aria-hidden>
          🤖
        </div>
        <h1>Agent sign-in</h1>
        <p className="muted">Sign in with the API token.</p>
        <AgentLoginForm />
      </div>
    </main>
  );
}
