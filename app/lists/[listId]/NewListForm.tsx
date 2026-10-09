"use client";
import { useState, useTransition } from "react";
import { createListAction } from "@/app/actions";
import { LIMITS } from "@/lib/validation";

export function NewListForm({ autoFocus, onDone }: { autoFocus?: boolean; onDone?: () => void }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  return (
    <form
      className="inline-form"
      action={(form) =>
        start(async () => {
          const res = await createListAction(form);
          if (res?.error) setError(res.error);
          else onDone?.();
        })
      }
    >
      <input
        name="name"
        placeholder="שם הרשימה החדשה"
        aria-label="שם הרשימה החדשה"
        maxLength={LIMITS.listName}
        required
        autoFocus={autoFocus}
      />
      <button className="btn primary" disabled={pending}>
        יצירה
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
