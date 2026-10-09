import { logoutAction } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button className="btn link">יציאה</button>
    </form>
  );
}
