"use client";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/app/actions";

/** Runs a Server Action in a transition and keeps its Hebrew error message, if any. */
export function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<ActionResult | void>, onOk?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res && res.error) setError(res.error);
      else {
        setError(undefined);
        onOk?.();
      }
    });
  return { pending, error, run };
}
