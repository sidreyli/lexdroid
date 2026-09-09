"use client";

/**
 * Verdicts live in this browser until the backend accepts them. Nothing here reaches
 * the store, so the workbench says so wherever a decision is recorded.
 */
import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { ReviewDecision } from "@/lib/review";

const KEY = "lexdroid.review.v1";
const REVIEWER_KEY = "lexdroid.reviewer.v1";
const NOBODY = "Unsigned";
const NONE: Record<number, ReviewDecision> = {};

const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Record<number, ReviewDecision> } = {
  raw: null,
  value: NONE,
};

function announce() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", announce);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", announce);
  };
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A blocked or full store just means the verdict lasts as long as the page does.
  }
  announce();
}

/** Parsed once per stored string so the snapshot stays referentially stable. */
function readDecisions(): Record<number, ReviewDecision> {
  const raw = read(KEY);
  if (raw !== cached.raw) {
    let value = NONE;
    try {
      if (raw) value = JSON.parse(raw) as Record<number, ReviewDecision>;
    } catch {
      value = NONE;
    }
    cached = { raw, value };
  }
  return cached.value;
}

function readReviewer(): string {
  return read(REVIEWER_KEY) || NOBODY;
}

interface ReviewStore {
  decisions: Record<number, ReviewDecision>;
  reviewer: string;
  setReviewer: (name: string) => void;
  record: (decision: ReviewDecision) => void;
  clear: (rowId: number) => void;
}

const Ctx = createContext<ReviewStore | null>(null);

export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const decisions = useSyncExternalStore(subscribe, readDecisions, () => NONE);
  const reviewer = useSyncExternalStore(subscribe, readReviewer, () => NOBODY);

  const value = useMemo<ReviewStore>(
    () => ({
      decisions,
      reviewer,
      setReviewer: (name) => write(REVIEWER_KEY, name.trim() || NOBODY),
      record: (decision) =>
        write(KEY, JSON.stringify({ ...decisions, [decision.rowId]: decision })),
      clear: (rowId) => {
        const next = { ...decisions };
        delete next[rowId];
        write(KEY, JSON.stringify(next));
      },
    }),
    [decisions, reviewer],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReview(): ReviewStore {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useReview must be used inside ReviewProvider");
  return ctx;
}
