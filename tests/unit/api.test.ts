import { describe, expect, it } from "vitest";
import * as listsRoute from "@/app/api/lists/route";
import * as listRoute from "@/app/api/lists/[listId]/route";
import * as itemsRoute from "@/app/api/lists/[listId]/items/route";
import * as itemRoute from "@/app/api/items/[id]/route";

const TOKEN = process.env.API_TOKEN!;
const LIST_KEYS = ["created_at", "id", "name", "updated_at"];
const ITEM_KEYS = [
  "added_by", "category", "created_at", "id", "list_id", "name", "notes", "quantity", "status", "updated_at",
];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MISSING = "00000000-0000-4000-8000-000000000000";

type Handler = (req: Request, ctx: never) => Promise<Response>;

function req(method: string, body?: unknown, opts: { token?: string | null; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("http://localhost/api/x", {
    method,
    headers,
    body: opts.raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

async function call(handler: Handler, request: Request, params: Record<string, string> = {}) {
  const res = await handler(request, { params: Promise.resolve(params) } as never);
  const text = await res.text();
  return { res, status: res.status, text, json: text ? JSON.parse(text) : undefined };
}

const createList = async (name: string) => (await call(listsRoute.POST, req("POST", { name }))).json;
const createItem = async (listId: string, body: unknown) =>
  call(itemsRoute.POST, req("POST", body), { listId });
const openItems = async (listId: string) => (await call(itemsRoute.GET, req("GET"), { listId })).json;
const patch = (id: string, body: unknown, opts = {}) => call(itemRoute.PATCH, req("PATCH", body, opts), { id });

describe("authentication", () => {
  it.each([
    ["missing", null],
    ["wrong", "nope"],
  ])("returns 401 for a %s token", async (_label, token) => {
    const { status, json, res } = await call(listsRoute.GET, req("GET", undefined, { token }));
    expect(status).toBe(401);
    expect(json).toEqual({ error: "unauthorized" });
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("returns 401 for a malformed Authorization header", async () => {
    const r = new Request("http://localhost/api/lists", { headers: { authorization: `Token ${TOKEN}` } });
    expect((await call(listsRoute.GET, r)).status).toBe(401);
  });

  it("checks auth before anything else on every endpoint", async () => {
    const bad = { token: "wrong" };
    expect((await call(listsRoute.POST, req("POST", {}, bad))).status).toBe(401);
    expect((await call(listRoute.DELETE, req("DELETE", undefined, bad), { listId: MISSING })).status).toBe(401);
    expect((await call(itemsRoute.GET, req("GET", undefined, bad), { listId: MISSING })).status).toBe(401);
    expect((await call(itemsRoute.POST, req("POST", {}, bad), { listId: MISSING })).status).toBe(401);
    expect((await call(itemRoute.PATCH, req("PATCH", {}, bad), { id: MISSING })).status).toBe(401);
    expect((await call(itemRoute.DELETE, req("DELETE", undefined, bad), { id: MISSING })).status).toBe(401);
  });
});

describe("lists", () => {
  it("creates a list with exactly 4 fields, returned as a bare object", async () => {
    const { status, json, res } = await call(listsRoute.POST, req("POST", { name: "  ציוד לטיול  " }));
    expect(status).toBe(201);
    expect(Object.keys(json).sort()).toEqual(LIST_KEYS);
    expect(json.name).toBe("ציוד לטיול");
    expect(json.created_at).toMatch(ISO);
    expect(json.updated_at).toBe(json.created_at);
    expect(res.headers.get("cache-control")).toContain("no-store");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("lists all lists as {lists: [...]} with no extra fields", async () => {
    const created = await createList("מטלות");
    const { status, json } = await call(listsRoute.GET, req("GET"));
    expect(status).toBe(200);
    expect(Object.keys(json)).toEqual(["lists"]);
    expect(json.lists).toContainEqual(created);
    for (const l of json.lists) expect(Object.keys(l).sort()).toEqual(LIST_KEYS);
  });

  it.each([
    [{}, "missing name"],
    [{ name: "" }, "empty name"],
    [{ name: "   " }, "blank name"],
    [{ name: 5 }, "wrong type"],
    [{ name: "x".repeat(81) }, "too long"],
    [[], "array body"],
  ])("rejects %j (%s) with 400", async (body, _label) => {
    const { status, json } = await call(listsRoute.POST, req("POST", body));
    expect(status).toBe(400);
    expect(json.error).toBe("validation");
    expect(typeof json.message).toBe("string");
  });

  it("rejects malformed JSON with 400", async () => {
    const { status, json } = await call(listsRoute.POST, req("POST", undefined, { raw: "{nope" }));
    expect(status).toBe(400);
    expect(json).toEqual({ error: "validation", message: "malformed JSON body" });
  });

  it("deletes a list and its items (204, empty body)", async () => {
    const list = await createList("זמני");
    const item = (await createItem(list.id, { name: "חלב" })).json;
    const del = await call(listRoute.DELETE, req("DELETE"), { listId: list.id });
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
    expect((await call(itemsRoute.GET, req("GET"), { listId: list.id })).status).toBe(404);
    expect((await patch(item.id, { name: "x" })).status).toBe(404);
    expect((await call(listRoute.DELETE, req("DELETE"), { listId: list.id })).json).toEqual({ error: "not_found" });
  });

  it("returns 404 for unknown or malformed list ids", async () => {
    for (const listId of [MISSING, "not-a-uuid"]) {
      expect((await call(listRoute.DELETE, req("DELETE"), { listId })).status).toBe(404);
      expect((await call(itemsRoute.GET, req("GET"), { listId })).json).toEqual({ error: "not_found" });
      expect((await createItem(listId, { name: "חלב" })).status).toBe(404);
    }
  });
});

describe("items", () => {
  it("creates an item with exactly 10 fields and defaults", async () => {
    const list = await createList("קניות");
    const { status, json } = await createItem(list.id, { name: "חלב" });
    expect(status).toBe(201);
    expect(Object.keys(json).sort()).toEqual(ITEM_KEYS);
    expect(json).toMatchObject({
      list_id: list.id,
      name: "חלב",
      quantity: "1",
      category: "כללי",
      notes: null,
      status: "open",
      added_by: "instinct",
    });
    expect(json.created_at).toMatch(ISO);
    expect(json.updated_at).toMatch(ISO);
  });

  it("stores Hebrew text exactly, trimming only the ends", async () => {
    const list = await createList("קניות");
    const body = {
      name: "  גבינה  לבנה 5%  ",
      quantity: " חצי קילו ",
      category: " מוצרי  חלב ",
      notes: "  של \"תנובה\"\nאם אין – אחרת  ",
      added_by: "web",
    };
    const { json } = await createItem(list.id, body);
    expect(json).toMatchObject({
      name: "גבינה  לבנה 5%",
      quantity: "חצי קילו",
      category: "מוצרי  חלב",
      notes: "של \"תנובה\"\nאם אין – אחרת",
      added_by: "web",
    });
    expect((await openItems(list.id)).items[0]).toEqual(json);
  });

  it("does not dedupe items with the same name", async () => {
    const list = await createList("קניות");
    const a = (await createItem(list.id, { name: "לחם" })).json;
    const b = (await createItem(list.id, { name: "לחם" })).json;
    expect(a.id).not.toBe(b.id);
    expect((await openItems(list.id)).items).toHaveLength(2);
  });

  it.each([
    [{}, "missing name"],
    [{ name: "" }, "empty name"],
    [{ name: 1 }, "wrong name type"],
    [{ name: "a", quantity: 2 }, "numeric quantity"],
    [{ name: "a", quantity: "" }, "empty quantity"],
    [{ name: "a", category: "" }, "empty category"],
    [{ name: "a", notes: 5 }, "numeric notes"],
    [{ name: "a", notes: ["x"] }, "array notes"],
    [{ name: "x".repeat(121) }, "long name"],
    [{ name: "a", quantity: "x".repeat(41) }, "long quantity"],
    [{ name: "a", category: "x".repeat(61) }, "long category"],
    [{ name: "a", notes: "x".repeat(1001) }, "long notes"],
  ])("rejects %j (%s) with 400", async (body, _label) => {
    const list = await createList("קניות");
    const { status, json } = await createItem(list.id, body);
    expect(status).toBe(400);
    expect(json.error).toBe("validation");
  });

  it("GET returns open items only, sorted by category then name, isolated per list", async () => {
    const a = await createList("א");
    const b = await createList("ב");
    await createItem(a.id, { name: "עגבניות", category: "ירקות" });
    await createItem(a.id, { name: "חלב", category: "מוצרי חלב" });
    await createItem(a.id, { name: "מלפפון", category: "ירקות" });
    const bought = (await createItem(a.id, { name: "ביצים", category: "ביצים" })).json;
    await patch(bought.id, { status: "bought" });
    await createItem(b.id, { name: "אוהל", category: "ציוד" });

    const { json } = await call(itemsRoute.GET, req("GET"), { listId: a.id });
    expect(Object.keys(json)).toEqual(["items"]);
    expect(json.items.map((i: { category: string; name: string }) => `${i.category}/${i.name}`)).toEqual([
      "ירקות/מלפפון",
      "ירקות/עגבניות",
      "מוצרי חלב/חלב",
    ]);
    expect(json.items.every((i: { list_id: string; status: string }) => i.list_id === a.id && i.status === "open")).toBe(true);
    expect((await openItems(b.id)).items.map((i: { name: string }) => i.name)).toEqual(["אוהל"]);
  });

  it("returns {items: []} for an empty list", async () => {
    const list = await createList("ריקה");
    expect(await openItems(list.id)).toEqual({ items: [] });
  });
});

describe("PATCH /api/items/:id", () => {
  it("updates a subset of fields and bumps updated_at", async () => {
    const list = await createList("קניות");
    const item = (await createItem(list.id, { name: "חלב", quantity: "2", category: "מוצרי חלב" })).json;
    const { status, json } = await patch(item.id, { quantity: "3 חבילות" });
    expect(status).toBe(200);
    expect(Object.keys(json).sort()).toEqual(ITEM_KEYS);
    expect(json).toEqual({ ...item, quantity: "3 חבילות", updated_at: json.updated_at });
    expect(new Date(json.updated_at).getTime()).toBeGreaterThan(new Date(item.updated_at).getTime());
  });

  it("marks bought (leaves open GET) and restores with status open, same id", async () => {
    const list = await createList("קניות");
    const item = (await createItem(list.id, { name: "חלב" })).json;
    const bought = await patch(item.id, { status: "bought" });
    expect(bought.json.status).toBe("bought");
    expect((await openItems(list.id)).items).toEqual([]);

    const restored = await patch(item.id, { status: "open" });
    expect(restored.json).toMatchObject({ id: item.id, list_id: list.id, status: "open" });
    expect((await openItems(list.id)).items.map((i: { id: string }) => i.id)).toEqual([item.id]);
  });

  it("sets, edits and clears notes", async () => {
    const list = await createList("קניות");
    const item = (await createItem(list.id, { name: "חלב", notes: "3%" })).json;
    expect(item.notes).toBe("3%");
    expect((await patch(item.id, { notes: "1%" })).json.notes).toBe("1%");
    expect((await patch(item.id, { notes: null })).json.notes).toBeNull();
    expect((await patch(item.id, { notes: "חדש" })).json.notes).toBe("חדש");
  });

  it.each([
    [{}, "empty body"],
    [{ status: "done" }, "unknown status"],
    [{ status: "Bought" }, "wrong-case status"],
    [{ name: "" }, "empty name"],
    [{ notes: 1 }, "numeric notes"],
    [{ quantity: 3 }, "numeric quantity"],
    [{ category: "x".repeat(61) }, "long category"],
    [{ added_by: "web" }, "only non-patchable fields"],
  ])("rejects %j (%s) with 400", async (body, _label) => {
    const list = await createList("קניות");
    const item = (await createItem(list.id, { name: "חלב" })).json;
    const { status, json } = await patch(item.id, body);
    expect(status).toBe(400);
    expect(json.error).toBe("validation");
  });

  it("rejects malformed JSON and returns 404 for unknown ids", async () => {
    expect((await patch(MISSING, undefined, { raw: "nope" })).status).toBe(400);
    expect((await patch(MISSING, { name: "x" })).json).toEqual({ error: "not_found" });
    expect((await patch("not-a-uuid", { name: "x" })).status).toBe(404);
  });
});

describe("DELETE /api/items/:id", () => {
  it("deletes an item (204, empty body), then 404", async () => {
    const list = await createList("קניות");
    const item = (await createItem(list.id, { name: "חלב" })).json;
    const del = await call(itemRoute.DELETE, req("DELETE"), { id: item.id });
    expect(del.status).toBe(204);
    expect(del.text).toBe("");
    expect((await call(itemRoute.DELETE, req("DELETE"), { id: item.id })).json).toEqual({ error: "not_found" });
  });
});
