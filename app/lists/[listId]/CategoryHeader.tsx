"use client";
import { useState } from "react";
import { DEFAULT_CATEGORY, LIMITS } from "@/lib/validation";
import { removeCategoryAction, renameCategoryAction } from "@/app/actions";
import { useAction } from "./useAction";

/** Category heading with inline rename / remove for every item of this list in it. */
export function CategoryHeader({ listId, category }: { listId: string; category: string }) {
  const [editing, setEditing] = useState(false);
  const action = useAction();
  const isDefault = category === DEFAULT_CATEGORY;

  if (!editing) {
    return (
      <div className="group-head">
        <h2 className="group-title">{category}</h2>
        <button
          type="button"
          className="btn link small"
          aria-label={`עריכת הקטגוריה "${category}"`}
          onClick={() => setEditing(true)}
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <div className="panel category-panel">
      <form
        className="inline-form"
        action={(form) =>
          action.run(() => renameCategoryAction(listId, category, form), () => setEditing(false))
        }
      >
        <input
          name="category"
          defaultValue={category}
          aria-label="שם הקטגוריה"
          maxLength={LIMITS.category}
          required
          autoFocus
        />
        <button className="btn primary" disabled={action.pending}>
          שמירה
        </button>
      </form>
      <div className="row">
        {!isDefault && (
          <button
            type="button"
            className="btn danger-outline"
            disabled={action.pending}
            onClick={() => action.run(() => removeCategoryAction(listId, category))}
          >
            הסרת הקטגוריה
          </button>
        )}
        <button type="button" className="btn" onClick={() => setEditing(false)}>
          ביטול
        </button>
      </div>
      {!isDefault && <p className="muted small-text">בהסרה, הפריטים עוברים ל{DEFAULT_CATEGORY}. שום פריט לא נמחק.</p>}
      {action.error && <p className="error">{action.error}</p>}
    </div>
  );
}
