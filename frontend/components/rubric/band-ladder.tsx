import Link from "next/link";
import { cn } from "@/lib/utils";
import type { BookBand, Standing } from "@/lib/rubric/book";

const name: Record<string, string> = { AUS: "Australia", MYS: "Malaysia", SGP: "Singapore" };

/** Where an economy landed, sitting on the criterion it actually met. */
function Mark({ mark, indicatorId }: { mark: Standing; indicatorId: string }) {
  const quiet = mark.state === "no-restriction";
  return (
    <Link
      href={`/database/${mark.economy.toLowerCase()}/${indicatorId}`}
      title={`${name[mark.economy] ?? mark.economy} met this criterion`}
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10.5px] leading-none font-medium transition-colors",
        quiet
          ? "bg-inset text-muted-foreground ring-1 ring-edge hover:text-navy-deep"
          : "bg-navy text-paper hover:bg-navy-deep",
      )}
    >
      {mark.economy}
    </Link>
  );
}

/**
 * ESCAP's score bands, drawn as the steps they are. Every indicator has as many
 * steps as the methodology gives it, from two to five, and none are invented.
 */
export function BandLadder({ bands, indicatorId }: { bands: BookBand[]; indicatorId: string }) {
  return (
    <ol className="mt-2.5 flex flex-col gap-y-3">
      {bands.map((b, i) => {
        const met = b.met.length > 0;
        const found = b.met.some((m) => m.state === "restricted");
        return (
          <li
            key={b.ordinal}
            className="relative grid grid-cols-[3.25rem_minmax(0,1fr)] items-start gap-x-5"
          >
            {i < bands.length - 1 ? (
              <span
                aria-hidden
                className="absolute top-[0.6rem] -bottom-[1.35rem] left-[3.9rem] w-px -translate-x-1/2 bg-edge"
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                "absolute top-[0.6rem] left-[3.9rem] size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full",
                met
                  ? found
                    ? "bg-navy"
                    : "bg-paper ring-[1.5px] ring-navy"
                  : "bg-paper ring-1 ring-edge",
              )}
            />
            <span
              className={cn(
                "tnum text-right text-[12.5px] leading-[1.5]",
                met ? "font-medium text-navy-deep" : "text-muted-foreground",
              )}
            >
              {b.score.toFixed(2)}
            </span>
            <span
              className={cn(
                "text-[13px] leading-[1.5]",
                met ? "font-medium text-navy-deep" : "text-ink/85",
              )}
            >
              {b.criterion}
              {met ? (
                <span className="ml-2 inline-flex gap-1 align-baseline">
                  {b.met.map((m) => (
                    <Mark key={m.economy} mark={m} indicatorId={indicatorId} />
                  ))}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
