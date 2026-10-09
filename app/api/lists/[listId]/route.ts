import { apiRoute, noContent, notFound } from "@/lib/api";
import { deleteList } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const DELETE = apiRoute(async (_req, ctx: RouteContext<"/api/lists/[listId]">) => {
  const { listId } = await ctx.params;
  return (await deleteList(listId)) ? noContent() : notFound();
});
