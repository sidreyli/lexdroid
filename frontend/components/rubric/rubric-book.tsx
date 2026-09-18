"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { matches, type Book, type BookIndicator } from "@/lib/rubric/book";
import { BandLadder, type EconomyNames } from "./band-ladder";

function Indicator({ indicator, names }: { indicator: BookIndicator; names: EconomyNames }) {
  return (
    <article
      id={`i-${indicator.id}`}
      className="grid scroll-mt-6 grid-cols-[3.25rem_minmax(0,1fr)] gap-x-5 border-t border-edge/70 pt-5 first:border-t-0 first:pt-0"
    >
      <span className="tnum text-right text-[12.5px] leading-[1.45] font-medium text-navy">
        {indicator.id}
      </span>

      <div className="min-w-0">
        <h3 className="max-w-[72ch] text-[14.5px] leading-[1.45] text-ink">{indicator.category}</h3>

        {indicator.exception ? (
          <p className="mt-2 max-w-[72ch] border-l-2 border-ochre/30 pl-3 text-[12.5px] leading-snug text-ochre">
            {indicator.exception}
          </p>
        ) : null}

        {indicator.shapeNote ? (
          <p
            title={indicator.shapeBasis}
            className="mt-2 max-w-[72ch] text-[12.5px] leading-snug text-ochre"
          >
            {indicator.shapeNote}
          </p>
        ) : null}
      </div>

      <div className="col-span-2">
        <BandLadder bands={indicator.bands} indicatorId={indicator.id} names={names} />
      </div>

      {indicator.unsettled.map((u) => (
        <p
          key={u.economy}
          className="col-start-2 mt-2.5 max-w-[72ch] text-[12.5px] leading-snug text-ochre"
        >
          {names[u.economy] ?? u.economy} reached no band here
          {u.reason ? `. ${u.reason}` : "."}
        </p>
      ))}

      <p className="col-start-2 mt-2.5 text-[11.5px] text-muted-foreground/80">{indicator.row}</p>
    </article>
  );
}

export function RubricBook({ book, names }: { book: Book; names: EconomyNames }) {
  const [term, setTerm] = useState("");

  const found = useMemo(
    () =>
      book.pillars.map((p) => {
        const indicators = p.indicators.filter((i) => matches(i, term));
        return { ...p, indicators, answered: indicators.filter((i) => i.answered > 0).length };
      }),
    [book, term],
  );
  const pillars = found.filter((p) => p.indicators.length > 0);
  const shown = pillars.reduce((n, p) => n + p.indicators.length, 0);
  const filtering = term.trim() !== "";

  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Find 6.2, or a phrase"
            aria-label="Find an indicator"
            className="h-9 rounded-xl border-0 bg-inset pl-8.5 text-[13px] shadow-none"
          />
          {filtering ? (
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

        {filtering ? (
          <p className="mt-2.5 px-1 text-[12px] text-muted-foreground">
            {shown} of {book.indicators} indicators
          </p>
        ) : null}

        <nav className="mt-4 flex flex-col gap-0.5">
          {found.map((p) => {
            const empty = p.indicators.length === 0;
            return (
              <a
                key={p.id}
                href={empty ? undefined : `#pillar-${p.id}`}
                aria-disabled={empty}
                className={cn(
                  "grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-lg px-1.5 py-1.5 text-[12.5px] leading-snug transition-colors",
                  empty
                    ? "pointer-events-none text-muted-foreground/40"
                    : "text-ink hover:bg-inset",
                )}
              >
                <span className="tnum text-right text-muted-foreground">{p.id}</span>
                <span>{p.name}</span>
                <span className="tnum text-[11.5px] text-muted-foreground">
                  {p.indicators.length}
                </span>
              </a>
            );
          })}
        </nav>

        <p className="mt-4 max-w-[30ch] px-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
          {book.excluded.length} further indicators are not regulatory. ESCAP answers those from
          statistics, and states that no extraction tool is needed for them.
        </p>
      </aside>

      <div className="flex min-w-0 flex-col gap-5">
        {pillars.length === 0 ? (
          <section className="bg-card lift rounded-3xl p-6 sm:p-7">
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              Nothing matches that
            </h2>
            <p className="mt-1.5 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
              Search an indicator number such as 6.2, or a phrase from the question or the scoring
              criteria, such as local storage.
            </p>
          </section>
        ) : (
          pillars.map((p) => (
            <section
              key={p.id}
              id={`pillar-${p.id}`}
              className="bg-card lift scroll-mt-6 rounded-3xl p-6 sm:p-7"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2 className="flex items-baseline gap-3">
                  <span className="tnum text-[12.5px] font-medium text-muted-foreground">
                    {p.id}
                  </span>
                  <span className="text-[17px] font-semibold tracking-tight text-navy-deep">
                    {p.name}
                  </span>
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                  {p.indicators.length} {p.indicators.length === 1 ? "indicator" : "indicators"}
                  {p.answered > 0 ? `, ${p.answered} answered` : ""}
                </p>
              </header>

              <div className="mt-5 flex flex-col gap-5">
                {p.indicators.map((i) => (
                  <Indicator key={i.id} indicator={i} names={names} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
