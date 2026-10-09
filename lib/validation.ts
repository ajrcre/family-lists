// Input validation shared by the JSON API and the web UI.
// The only normalisation applied to text is trimming leading/trailing whitespace.

export const LIMITS = {
  listName: 80,
  itemName: 120,
  quantity: 40,
  category: 60,
  notes: 1000,
  addedBy: 40,
} as const;

export const DEFAULT_QUANTITY = "1";
export const DEFAULT_CATEGORY = "כללי";
export const DEFAULT_API_ADDED_BY = "instinct";

export const STATUSES = ["open", "bought"] as const;
export type Status = (typeof STATUSES)[number];

export class ValidationError extends Error {}

export interface ItemInput {
  name: string;
  quantity: string;
  category: string;
  notes: string | null;
  added_by: string;
}

export interface ItemPatch {
  name?: string;
  quantity?: string;
  category?: string;
  notes?: string | null;
  status?: Status;
}

type Body = Record<string, unknown>;

export function requireObject(body: unknown): Body {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("body must be a JSON object");
  }
  return body as Body;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new ValidationError(`${field} must not be empty`);
  if (trimmed.length > max) throw new ValidationError(`${field} must be at most ${max} characters`);
  return trimmed;
}

function notes(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new ValidationError("notes must be a string or null");
  const trimmed = value.trim();
  if (trimmed.length > LIMITS.notes) {
    throw new ValidationError(`notes must be at most ${LIMITS.notes} characters`);
  }
  return trimmed.length === 0 ? null : trimmed;
}

function status(value: unknown): Status {
  if (!STATUSES.includes(value as Status)) {
    throw new ValidationError('status must be "open" or "bought"');
  }
  return value as Status;
}

export function parseListName(value: unknown): string {
  return text(value, "name", LIMITS.listName);
}

export function parseCategory(value: unknown): string {
  return text(value, "category", LIMITS.category);
}

export function parseListInput(body: unknown): { name: string } {
  const b = requireObject(body);
  if (b.name === undefined) throw new ValidationError("name is required");
  return { name: parseListName(b.name) };
}

export function parseItemInput(body: unknown, defaultAddedBy = DEFAULT_API_ADDED_BY): ItemInput {
  const b = requireObject(body);
  if (b.name === undefined) throw new ValidationError("name is required");
  return {
    name: text(b.name, "name", LIMITS.itemName),
    quantity: b.quantity === undefined ? DEFAULT_QUANTITY : text(b.quantity, "quantity", LIMITS.quantity),
    category: b.category === undefined ? DEFAULT_CATEGORY : text(b.category, "category", LIMITS.category),
    notes: b.notes === undefined ? null : notes(b.notes),
    added_by: b.added_by === undefined ? defaultAddedBy : text(b.added_by, "added_by", LIMITS.addedBy),
  };
}

export function parseItemPatch(body: unknown): ItemPatch {
  const b = requireObject(body);
  const patch: ItemPatch = {};
  if (b.name !== undefined) patch.name = text(b.name, "name", LIMITS.itemName);
  if (b.quantity !== undefined) patch.quantity = text(b.quantity, "quantity", LIMITS.quantity);
  if (b.category !== undefined) patch.category = text(b.category, "category", LIMITS.category);
  if (b.notes !== undefined) patch.notes = notes(b.notes);
  if (b.status !== undefined) patch.status = status(b.status);
  if (Object.keys(patch).length === 0) {
    throw new ValidationError("body must include at least one of name, quantity, category, notes, status");
  }
  return patch;
}
