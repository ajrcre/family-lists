"use client";
import { useState } from "react";
import type { Item } from "@/lib/repo";
import { LIMITS } from "@/lib/validation";
import { deleteItemAction, setItemStatusAction, updateItemAction } from "@/app/actions";
import { useAction } from "./useAction";
import { CategoryField } from "./CategoryField";

export function ItemRow({ item, categories }: { item: Item; categories: string[] }) {
  const [editing, setEditing] = useState(false);
  const action = useAction();

  if (editing) {
    return (
      <li className="item editing">
        <form
          className="edit-form"
          action={(form) => action.run(() => updateItemAction(item.id, form), () => setEditing(false))}
        >
          <label>
            שם
            <input name="name" defaultValue={item.name} maxLength={LIMITS.itemName} required autoFocus />
          </label>
          <label>
            כמות
            <input name="quantity" defaultValue={item.quantity} maxLength={LIMITS.quantity} />
          </label>
          <CategoryField categories={categories} defaultValue={item.category} />
          <label>
            הערות
            <textarea name="notes" defaultValue={item.notes ?? ""} maxLength={LIMITS.notes} rows={2} />
          </label>
          <div className="row">
            <button className="btn primary" disabled={action.pending}>
              שמירה
            </button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              ביטול
            </button>
            <button
              type="button"
              className="btn danger-outline push"
              disabled={action.pending}
              onClick={() => action.run(() => deleteItemAction(item.id))}
            >
              מחיקה
            </button>
          </div>
          {action.error && <p className="error">{action.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className={`item${action.pending ? " pending" : ""}`}>
      <button
        className="check"
        aria-label={`סימון "${item.name}" כנקנה`}
        disabled={action.pending}
        onClick={() => action.run(() => setItemStatusAction(item.id, "bought"))}
      />
      <button className="item-body" onClick={() => setEditing(true)} aria-label={`עריכת "${item.name}"`}>
        <span className="item-line">
          <span className="item-name">{item.name}</span>
          <span className="qty-badge">{item.quantity}</span>
        </span>
        {item.notes && <span className="notes">{item.notes}</span>}
      </button>
      {action.error && <p className="error">{action.error}</p>}
    </li>
  );
}

export function BoughtRow({ item }: { item: Item }) {
  const action = useAction();
  return (
    <li className="item bought">
      <span className="item-body static">
        <span className="item-line">
          <span className="item-name">{item.name}</span>
          <span className="qty-badge">{item.quantity}</span>
        </span>
        {item.notes && <span className="notes">{item.notes}</span>}
      </span>
      <button
        className="btn small"
        disabled={action.pending}
        aria-label={`החזרת "${item.name}" לרשימה`}
        onClick={() => action.run(() => setItemStatusAction(item.id, "open"))}
      >
        החזרה
      </button>
      {action.error && <p className="error">{action.error}</p>}
    </li>
  );
}
