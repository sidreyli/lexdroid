import { cn } from "@/lib/utils";
import type { PillarLeg } from "@/lib/runs/progress";

/** A pillar that finished having settled fewer cells than it holds is worth an analyst's eye. */
const short = (leg: PillarLeg) => leg.state === "done" && leg.answered < leg.indicators;

/**
 * The run's course, drawn to scale. A leg is as wide as the work it holds, so a pillar of
 * seven indicators looks seven times a pillar of one and the fill means what it says.
 */
export function PillarTrack({
  legs,
  reading,
}: {
  legs: PillarLeg[];
  reading: { done: number; total: number } | null;
}) {
  const fill = reading && reading.total > 0 ? reading.done / reading.total : 0;
  const settled = legs.reduce((n, l) => n + l.answered, 0);
  const indicators = legs.reduce((n, l) => n + l.indicators, 0);
  const shortfall = legs.filter(short).map((l) => l.id);

  return (
    <div>
      <div className="flex items-end gap-1">
        {legs.map((leg) => (
          <div key={leg.id} className="min-w-0" style={{ flexGrow: leg.indicators, flexBasis: 0 }}>
            <div className="mb-1.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "tnum text-[12px] font-semibold",
                  leg.state === "waiting" ? "text-muted-foreground/60" : "text-navy",
                )}
              >
                {leg.id}
              </span>
              {leg.state === "reading" ? (
                <span className="truncate text-[12px] leading-tight text-ochre">{leg.name}</span>
              ) : null}
            </div>

            <div
              className={cn(
                "h-2.5 w-full overflow-hidden rounded-[3px]",
                leg.state === "done" && "bg-navy",
                leg.state === "reading" && "bg-ochre-soft",
                leg.state === "waiting" && "bg-[#dedad1]",
              )}
              role="img"
              aria-label={
                leg.state === "done"
                  ? `Pillar ${leg.id}, ${leg.name}, finished, ${leg.answered} cells answered`
                  : leg.state === "reading"
                    ? `Pillar ${leg.id}, ${leg.name}, reading now, ${Math.round(fill * 100)} per cent through`
                    : `Pillar ${leg.id}, ${leg.name}, not started`
              }
            >
              {leg.state === "reading" ? (
                <div
                  className="h-full rounded-[3px] bg-ochre transition-[width] duration-700 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(2, fill * 100)}%` }}
                />
              ) : null}
            </div>

            {/* The narrowest pillar holds one indicator, so on a phone these numbers would collide. */}
            <p
              className={cn(
                "tnum mt-1.5 hidden text-[11.5px] leading-tight sm:block",
                short(leg) ? "text-ochre" : "text-muted-foreground",
              )}
            >
              {leg.state === "waiting" ? "" : `${leg.answered}/${leg.indicators}`}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
        {settled} of {indicators} cells settled. Each bar is a pillar, drawn as wide as the
        indicators it holds.
        {shortfall.length > 0
          ? ` Pillar ${shortfall.join(" and ")} finished without settling all of its cells.`
          : ""}
      </p>
    </div>
  );
}
