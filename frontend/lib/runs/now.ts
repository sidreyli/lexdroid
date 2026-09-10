"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, shared by everything that counts seconds, so one timer serves the page.
 * Null on the server: a run's elapsed time is not something the server can render honestly.
 */
let seconds = Math.floor(Date.now() / 1000);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    seconds = Math.floor(Date.now() / 1000);
    for (const l of listeners) l();
  }, 1000);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => seconds,
    () => null,
  );
}

/** Seconds since an instant, or null before the browser has a clock to measure against. */
export function useSecondsSince(iso: string | null): number | null {
  const now = useNow();
  if (now === null || iso === null) return null;
  return Math.max(0, now - Math.floor(new Date(iso).getTime() / 1000));
}
