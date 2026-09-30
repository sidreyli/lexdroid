"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { clip } from "@/lib/format";
import type { QueueItem } from "@/lib/data/types";
import { useReview } from "./review-store";

type Filter = "open" | "flagged" | "decided" | "all";

const filters: { key: Filter; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "flagged", label: "Flagged" },
  { key: "decided", label: "Decided" },
  { key: "all", label: "All" },
];

const decisionTone: Record<string, string> = {
  accept: "bg-navy",
  edit: "bg-ochre",
  reject: "bg-brick",
};

export function QueueRail({
  items,
  onPick,
}: {
  items: QueueItem[];
  onPick?: () => void;
}) {
  const { decisions } = useReview();
  const params = useParams<{ id?: string }>();
  const activeId = Number(params?.id);

  const [filter, setFilter] = useState<Filter>("open");
  const [economy, setEconomy] = useState<string | null>(null);
  const [term, setTerm] = useState("");

  const economies = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) seen.set(i.economy, i.economyName);
    return [...seen].map(([code, name]) => ({ code, name }));
  }, [items]);

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase();
    return items.filter((i) => {
      if (i.id === activeId) return true;
      const decided = Boolean(decisions[i.id]);
      if (filter === "open" && decided) return false;
      if (filter === "decided" && !decided) return false;
      if (filter === "flagged" && i.failedGates === 0) return false;
      if (economy && i.economy !== economy) return false;
      if (!q) return true;
      return (
        i.lawName.toLowerCase().includes(q) ||
        i.indicatorId.startsWith(q) ||
        i.category.toLowerCase().includes(q) ||
        i.economyName.toLowerCase().includes(q)
      );
    });
  }, [items, decisions, filter, economy, term, activeId]);

  const decidedCount = items.filter((i) => decisions[i.id]).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3.5 pt-3.5 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find a law or indicator"
            className="h-9 rounded-xl border-0 bg-inset pl-8.5 text-[13px] shadow-none"
          />
          {term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-navy-deep"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors",
                filter === f.key
                  ? "bg-navy text-paper"
                  : "text-muted-foreground hover:bg-inset hover:text-navy-deep",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div
          className={cn("mt-1.5 flex flex-wrap gap-1", economies.length < 2 && "hidden")}
        >
          {economies.map((e) => (
            <button
              key={e.code}
              type="button"
              onClick={() => setEconomy(economy === e.code ? null : e.code)}
              aria-pressed={economy === e.code}
              title={e.name}
              className={cn(
                "rounded-full px-2.5 py-1 text-[12px] transition-colors",
                economy === e.code
                  ? "bg-navy/10 font-medium text-navy"
                  : "text-muted-foreground hover:bg-inset hover:text-navy-deep",
              )}
            >
              {/* Codes once there are more than a few: the rail is 17rem and names took five rows. */}
              {economies.length > 4 ? e.code : e.name}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {shown.length === 0 ? (
          <p className="px-2 py-8 text-center text-[12.5px] leading-relaxed text-muted-foreground">
            {filter === "open" && decidedCount === items.length
              ? "Every finding has a verdict."
              : "Nothing here. Widen the filter."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {shown.map((item) => {
              const decision = decisions[item.id];
              const on = item.id === activeId;
              return (
                <li key={item.id}>
                  <Link
                    href={`/workbench/${item.id}`}
                    onClick={onPick}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
                      on ? "bg-card lift-sm" : "hover:bg-inset",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-[7px] size-[7px] shrink-0 rounded-full",
                        decision
                          ? decisionTone[decision.action]
                          : item.failedGates > 0
                            ? "bg-brick-soft ring-1 ring-brick/60"
                            : "bg-edge",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "tnum text-[13px] font-semibold",
                            on ? "text-navy" : "text-navy-deep",
                          )}
                        >
                          {item.indicatorId}
                        </span>
                        {economies.length > 1 ? (
                          <span className="truncate text-[12px] text-muted-foreground">
                            {item.economyName}
                          </span>
                        ) : null}
                        <span className="tnum ml-auto shrink-0 text-[12px] text-muted-foreground">
                          {item.score !== null ? item.score.toFixed(2) : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                        {clip(item.lawName, 44)}
                        {item.article ? `, s ${item.article}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-edge px-4 py-2.5">
        <p className="tnum text-[11.5px] text-muted-foreground">
          {shown.length} shown, {decidedCount} of {items.length} decided
        </p>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground/75">
          Press j and k to move through the queue
        </p>
      </div>
    </div>
  );
}
