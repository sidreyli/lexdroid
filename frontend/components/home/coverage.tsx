"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { CoverageState } from "@/lib/data/types";

export interface CoverageSquare {
  economy: string;
  economyName: string;
  indicatorId: string;
  indicatorLabel: string;
  state: CoverageState;
  score: number | null;
}

export interface CoveragePillar {
  id: number;
  name: string;
  indicatorIds: string[];
}

const tone: Record<CoverageState, string> = {
  restricted: "bg-navy",
  "no-restriction": "bg-slate-soft",
  unresolved: "bg-ochre",
  "not-attempted": "bg-[#dedad1]",
};

const label: Record<CoverageState, string> = {
  restricted: "Measure found",
  "no-restriction": "No restriction",
  unresolved: "Unresolved",
  "not-attempted": "Not attempted",
};

/** Width of the gutter between pillar groups, on top of the 2px gap every column has. */
const PILLAR_GUTTER = "8px";

export function Coverage({
  pillars,
  economies,
  squares,
}: {
  pillars: CoveragePillar[];
  economies: { code: string; name: string }[];
  squares: CoverageSquare[];
}) {
  const [hover, setHover] = useState<CoverageSquare | null>(null);
  const byKey = new Map(squares.map((s) => [`${s.economy}:${s.indicatorId}`, s]));
  const answered = squares.filter((s) => s.state !== "not-attempted").length;
  const pillarOf = new Map(pillars.flatMap((p) => p.indicatorIds.map((id) => [id, p] as const)));
  const hoverPillar = hover ? pillarOf.get(hover.indicatorId) : undefined;

  /*
    One matrix rather than a small grid per pillar: economies are named rows, indicators are
    columns, and a narrow gutter column separates one pillar from the next. Each pillar's first
    column is worked out here so a cell can be placed without counting in the markup.
  */
  const columns: string[] = ["minmax(7.5rem, 8.5rem)"];
  const firstColumn = new Map<number, number>();
  let tracks = 1;
  pillars.forEach((p, i) => {
    if (i > 0) {
      columns.push(PILLAR_GUTTER);
      tracks += 1;
    }
    firstColumn.set(p.id, tracks + 1);
    columns.push(`repeat(${p.indicatorIds.length}, minmax(8px, 1fr))`);
    tracks += p.indicatorIds.length;
  });
  const indicatorCount = pillars.reduce((n, p) => n + p.indicatorIds.length, 0);
  const minWidth = `calc(7.5rem + ${indicatorCount} * 8px + ${pillars.length - 1} * ${PILLAR_GUTTER} + ${indicatorCount + pillars.length - 1} * 2px)`;

  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
        <div className="min-w-0">
          <h2 className="flex items-baseline gap-2.5">
            <span className="tnum text-[30px] leading-none font-semibold tracking-tight text-navy-deep">
              {answered}
            </span>
            <span className="text-[15px] text-muted-foreground">
              of {squares.length} cells answered
            </span>
          </h2>
          <div className="mt-2.5 min-h-[34px]">
            {hover ? (
              <div className="flex flex-col gap-0.5">
                <p className="flex flex-wrap items-baseline gap-x-2.5 text-[13.5px] leading-tight">
                  <span className="font-medium text-navy-deep">{hover.economyName}</span>
                  <span className="tnum font-medium text-navy">{hover.indicatorId}</span>
                  <span className="text-muted-foreground">
                    {label[hover.state]}
                    {hover.score !== null ? `, scored ${hover.score.toFixed(2)}` : ""}
                  </span>
                </p>
                <p className="max-w-[80ch] truncate text-[12.5px] leading-tight text-muted-foreground">
                  {hoverPillar ? `${hoverPillar.name}: ` : ""}
                  {hover.indicatorLabel}
                </p>
              </div>
            ) : (
              <p className="text-[13px] leading-snug text-muted-foreground">
                Every economy against every indicator, grouped by pillar. Point at a square to read
                it, open it for the answer.
              </p>
            )}
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1">
          {(Object.keys(tone) as CoverageState[]).map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className={cn("size-[10px] shrink-0 rounded-[3px]", tone[s])} />
              <span className="text-[12px] leading-none text-muted-foreground">{label[s]}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-7 overflow-x-auto pb-1">
        <div
          className="grid gap-x-[2px] gap-y-1"
          style={{ gridTemplateColumns: columns.join(" "), minWidth }}
          onMouseLeave={() => setHover(null)}
        >
          {/* Pillar numbers, each over a rule the width of its indicators. */}
          <span className="sticky left-0 z-10 bg-card" style={{ gridColumn: 1, gridRow: 1 }} />
          {pillars.map((p) => {
            const on = hoverPillar?.id === p.id;
            return (
              <div
                key={p.id}
                title={`Pillar ${p.id}, ${p.name}`}
                className="mb-1.5 min-w-0"
                style={{
                  gridColumn: `${firstColumn.get(p.id)} / span ${p.indicatorIds.length}`,
                  gridRow: 1,
                }}
              >
                <span
                  className={cn(
                    "tnum block text-[11.5px] leading-none transition-colors",
                    on ? "font-semibold text-navy-deep" : "text-muted-foreground",
                  )}
                >
                  {p.id}
                </span>
                <span
                  className={cn(
                    "mt-1.5 block h-[2px] rounded-full transition-colors",
                    on ? "bg-navy" : "bg-edge",
                  )}
                />
              </div>
            );
          })}

          {economies.map((e, row) => {
            const on = hover?.economy === e.code;
            return [
              <span
                key={e.code}
                className={cn(
                  "sticky left-0 z-10 flex items-center truncate bg-card pr-3 text-[12.5px] leading-none transition-colors",
                  on ? "font-medium text-navy-deep" : "text-muted-foreground",
                )}
                style={{ gridColumn: 1, gridRow: row + 2 }}
              >
                {e.name}
              </span>,
              ...pillars.flatMap((p) =>
                p.indicatorIds.map((id, i) => {
                  const sq = byKey.get(`${e.code}:${id}`);
                  if (!sq) return null;
                  const active = hover?.economy === e.code && hover?.indicatorId === id;
                  return (
                    <Link
                      key={`${e.code}:${id}`}
                      href={`/database/${e.code.toLowerCase()}/${id}`}
                      onMouseEnter={() => setHover(sq)}
                      onFocus={() => setHover(sq)}
                      onBlur={() => setHover(null)}
                      aria-label={`${e.name} ${id}, ${label[sq.state].toLowerCase()}`}
                      style={{ gridColumn: firstColumn.get(p.id)! + i, gridRow: row + 2 }}
                      className={cn(
                        "block aspect-square w-full rounded-[3px] transition-transform duration-150 outline-none",
                        tone[sq.state],
                        active && "scale-[1.35] ring-2 ring-navy/25",
                        "focus-visible:scale-[1.35] focus-visible:ring-2 focus-visible:ring-navy/40",
                      )}
                    />
                  );
                }),
              ),
            ];
          })}
        </div>
      </div>
    </section>
  );
}
