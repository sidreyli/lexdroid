import { cn } from "@/lib/utils";
import type { ScoreBand } from "@/lib/data/types";

/** Every band the rubric offers for this indicator, with the one the answer met. */
export function BandLadder({ bands, met }: { bands: ScoreBand[]; met: number | null }) {
  return (
    <ul className="flex flex-col gap-1">
      {[...bands]
        .sort((a, b) => b.score - a.score)
        .map((b) => {
          const on = met !== null && b.ordinal === met;
          return (
            <li
              key={b.ordinal}
              className={cn(
                "grid grid-cols-[3rem_minmax(0,1fr)] items-baseline gap-3 rounded-xl px-3 py-2 transition-colors",
                on ? "bg-navy text-paper" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "tnum text-[13px] font-medium",
                  on ? "text-paper" : "text-navy-deep/70",
                )}
              >
                {b.score.toFixed(2)}
              </span>
              <span className="text-[13px] leading-snug">{b.criterion}</span>
            </li>
          );
        })}
    </ul>
  );
}
