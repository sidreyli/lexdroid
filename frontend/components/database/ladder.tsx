"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CoverageState } from "@/lib/data/types";

export interface LadderMark {
  economy: string;
  name: string;
  state: CoverageState;
  score: number | null;
  href?: string;
}

export interface BarRow {
  key: string;
  label: string;
  value: number | null;
  /** Empty when nothing was attempted, which the hollow track says on its own. */
  note: string;
  href?: string;
}

/** Anchored so 0 sits flush at the open end and 1 flush at the restrictive end. */
function anchor(score: number) {
  const p = score * 100;
  return { left: `${p}%`, transform: `translateX(-${p}%)` };
}

function Ticks({ ticks }: { ticks: number[] }) {
  return (
    <>
      {ticks.map((t) => (
        <span
          key={t}
          style={anchor(t)}
          className="absolute top-1/2 h-[9px] w-px -translate-y-1/2 bg-edge"
          aria-hidden
        />
      ))}
    </>
  );
}

/**
 * How many codes a chip spells out. Bands sit 0.2 apart, which is room for two codes a side;
 * with nine economies a chip of five ran into its neighbour, so a crowded chip names one and
 * counts the rest behind a popover.
 */
const CHIP_MAX = 2;

/** The focused economy first, so dimming the rest never hides the one being followed. */
function shown(group: LadderMark[], focus?: string | null): LadderMark[] {
  if (group.length <= CHIP_MAX) return group;
  return [group.find((m) => m.economy === focus) ?? group[0]!];
}

/** A short list of codes beside the ruler, or a count once it would crowd the ruler out. */
function codes(marks: LadderMark[]): string {
  return marks.length <= 3 ? marks.map((m) => m.economy).join(" ") : `${marks.length}`;
}

function Code({
  mark: m,
  score,
  quiet,
  focus,
}: {
  mark: LadderMark;
  score: number;
  quiet: boolean;
  focus?: string | null;
}) {
  return m.href ? (
    <Link
      href={m.href}
      title={`${m.name}, scored ${score.toFixed(2)}`}
      className={cn(
        "rounded-full px-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        quiet ? "hover:text-navy-deep" : "hover:text-paper/70",
        focus === m.economy && "underline underline-offset-[3px]",
      )}
    >
      {m.economy}
    </Link>
  ) : (
    <span className="px-0.5">{m.economy}</span>
  );
}

/**
 * One indicator on the ruler. Band scores are at least 0.2 apart, so economies either
 * land on the same score and share a chip or sit far enough apart to read separately.
 */
export function Ladder({
  marks,
  ticks,
  focus,
  className,
}: {
  marks: LadderMark[];
  ticks?: number[];
  focus?: string | null;
  className?: string;
}) {
  const at = new Map<number, LadderMark[]>();
  for (const m of marks) {
    if (m.score !== null) at.set(m.score, [...(at.get(m.score) ?? []), m]);
  }
  const groups = [...at.entries()].sort((a, b) => a[0] - b[0]);
  const unresolved = marks.filter((m) => m.state === "unresolved" && m.score === null);
  const missing = marks.filter((m) => m.state === "not-attempted");

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div className="relative h-[28px] min-w-0 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-edge" />
        <Ticks ticks={ticks ?? []} />
        {groups.map(([score, group]) => {
          const quiet = group.every((m) => m.state === "no-restriction");
          const lit = !focus || group.some((m) => m.economy === focus);
          return (
            <span
              key={score}
              style={anchor(score)}
              className={cn(
                "absolute top-0 flex h-[28px] items-center gap-1 rounded-full px-2 text-[10.5px] leading-none font-medium transition-opacity duration-200",
                quiet
                  ? "bg-inset text-muted-foreground ring-1 ring-edge"
                  : "bg-navy text-paper shadow-[0_1px_4px_-1px_rgb(23_50_78/0.5)]",
                lit ? "opacity-100" : "opacity-25",
              )}
            >
              {shown(group, focus).map((m) => (
                <Code key={m.economy} mark={m} score={score} quiet={quiet} focus={focus} />
              ))}
              {group.length > CHIP_MAX ? (
                <Popover>
                  <PopoverTrigger
                    className={cn(
                      "rounded-full px-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      quiet ? "hover:text-navy-deep" : "hover:text-paper/70",
                    )}
                    aria-label={`${group.length} economies scored ${score.toFixed(2)}`}
                  >
                    +{group.length - 1}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto min-w-44 gap-1 rounded-xl p-2" align="start">
                    <p className="px-1.5 pb-0.5 text-[11px] text-muted-foreground">
                      Scored {score.toFixed(2)}
                    </p>
                    {group.map((m) =>
                      m.href ? (
                        <Link
                          key={m.economy}
                          href={m.href}
                          className="flex items-baseline gap-2 rounded-lg px-1.5 py-1 text-[12.5px] text-ink hover:bg-inset"
                        >
                          <span className="tnum w-8 text-[11px] font-medium text-navy">{m.economy}</span>
                          {m.name}
                        </Link>
                      ) : (
                        <span key={m.economy} className="flex items-baseline gap-2 px-1.5 py-1 text-[12.5px] text-ink">
                          <span className="tnum w-8 text-[11px] font-medium text-navy">{m.economy}</span>
                          {m.name}
                        </span>
                      ),
                    )}
                  </PopoverContent>
                </Popover>
              ) : null}
            </span>
          );
        })}
      </div>

      {unresolved.length ? (
        <span
          title={unresolved.map((m) => m.name).join(", ")}
          className="shrink-0 rounded-full bg-ochre-soft px-2 py-1 text-[10.5px] font-medium whitespace-nowrap text-ochre"
        >
          {codes(unresolved)} unresolved
        </span>
      ) : null}
      {missing.length && missing.length < marks.length ? (
        <span
          title={missing.map((m) => m.name).join(", ")}
          className="shrink-0 text-[10.5px] whitespace-nowrap text-muted-foreground/70"
        >
          {codes(missing)} not attempted
        </span>
      ) : null}
    </div>
  );
}

/**
 * A mean is a continuous number, so it gets its own line rather than a chip that
 * would sit on top of another economy's.
 */
export function BarRows({
  rows,
  ticks,
  focus,
  label = "auto",
  axis = false,
  className,
}: {
  rows: BarRow[];
  ticks?: number[];
  focus?: string | null;
  label?: string;
  axis?: boolean;
  className?: string;
}) {
  return (
    <ul
      style={{ gridTemplateColumns: `${label} minmax(0, 1fr) 2.75rem` }}
      className={cn("grid items-center gap-x-3 gap-y-1.5", className)}
    >
      {axis ? (
        <li className="col-span-3 grid grid-cols-subgrid">
          <span />
          <LadderAxis />
          <span />
        </li>
      ) : null}
      {rows.map((r) => {
        const dim = !focus || focus === r.key ? "opacity-100" : "opacity-30";
        return (
          <li key={r.key} className="col-span-3 grid grid-cols-subgrid items-center">
            <span className={cn("min-w-0 transition-opacity duration-200", dim)}>
              {r.href ? (
                <Link
                  href={r.href}
                  className="block truncate text-[12.5px] text-ink underline-offset-[3px] hover:underline"
                >
                  {r.label}
                </Link>
              ) : (
                <span className="block truncate text-[12.5px] text-ink">{r.label}</span>
              )}
            </span>
            {r.value === null ? (
              r.note ? (
                <span className="truncate text-[12px] text-muted-foreground/80">{r.note}</span>
              ) : (
                <span className="block h-[14px]">
                  <span className="mt-[6px] block border-t border-dashed border-edge" />
                </span>
              )
            ) : (
              <span className={cn("relative block h-[14px] transition-opacity duration-200", dim)}>
                <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-edge" />
                <Ticks ticks={ticks ?? []} />
                <span
                  style={{ width: `${Math.max(r.value, 0.004) * 100}%` }}
                  className="absolute top-1/2 left-0 h-[5px] -translate-y-1/2 rounded-full bg-navy"
                />
              </span>
            )}
            <span
              className={cn(
                "tnum text-right text-[12.5px] font-medium text-navy-deep transition-opacity duration-200",
                dim,
              )}
            >
              {r.value === null ? "" : r.value.toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Printed once above a run of ladders so the rows themselves stay quiet. */
export function LadderAxis({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between text-[11px] text-muted-foreground",
        className,
      )}
    >
      <span>0, no measure found</span>
      <span>1, heavily regulated</span>
    </div>
  );
}
