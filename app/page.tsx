import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/web";
import { listLists } from "@/lib/repo";
import { LAST_LIST_COOKIE } from "@/lib/ui";
import { NewListForm } from "./lists/[listId]/NewListForm";
import { LogoutButton } from "./lists/[listId]/LogoutButton";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireSession();
  const lists = await listLists();
  const last = (await cookies()).get(LAST_LIST_COOKIE)?.value;
  const target = lists.find((l) => l.id === last) ?? lists[0];
  if (target) redirect(`/lists/${target.id}`);

  return (
    <main className="page empty-home">
      <h1>אין עדיין רשימות</h1>
      <p className="muted">צרו רשימה ראשונה, למשל קניות, ציוד לטיול או מטלות.</p>
      <NewListForm autoFocus />
      <LogoutButton />
    </main>
  );
}
