import { apiRoute, json, noContent, notFound, readJson } from "@/lib/api";
import { deleteItem, updateItem } from "@/lib/repo";
import { parseItemPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = RouteContext<"/api/items/[id]">;

export const PATCH = apiRoute(async (req, ctx: Ctx) => {
  const { id } = await ctx.params;
  const patch = parseItemPatch(await readJson(req));
  const item = await updateItem(id, patch);
  return item ? json(item) : notFound();
});

export const DELETE = apiRoute(async (_req, ctx: Ctx) => {
  const { id } = await ctx.params;
  return (await deleteItem(id)) ? noContent() : notFound();
});
