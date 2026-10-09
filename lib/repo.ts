// The single data-access layer. Both the JSON API and the web UI go through
// these functions, so they always read and write the same data.
import { randomUUID } from "node:crypto";
import { query, type Row } from "./db";
import type { ItemInput, ItemPatch } from "./validation";

export interface List {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: string;
  list_id: string;
  name: string;
  quantity: string;
  category: string;
  notes: string | null;
  status: "open" | "bought";
  added_by: string;
  created_at: string;
  updated_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isId = (id: string) => UUID_RE.test(id);

const iso = (value: unknown) => new Date(value as string | Date).toISOString();

// Serializers pick fields explicitly so internal columns (e.g. bought_at) never leak.
export function toList(r: Row): List {
  return {
    id: String(r.id),
    name: String(r.name),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

export function toItem(r: Row): Item {
  return {
    id: String(r.id),
    list_id: String(r.list_id),
    name: String(r.name),
    quantity: String(r.quantity),
    category: String(r.category),
    notes: r.notes === null || r.notes === undefined ? null : String(r.notes),
    status: r.status as Item["status"],
    added_by: String(r.added_by),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

// updated_at always moves forward, even for two updates within the same millisecond.
const BUMP = `GREATEST($1::timestamptz, updated_at + interval '1 millisecond')`;

/* ---------- lists ---------- */

export async function listLists(): Promise<List[]> {
  const rows = await query(`SELECT * FROM lists ORDER BY created_at, id`);
  return rows.map(toList);
}

export async function getList(id: string): Promise<List | null> {
  if (!isId(id)) return null;
  const rows = await query(`SELECT * FROM lists WHERE id = $1`, [id]);
  return rows[0] ? toList(rows[0]) : null;
}

export async function createList(name: string): Promise<List> {
  const now = new Date().toISOString();
  const rows = await query(
    `INSERT INTO lists (id, name, created_at, updated_at) VALUES ($1, $2, $3, $3) RETURNING *`,
    [randomUUID(), name, now],
  );
  return toList(rows[0]);
}

export async function renameList(id: string, name: string): Promise<List | null> {
  if (!isId(id)) return null;
  const rows = await query(
    `UPDATE lists SET name = $3, updated_at = ${BUMP} WHERE id = $2 RETURNING *`,
    [new Date().toISOString(), id, name],
  );
  return rows[0] ? toList(rows[0]) : null;
}

/** Deletes the list and (via ON DELETE CASCADE) all of its items. */
export async function deleteList(id: string): Promise<boolean> {
  if (!isId(id)) return false;
  const rows = await query(`DELETE FROM lists WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}

/* ---------- items ---------- */

/** Open items of one list, sorted by category, then name (byte order, deterministic). */
export async function listOpenItems(listId: string): Promise<Item[]> {
  const rows = await query(
    `SELECT * FROM items WHERE list_id = $1 AND status = 'open'
     ORDER BY category COLLATE "C", name COLLATE "C", created_at, id`,
    [listId],
  );
  return rows.map(toItem);
}

export async function listRecentlyBought(listId: string, days = 7, limit = 30): Promise<Item[]> {
  const rows = await query(
    `SELECT * FROM items
     WHERE list_id = $1 AND status = 'bought' AND bought_at > now() - make_interval(days => $2)
     ORDER BY bought_at DESC, id LIMIT $3`,
    [listId, days, limit],
  );
  return rows.map(toItem);
}

export async function listCategories(listId: string): Promise<string[]> {
  const rows = await query(
    `SELECT DISTINCT category FROM items WHERE list_id = $1 ORDER BY category`,
    [listId],
  );
  return rows.map((r) => String(r.category));
}

/**
 * Renames a category for every item (open and bought) in one list.
 * Returns the number of items changed.
 */
export async function renameCategory(listId: string, from: string, to: string): Promise<number> {
  if (!isId(listId) || from === to) return 0;
  const rows = await query(
    `UPDATE items SET category = $4, updated_at = ${BUMP}
     WHERE list_id = $2 AND category = $3 RETURNING id`,
    [new Date().toISOString(), listId, from, to],
  );
  return rows.length;
}

export async function getItem(id: string): Promise<Item | null> {
  if (!isId(id)) return null;
  const rows = await query(`SELECT * FROM items WHERE id = $1`, [id]);
  return rows[0] ? toItem(rows[0]) : null;
}

/** Returns null when the list does not exist. */
export async function createItem(listId: string, input: ItemInput): Promise<Item | null> {
  if (!isId(listId)) return null;
  const now = new Date().toISOString();
  const rows = await query(
    `INSERT INTO items (id, list_id, name, quantity, category, notes, status, added_by, created_at, updated_at)
     SELECT $1, l.id, $3, $4, $5, $6, 'open', $7, $8, $8 FROM lists l WHERE l.id = $2
     RETURNING *`,
    [randomUUID(), listId, input.name, input.quantity, input.category, input.notes, input.added_by, now],
  );
  return rows[0] ? toItem(rows[0]) : null;
}

/** Applies a partial update. Returns null when the item does not exist. */
export async function updateItem(id: string, patch: ItemPatch): Promise<Item | null> {
  if (!isId(id)) return null;
  const params: unknown[] = [new Date().toISOString(), id];
  const sets: string[] = [`updated_at = ${BUMP}`];
  const set = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (patch.name !== undefined) set("name", patch.name);
  if (patch.quantity !== undefined) set("quantity", patch.quantity);
  if (patch.category !== undefined) set("category", patch.category);
  if (patch.notes !== undefined) set("notes", patch.notes);
  if (patch.status !== undefined) {
    set("status", patch.status);
    // Remember when it was bought (for the "recently bought" view); restoring clears it.
    // Re-marking an already bought item keeps the original time.
    sets.push(
      patch.status === "bought"
        ? `bought_at = CASE WHEN status = 'bought' THEN bought_at ELSE $1::timestamptz END`
        : `bought_at = NULL`,
    );
  }
  const rows = await query(`UPDATE items SET ${sets.join(", ")} WHERE id = $2 RETURNING *`, params);
  return rows[0] ? toItem(rows[0]) : null;
}

export async function deleteItem(id: string): Promise<boolean> {
  if (!isId(id)) return false;
  const rows = await query(`DELETE FROM items WHERE id = $1 RETURNING id`, [id]);
  return rows.length > 0;
}
