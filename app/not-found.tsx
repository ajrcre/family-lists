import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page empty-home">
      <h1>לא נמצא</h1>
      <p className="muted">ייתכן שהרשימה נמחקה.</p>
      <Link href="/" className="btn primary">
        חזרה לרשימות
      </Link>
    </main>
  );
}
