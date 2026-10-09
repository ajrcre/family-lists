import { describe, expect, it } from "vitest";
import * as repo from "@/lib/repo";
import { parseItemInput } from "@/lib/validation";

describe("renameCategory", () => {
  it("renames a category for every item (open and bought) in one list only", async () => {
    const a = await repo.createList("א");
    const b = await repo.createList("ב");
    const open = (await repo.createItem(a.id, parseItemInput({ name: "חלב", category: "חלבי" })))!;
    const bought = (await repo.createItem(a.id, parseItemInput({ name: "גבינה", category: "חלבי" })))!;
    await repo.updateItem(bought.id, { status: "bought" });
    const other = (await repo.createItem(b.id, parseItemInput({ name: "יוגורט", category: "חלבי" })))!;

    expect(await repo.renameCategory(a.id, "חלבי", "מוצרי חלב")).toBe(2);
    expect((await repo.getItem(open.id))!.category).toBe("מוצרי חלב");
    expect((await repo.getItem(bought.id))!.category).toBe("מוצרי חלב");
    expect((await repo.getItem(other.id))!.category).toBe("חלבי");
    expect(await repo.listCategories(a.id)).toEqual(["מוצרי חלב"]);
  });
});
