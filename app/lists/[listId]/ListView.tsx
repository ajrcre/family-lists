"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item, List } from "@/lib/repo";
import { LAST_LIST_COOKIE } from "@/lib/ui";
import { LIMITS } from "@/lib/validation";
import { addItemAction, deleteListAction, renameListAction } from "@/app/actions";
import { ItemRow, BoughtRow } from "./ItemRow";
import { NewListForm } from "./NewListForm";
import { LogoutButton } from "./LogoutButton";
import { useAction } from "./useAction";
import { CategoryField } from "./CategoryField";
import { CategoryHeader } from "./CategoryHeader";

interface Props {
  list: List;
  lists: List[];
  items: Item[];
  recent: Item[];
  categories: string[];
}

/** Re-fetches server data when the app regains focus and every 30s while visible,
 *  so changes made through the API show up without a manual reload. */
function useAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    const timer = setInterval(refresh, 30_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
      clearInterval(timer);
    };
  }, [router]);
}

function groupByCategory(items: Item[]): [string, Item[]][] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const group = groups.get(item.category) ?? [];
    group.push(item);
    groups.set(item.category, group);
  }
  return [...groups.entries()];
}

type Panel = null | "menu" | "rename" | "new" | "delete";

export function ListView({ list, lists, items, recent, categories }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const groups = useMemo(() => groupByCategory(items), [items]);
  const action = useAction();
  useAutoRefresh();

  useEffect(() => {
    document.cookie = `${LAST_LIST_COOKIE}=${list.id}; path=/; max-age=31536000; samesite=lax`;
  }, [list.id]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-row">
          <select
            className="list-select"
            aria-label="בחירת רשימה"
            value={list.id}
            onChange={(e) => router.push(`/lists/${e.target.value}`)}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button
            className="btn icon"
            aria-label="רשימה חדשה"
            title="רשימה חדשה"
            onClick={() => setPanel(panel === "new" ? null : "new")}
          >
            ＋
          </button>
          <button
            className="btn icon"
            aria-label="אפשרויות רשימה"
            title="אפשרויות"
            aria-expanded={panel === "menu"}
            onClick={() => setPanel(panel === "menu" ? null : "menu")}
          >
            ⋯
          </button>
        </div>

        {panel === "new" && (
          <div className="panel">
            <NewListForm autoFocus onDone={() => setPanel(null)} />
          </div>
        )}
        {panel === "menu" && (
          <div className="panel menu">
            <button className="btn" onClick={() => setPanel("rename")}>
              שינוי שם הרשימה
            </button>
            <button className="btn danger-outline" onClick={() => setPanel("delete")}>
              מחיקת הרשימה
            </button>
            <LogoutButton />
          </div>
        )}
        {panel === "rename" && (
          <div className="panel">
            <form
              className="inline-form"
              action={(form) => action.run(() => renameListAction(list.id, form), () => setPanel(null))}
            >
              <input
                name="name"
                defaultValue={list.name}
                aria-label="שם הרשימה"
                maxLength={LIMITS.listName}
                required
                autoFocus
              />
              <button className="btn primary" disabled={action.pending}>
                שמירה
              </button>
              <button type="button" className="btn" onClick={() => setPanel(null)}>
                ביטול
              </button>
            </form>
          </div>
        )}
        {panel === "delete" && (
          <div className="panel confirm">
            <p>
              למחוק את הרשימה <strong>{list.name}</strong> ואת כל הפריטים שבה?
            </p>
            <div className="row">
              <button
                className="btn danger"
                disabled={action.pending}
                onClick={() => action.run(() => deleteListAction(list.id))}
              >
                כן, למחוק
              </button>
              <button className="btn" onClick={() => setPanel(null)}>
                ביטול
              </button>
            </div>
          </div>
        )}
        {action.error && <p className="error">{action.error}</p>}
      </header>

      <main className="page">
        <AddItemForm listId={list.id} categories={categories} />

        {items.length === 0 ? (
          <p className="empty muted">הרשימה ריקה 🎉</p>
        ) : (
          groups.map(([category, group]) => (
            <section key={category} className="group" aria-label={category}>
              <CategoryHeader listId={list.id} category={category} />
              <ul className="items">
                {group.map((item) => (
                  <ItemRow key={item.id} item={item} categories={categories} />
                ))}
              </ul>
            </section>
          ))
        )}

        {recent.length > 0 && (
          <details className="recent">
            <summary>נקנו לאחרונה ({recent.length})</summary>
            <ul className="items">
              {recent.map((item) => (
                <BoughtRow key={item.id} item={item} />
              ))}
            </ul>
          </details>
        )}
      </main>
    </>
  );
}

function AddItemForm({ listId, categories }: { listId: string; categories: string[] }) {
  const [notes, setNotes] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const action = useAction();
  return (
    <form
      key={formKey}
      className="add-form"
      action={(form) =>
        action.run(() => addItemAction(listId, form), () => {
          setFormKey((k) => k + 1);
          setNotes(false);
        })
      }
    >
      <div className="add-row">
        <input
          name="name"
          className="grow"
          placeholder="מה להוסיף?"
          aria-label="שם הפריט"
          maxLength={LIMITS.itemName}
          required
          autoComplete="off"
        />
        <input
          name="quantity"
          className="qty"
          placeholder="כמות"
          aria-label="כמות"
          maxLength={LIMITS.quantity}
          autoComplete="off"
        />
        <button className="btn primary" disabled={action.pending} aria-label="הוספה">
          הוספה
        </button>
      </div>
      <CategoryField categories={categories} />
      {notes ? (
        <div className="field">
          <label htmlFor="add-notes">הערות</label>
          <textarea id="add-notes" name="notes" maxLength={LIMITS.notes} rows={2} autoFocus />
        </div>
      ) : (
        <button type="button" className="btn link small" onClick={() => setNotes(true)}>
          + הערה
        </button>
      )}
      {action.error && <p className="error">{action.error}</p>}
    </form>
  );
}
