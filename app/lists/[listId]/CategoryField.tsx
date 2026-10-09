"use client";
import { useId, useState } from "react";
import { DEFAULT_CATEGORY, LIMITS } from "@/lib/validation";

/**
 * Free-text category input with the list's existing categories as tappable chips.
 * Typing a name that does not exist yet creates a new category.
 */
export function CategoryField({
  categories,
  defaultValue = "",
}: {
  categories: string[];
  defaultValue?: string;
}) {
  const id = useId();
  const [value, setValue] = useState(defaultValue);
  const suggestions = categories.filter((c) => c !== value);
  return (
    <div className="field">
      <label htmlFor={id}>קטגוריה</label>
      <input
        id={id}
        name="category"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`למשל: ירקות. ריק = ${DEFAULT_CATEGORY}`}
        maxLength={LIMITS.category}
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <div className="chips" aria-label="קטגוריות קיימות">
          {suggestions.map((c) => (
            <button key={c} type="button" className="chip" onClick={() => setValue(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
