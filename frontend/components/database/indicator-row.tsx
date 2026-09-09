import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { clip, relativeTime } from "@/lib/format";
import type { CoverageState, EconomyIndicatorRow } from "@/lib/data/types";

const stateLabel: Record<CoverageState, string> = {
  restricted: "Measure found",
  "no-restriction": "No restriction",
  unresolved: "Unresolved",
  "not-attempted": "Not attempted",
};

const scoreTone: Record<CoverageState, string> = {
  restricted: "bg-navy text-paper",
  "no-restriction": "bg-inset text-muted-foreground ring-1 ring-edge",
  unresolved: "bg-ochre-soft text-ochre",
  "not-attempted": "bg-inset/60 text-muted-foreground/70",
};

/** One indicator on an economy's page: the score, what it met, and what it rests on. */
export function IndicatorRow({ economy, row }: { economy: string; row: EconomyIndicatorRow }) {
  const attempted = row.state !== "not-attempted";
  const body = (
    <>
      <span className="tnum text-[12.5px] leading-6 font-medium text-navy">{row.indicatorId}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-6 text-ink">{clip(row.category, 140)}</span>
        {row.bandCriterion ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
            {row.bandCriterion}
          </span>
        ) : null}
        {row.unresolvedReason ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-ochre">
            {row.unresolvedReason}
          </span>
        ) : null}
        {row.instrument ? (
          <span className="mt-1 block truncate text-[12px] text-muted-foreground/85">
            {row.instrument}
            {row.answeredAt ? ` · answered ${relativeTime(row.answeredAt)}` : ""}
          </span>
        ) : null}
      </span>
      <span className="flex items-center justify-end gap-2.5">
        <span className="text-right text-[12px] whitespace-nowrap text-muted-foreground">
          {stateLabel[row.state]}
        </span>
        {row.score === null ? (
          <span className="h-8 w-12 shrink-0 rounded-full ring-1 ring-edge ring-inset" />
        ) : (
          <span
            className={cn(
              "tnum grid h-8 w-12 shrink-0 place-items-center rounded-full text-[12.5px] font-medium",
              scoreTone[row.state],
            )}
          >
            {row.score.toFixed(2)}
          </span>
        )}
        <ChevronRight
          className={cn("size-4 shrink-0", attempted ? "text-muted-foreground" : "opacity-0")}
        />
      </span>
    </>
  );

  const shape =
    "grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-4 border-b border-edge/60 px-2 py-3 last:border-b-0";

  if (!attempted) {
    return <div className={cn(shape, "opacity-60")}>{body}</div>;
  }
  return (
    <Link
      href={`/database/${economy.toLowerCase()}/${row.indicatorId}`}
      className={cn(shape, "rounded-xl transition-colors hover:bg-inset/70")}
    >
      {body}
    </Link>
  );
}
