"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { clip } from "@/lib/format";
import type { PillarScores, Scoreboard as Board } from "@/lib/data/types";
import { BarRows, Ladder, LadderAxis, type BarRow } from "./ladder";

const RULER = [0, 0.25, 0.5, 0.75, 1];

export function Scoreboard({ board }: { board: Board }) {
  const [focus, setFocus] = useState<string | null>(null);
  const names = new Map(board.economies.map((e) => [e.code, e.name]));
  const untouched = board.pillars.filter((p) => p.answered === 0).length;

  const overall: BarRow[] = board.overall.map((o) => ({
    key: o.economy,
    label: names.get(o.economy) ?? o.economy,
    value: o.mean,
    note: "No pillar answered in full",
    href: `/database/${o.economy.toLowerCase()}`,
  }));

  return (
    <div className="flex flex-col gap-5">
      <section className="bg-card lift grid gap-x-12 gap-y-7 rounded-3xl p-6 sm:p-8 lg:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
        <div>
          <h2 className="text-[18px] leading-tight font-semibold tracking-tight text-navy-deep">
            Where the economies stand
          </h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
            Averaged over the {board.pillarsComplete} pillars answered in full.{" "}
            {untouched === 1 ? "One pillar has" : `${untouched} pillars have`} not been attempted, so
            this is a reading of what has been scored and not the composite index.
          </p>
          <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
            The published method weights indicators differently inside a pillar. Those weights are
            not part of the derived rubric, so every mean here is unweighted and each indicator
            counts once.
          </p>
        </div>

        <div className="min-w-0">
          <Focus economies={board.economies} focus={focus} onFocus={setFocus} className="mb-5" />
          <BarRows rows={overall} ticks={RULER} focus={focus} axis />
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {board.pillars.map((p) =>
          p.answered > 0 ? (
            <PillarCard key={p.id} pillar={p} names={names} focus={focus} />
          ) : (
            <PillarStub key={p.id} pillar={p} />
          ),
        )}
      </div>
    </div>
  );
}

function Focus({
  economies,
  focus,
  onFocus,
  className,
}: {
  economies: { code: string; name: string }[];
  focus: string | null;
  onFocus: (code: string | null) => void;
  className?: string;
}) {
  // "All" rather than a counted word: the set of economies is whatever has a profile.
  const options = [{ code: "", name: "All" }, ...economies];
  return (
    // Wraps rather than running on: a single pill row outgrew the card once there were nine.
    <div className={cn("inset-surface flex w-fit max-w-full flex-wrap gap-1 rounded-[18px] p-1", className)}>
      {options.map((o) => {
        const on = (focus ?? "") === o.code;
        return (
          <button
            key={o.code || "all"}
            type="button"
            onClick={() => onFocus(o.code || null)}
            className={cn(
              "rounded-full px-3 py-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors",
              on
                ? "bg-navy text-paper shadow-[0_1px_5px_-2px_rgb(23_50_78/0.6)]"
                : "text-muted-foreground hover:text-navy-deep",
            )}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}

function PillarCard({
  pillar,
  names,
  focus,
}: {
  pillar: PillarScores;
  names: Map<string, string>;
  focus: string | null;
}) {
  const means: BarRow[] = pillar.means.map((m) => ({
    key: m.economy,
    label: names.get(m.economy) ?? m.economy,
    value: m.mean,
    note: `${m.answered} of ${pillar.total} answered`,
  }));
  const whole = pillar.answered === pillar.total;

  return (
    <section className="bg-card lift-sm rounded-3xl px-5 py-6 sm:px-8">
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="min-w-[16rem] flex-1">
          <h2 className="flex items-baseline gap-2.5">
            <span className="tnum text-[13px] font-semibold text-navy">{pillar.id}</span>
            <span className="text-[17px] leading-tight font-semibold tracking-tight text-navy-deep">
              {pillar.name}
            </span>
          </h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            {whole
              ? `All ${pillar.total} indicators answered for every economy.`
              : `${pillar.answered} of ${pillar.total} indicators answered, so the pillar has no mean yet.`}
          </p>
        </div>
        {whole ? (
          <div className="w-full max-w-[26rem] min-w-[15rem] flex-1">
            <p className="mb-1.5 text-[11.5px] text-muted-foreground/80">Pillar mean</p>
            <BarRows rows={means} ticks={RULER} focus={focus} axis />
          </div>
        ) : null}
      </div>

      <div className="mt-6 border-t border-edge pt-4">
        <div className="grid gap-x-6 sm:grid-cols-[3rem_minmax(0,1fr)] lg:grid-cols-[3rem_minmax(0,1fr)_minmax(15rem,40%)]">
          <span className="hidden lg:block" />
          <span className="hidden lg:block" />
          <LadderAxis className="mb-1 sm:col-span-2 lg:col-span-1" />
        </div>
        <ul className="flex flex-col">
          {pillar.indicators.map((i) => (
            <li
              key={i.indicatorId}
              className="grid gap-x-6 gap-y-1 border-b border-edge/60 py-2.5 last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)] lg:grid-cols-[3rem_minmax(0,1fr)_minmax(15rem,40%)]"
            >
              <span className="tnum text-[12.5px] leading-[30px] font-medium text-navy">
                {i.indicatorId}
              </span>
              <p className="text-[13px] leading-[30px] text-ink">
                <span className="line-clamp-1">{clip(i.category, 120)}</span>
              </p>
              <Ladder
                marks={i.marks.map((m) => ({
                  economy: m.economy,
                  name: names.get(m.economy) ?? m.economy,
                  state: m.state,
                  score: m.score,
                  href: `/database/${m.economy.toLowerCase()}/${i.indicatorId}`,
                }))}
                ticks={i.bands}
                focus={focus}
                className="sm:col-span-2 lg:col-span-1"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PillarStub({ pillar }: { pillar: PillarScores }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-1.5 sm:px-8">
      <span className="tnum text-[12px] font-semibold text-muted-foreground/80">{pillar.id}</span>
      <span className="text-[13px] leading-tight text-muted-foreground">{pillar.name}</span>
      <span className="text-[11.5px] text-muted-foreground/70">
        {pillar.total} {pillar.total === 1 ? "indicator" : "indicators"}, not attempted
      </span>
    </div>
  );
}

export function EconomyLinks({ economies }: { economies: { code: string; name: string }[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {economies.map((e) => (
        <Link
          key={e.code}
          href={`/database/${e.code.toLowerCase()}`}
          className="flex items-center gap-1.5 rounded-full bg-inset px-3.5 py-2 text-[13px] font-medium text-navy-deep transition-colors hover:bg-edge"
        >
          {e.name}
          <ArrowUpRight className="size-3.5 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
