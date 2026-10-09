import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "כניסה" };

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login-card">
        <div className="login-icon" aria-hidden>
          🛒
        </div>
        <h1>הרשימות של המשפחה</h1>
        <p className="muted">הקלידו את הקוד בן 4 הספרות</p>
        <LoginForm />
      </div>
    </main>
  );
}
