"use server";
// Server Actions for the web UI. Each one checks the web session itself and goes
// through the same repository as the JSON API.
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/web";
import * as repo from "@/lib/repo";
import {
  DEFAULT_CATEGORY,
  DEFAULT_QUANTITY,
  parseCategory,
  parseItemInput,
  parseItemPatch,
  parseListName,
  ValidationError,
  type Status,
} from "@/lib/validation";

export type ActionResult = { error?: string };

const WEB_ADDED_BY = "web";

const ERRORS = {
  invalid: "יש לבדוק את הערכים שהוזנו",
  notFound: "הפריט או הרשימה לא נמצאו. ייתכן שנמחקו.",
  failed: "משהו השתבש. נסו שוב.",
};

async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  await requireSession();
  try {
    const found = await fn();
    refresh();
    return found === null || found === false ? { error: ERRORS.notFound } : {};
  } catch (err) {
    if (err instanceof ValidationError) return { error: ERRORS.invalid };
    console.error("Action error:", err);
    return { error: ERRORS.failed };
  }
}

const field = (form: FormData, name: string) => {
  const v = form.get(name);
  return typeof v === "string" ? v : undefined;
};

/* ---------- lists ---------- */

export async function createListAction(form: FormData): Promise<ActionResult> {
  await requireSession();
  let id: string;
  try {
    id = (await repo.createList(parseListName(field(form, "name") ?? ""))).id;
  } catch (err) {
    if (err instanceof ValidationError) return { error: ERRORS.invalid };
    console.error("Action error:", err);
    return { error: ERRORS.failed };
  }
  redirect(`/lists/${id}`);
}

export async function renameListAction(listId: string, form: FormData): Promise<ActionResult> {
  return run(() => repo.renameList(listId, parseListName(field(form, "name") ?? "")));
}

export async function deleteListAction(listId: string): Promise<ActionResult> {
  await requireSession();
  try {
    await repo.deleteList(listId);
  } catch (err) {
    console.error("Action error:", err);
    return { error: ERRORS.failed };
  }
  redirect("/");
}

/* ---------- items ---------- */

export async function addItemAction(listId: string, form: FormData): Promise<ActionResult> {
  return run(() => {
    const quantity = field(form, "quantity")?.trim();
    const category = field(form, "category")?.trim();
    const input = parseItemInput(
      {
        name: field(form, "name") ?? "",
        // Empty optional fields in the form fall back to the defaults.
        quantity: quantity || undefined,
        category: category || undefined,
        notes: field(form, "notes") ?? null,
      },
      WEB_ADDED_BY,
    );
    return repo.createItem(listId, input);
  });
}

export async function updateItemAction(itemId: string, form: FormData): Promise<ActionResult> {
  return run(() => {
    const quantity = field(form, "quantity")?.trim();
    const category = field(form, "category")?.trim();
    const patch = parseItemPatch({
      name: field(form, "name") ?? "",
      quantity: quantity || DEFAULT_QUANTITY,
      category: category || DEFAULT_CATEGORY,
      notes: field(form, "notes") ?? null,
    });
    return repo.updateItem(itemId, patch);
  });
}

export async function setItemStatusAction(itemId: string, status: Status): Promise<ActionResult> {
  return run(() => repo.updateItem(itemId, parseItemPatch({ status })));
}

export async function deleteItemAction(itemId: string): Promise<ActionResult> {
  return run(() => repo.deleteItem(itemId));
}

/* ---------- categories ---------- */
// Categories are free text stored on each item; these act on all items of one list.

export async function renameCategoryAction(listId: string, from: string, form: FormData): Promise<ActionResult> {
  return run(() => repo.renameCategory(listId, from, parseCategory(field(form, "category") ?? "")));
}

/** Moves the category's items to the default category; no item is deleted. */
export async function removeCategoryAction(listId: string, category: string): Promise<ActionResult> {
  return run(() => repo.renameCategory(listId, category, DEFAULT_CATEGORY));
}
