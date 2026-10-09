import { apiRoute, json, notFound, readJson } from "@/lib/api";
import { createItem, getList, listOpenItems } from "@/lib/repo";
import { parseItemInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/lists/[listId]/items">;

export const GET = apiRoute(async (_req, ctx: Ctx) => {
  const { listId } = await ctx.params;
  if (!(await getList(listId))) return notFound();
  return json({ items: await listOpenItems(listId) });
}, { agentSession: true });

export const POST = apiRoute(async (req, ctx: Ctx) => {
  const { listId } = await ctx.params;
  const input = parseItemInput(await readJson(req));
  const item = await createItem(listId, input);
  return item ? json(item, 201) : notFound();
});
