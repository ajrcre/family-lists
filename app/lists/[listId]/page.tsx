import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/web";
import * as repo from "@/lib/repo";
import { ListView } from "./ListView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ listId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { listId } = await params;
  const list = await repo.getList(listId).catch(() => null);
  return { title: list?.name ?? "רשימה" };
}

export default async function ListPage({ params }: Props) {
  await requireSession();
  const { listId } = await params;
  const list = await repo.getList(listId);
  if (!list) notFound();

  const [lists, items, recent, categories] = await Promise.all([
    repo.listLists(),
    repo.listOpenItems(list.id),
    repo.listRecentlyBought(list.id),
    repo.listCategories(list.id),
  ]);

  return <ListView key={list.id} list={list} lists={lists} items={items} recent={recent} categories={categories} />;
}
