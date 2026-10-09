import { apiRoute, json, readJson } from "@/lib/api";
import { createList, listLists } from "@/lib/repo";
import { parseListInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  return json({ lists: await listLists() });
});

export const POST = apiRoute(async (req) => {
  const { name } = parseListInput(await readJson(req));
  return json(await createList(name), 201);
});
