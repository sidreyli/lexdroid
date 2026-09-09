"use client";

import { useState } from "react";
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

  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <div>
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
                    {label[hover.state].toLowerCase()}
                    {hover.score !== null ? `, scored ${hover.score.toFixed(2)}` : ""}
                  </span>
                </p>
                <p className="max-w-[70ch] truncate text-[12.5px] leading-tight text-muted-foreground">
                  {hover.indicatorLabel}
                </p>
              </div>
            ) : (
              <p className="text-[13px] leading-snug text-muted-foreground">
                Every economy against every indicator. Point at a square to read it.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-x-9 gap-y-4">
          <div>
            <p className="mb-1.5 text-[11.5px] text-muted-foreground/70">Rows, top down</p>
            <div className="flex items-start gap-2.5">
              <div className="mt-[3px] grid gap-[3px]">
                {economies.map((e) => (
                  <span key={e.code} className="size-[11px] rounded-[3px] bg-[#dedad1]" />
                ))}
              </div>
              <ul className="grid gap-[3px]">
                {economies.map((e) => (
                  <li key={e.code} className="text-[12px] leading-[14px] text-muted-foreground">
                    {e.name}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[11.5px] text-muted-foreground/70">Each square</p>
            <ul className="grid gap-[3px]">
              {(Object.keys(tone) as CoverageState[]).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={cn("size-[11px] shrink-0 rounded-[3px]", tone[s])} />
                  <span className="text-[12px] leading-[14px] text-muted-foreground">
                    {label[s]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div
        className="mt-8 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        onMouseLeave={() => setHover(null)}
      >
        {pillars.map((p) => (
          <div key={p.id}>
            <div className="mb-2.5 flex items-baseline gap-2">
              <span className="tnum text-[12px] font-semibold text-navy">{p.id}</span>
              <span className="truncate text-[12.5px] leading-tight text-muted-foreground">
                {p.name}
              </span>
            </div>
            <div
              className="grid w-fit gap-[3px]"
              style={{ gridTemplateRows: "repeat(3, 1fr)", gridAutoFlow: "column" }}
            >
              {p.indicatorIds.map((id) =>
                economies.map((e) => {
                  const sq = byKey.get(`${e.code}:${id}`);
                  if (!sq) return null;
                  const on = hover?.economy === e.code && hover?.indicatorId === id;
                  return (
                    <button
                      key={`${e.code}:${id}`}
                      type="button"
                      onMouseEnter={() => setHover(sq)}
                      onFocus={() => setHover(sq)}
                      onBlur={() => setHover(null)}
                      aria-label={`${e.name} ${id}, ${label[sq.state].toLowerCase()}`}
                      className={cn(
                        "size-[12px] rounded-[3.5px] transition-transform duration-150 outline-none",
                        tone[sq.state],
                        on && "scale-[1.4] ring-2 ring-navy/25",
                        "focus-visible:scale-[1.4] focus-visible:ring-2 focus-visible:ring-navy/40",
                      )}
                    />
                  );
                }),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
