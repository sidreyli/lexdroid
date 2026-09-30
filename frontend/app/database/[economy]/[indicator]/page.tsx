import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import { PageSidebarTrigger } from "@/components/shell/page-sidebar-trigger";
import { BandLadder } from "@/components/database/band-ladder";
import { HistoryChart } from "@/components/database/history-chart";
import { getCellDetail } from "@/lib/data";
import { compact, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CellState } from "@/lib/data/types";

const stateLabel: Record<CellState, string> = {
  restricted: "Measure found",
  "no-restriction": "No restriction",
  unresolved: "Unresolved",
};

const stateTone: Record<CellState, string> = {
  restricted: "bg-navy text-paper",
  "no-restriction": "bg-inset text-muted-foreground ring-1 ring-edge",
  unresolved: "bg-ochre-soft text-ochre",
};

export default async function CellPage({ params }: PageProps<"/database/[economy]/[indicator]">) {
  const { economy, indicator } = await params;
  const detail = getCellDetail(economy, indicator);
  if (!detail) notFound();

  const { current, history, rows, priorRows } = detail;
  const code = detail.economy.code;
  const findings = rows.length > 0 ? rows : priorRows;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-start gap-3 py-6 sm:py-8">
        <PageSidebarTrigger className="-mt-1" />
        <div className="min-w-0">
          <nav className="flex items-center gap-1 text-[12.5px] text-muted-foreground">
            <Link href="/database" className="underline-offset-[3px] hover:underline">
              Database
            </Link>
            <ChevronRight className="size-3.5" />
            <Link
              href={`/database/${code.toLowerCase()}`}
              className="underline-offset-[3px] hover:underline"
            >
              {detail.economy.name}
            </Link>
          </nav>
          <h1 className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tnum text-[24px] leading-tight font-semibold tracking-tight text-navy">
              {detail.indicator.id}
            </span>
            <span className="max-w-[70ch] text-[19px] leading-tight font-semibold tracking-tight text-navy-deep">
              {detail.indicator.category}
            </span>
          </h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Pillar {detail.indicator.pillarId}, {detail.indicator.pillarName}
          </p>
          {detail.indicator.exception ? (
            <p className="mt-1 max-w-[70ch] text-[12.5px] text-muted-foreground">
              Exception: {detail.indicator.exception}
            </p>
          ) : null}
        </div>
      </header>

      {current === null ? (
        <section className="bg-card lift grid gap-x-12 gap-y-6 rounded-3xl p-6 sm:p-8 lg:grid-cols-[minmax(16rem,24rem)_minmax(0,1fr)]">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              Nothing has attempted this yet
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              No completed run has answered {detail.indicator.id} for {detail.economy.name}. The
              bands are what an answer would have to meet.
            </p>
          </div>
          <div className="min-w-0 rounded-2xl bg-inset p-4 sm:p-5">
            <BandLadder bands={detail.indicator.bands} met={null} />
          </div>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <section className="bg-card lift rounded-3xl p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "rounded-full px-3 py-1.5 text-[12.5px] font-medium",
                    stateTone[current.state],
                  )}
                >
                  {stateLabel[current.state]}
                </span>
                <span className="text-[12.5px] text-muted-foreground">
                  {detail.economy.name}, answered{" "}
                  {current.answeredAt ? relativeTime(current.answeredAt) : "at an unrecorded time"}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="tnum text-[44px] leading-none font-semibold tracking-tight text-navy-deep">
                  {current.score === null ? "Not scored" : current.score.toFixed(2)}
                </span>
                <span className="max-w-[52ch] text-[14px] leading-snug text-ink">
                  {current.bandCriterion ?? "No band recorded"}
                </span>
              </div>

              {current.decidingFact ? (
                <p className="mt-4 text-[13.5px] text-muted-foreground">
                  Decided on {current.decidingFact}.
                </p>
              ) : null}

              {current.unresolvedReason ? (
                <p className="mt-4 rounded-2xl bg-ochre-soft px-4 py-3 text-[13px] leading-relaxed text-ochre">
                  {current.unresolvedReason}
                </p>
              ) : null}

              {current.rationale ? (
                <div className="mt-5 border-t border-edge pt-5">
                  <h2 className="text-[12.5px] font-medium text-navy-deep">How it was reasoned</h2>
                  <p className="mt-1.5 max-w-[78ch] text-[13.5px] leading-relaxed text-ink">
                    {current.rationale}
                  </p>
                </div>
              ) : null}

              <div className="mt-6 border-t border-edge pt-5">
                <h2 className="text-[12.5px] font-medium text-navy-deep">
                  The bands, and the one it met
                </h2>
                <div className="mt-2">
                  <BandLadder bands={detail.indicator.bands} met={current.bandOrdinal} />
                </div>
              </div>
            </section>

            <section className="bg-card lift-sm rounded-3xl p-6 sm:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2 className="text-[15px] font-semibold tracking-tight text-navy-deep">
                  The findings behind it
                </h2>
                <p className="text-[12px] text-muted-foreground">
                  {rows.length > 0
                    ? `${rows.length} recorded by this run`
                    : priorRows.length > 0
                      ? `None from this run, ${priorRows.length} distinct from earlier runs`
                      : "None recorded"}
                </p>
              </div>

              {findings.length === 0 ? (
                <p className="mt-3 max-w-[70ch] text-[13.5px] leading-relaxed text-muted-foreground">
                  This run scored the cell without writing an export row, so there is no citation to
                  read here. The reasoning above is all it recorded.
                </p>
              ) : null}

              {rows.length === 0 && priorRows.length > 0 ? (
                <p className="mt-3 max-w-[70ch] text-[13px] leading-relaxed text-muted-foreground">
                  The run behind the score above wrote no export rows. These are from earlier runs of
                  the same economy and indicator, so they may cite a provision the current answer no
                  longer rests on.
                </p>
              ) : null}

              <ul className="mt-4 flex flex-col gap-3">
                {findings.slice(0, 8).map((r) => {
                  const failed = r.gates.filter((g) => !g.passed).length;
                  return (
                    <li key={r.id} className="inset-surface rounded-2xl px-4 py-3.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                        <p className="text-[13px] font-medium text-navy-deep">
                          {r.lawName}
                          {r.article ? `, ${r.article}` : ""}
                        </p>
                        <Link
                          href={`/workbench/${r.id}`}
                          className="flex items-center gap-1 text-[12px] whitespace-nowrap text-navy underline-offset-[3px] hover:underline"
                        >
                          Open in the workbench
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </div>
                      {r.verbatimSnippet ? (
                        <blockquote className="mt-2 border-l-2 border-slate-soft pl-3 text-[13px] leading-relaxed text-ink">
                          {r.verbatimSnippet}
                        </blockquote>
                      ) : (
                        <p className="mt-2 text-[12.5px] text-muted-foreground">
                          No quoted words recorded.
                        </p>
                      )}
                      <p className="mt-2 text-[12px] text-muted-foreground">
                        {failed === 0
                          ? "All ten checks passed"
                          : `${failed} of ten checks failed`}
                        {`, written ${relativeTime(r.createdAt)}`}
                      </p>
                    </li>
                  );
                })}
              </ul>

              {findings.length > 8 ? (
                <p className="mt-3 text-[12px] text-muted-foreground">
                  {findings.length - 8} more not shown.
                </p>
              ) : null}
            </section>
          </div>

          <aside className="flex min-w-0 flex-col gap-5">
            <Panel title="What it rests on">
              {current.controllingInstrument ? (
                <>
                  <p className="text-[13.5px] leading-snug text-ink">
                    {current.controllingInstrument}
                  </p>
                  {current.controllingInstrumentUrl ? (
                    <a
                      href={current.controllingInstrumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex items-center gap-1 text-[12.5px] text-navy underline-offset-[3px] hover:underline"
                    >
                      Open at the source
                      <ArrowUpRight className="size-3.5" />
                    </a>
                  ) : null}
                </>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  No controlling instrument named.
                </p>
              )}
            </Panel>

            <Panel title="How it was searched">
              <Facts
                items={[
                  ["Queries put", String(current.queries.length)],
                  ["Sections indexed", compact(current.sectionsIndexed ?? 0)],
                  ["Sections surfaced", compact(current.surfaced ?? 0)],
                  ["Sections read", compact(current.sectionsRead ?? 0)],
                ]}
              />
              {current.queries.length ? (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-edge pt-3">
                  {current.queries.map((q) => (
                    <li key={q} className="text-[12.5px] leading-snug text-muted-foreground">
                      {q}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Panel>

            <Panel title="Which run said so">
              <Facts
                items={[
                  ["Engine", current.engine],
                  ["Model", current.model],
                  ["Sources", current.sourceMode === "fetch" ? "Fetched" : "Cache only"],
                  ["Run started", relativeTime(current.runStartedAt)],
                ]}
              />
              <p className="mt-3 border-t border-edge pt-3 font-mono text-[11px] break-all text-muted-foreground/80">
                {current.runId}
              </p>
            </Panel>

            {history.length ? (
              <Panel title="How the answer has moved">
                <HistoryChart
                  points={[...history]
                    .reverse()
                    .concat(current)
                    .map((c) => ({ at: c.runStartedAt, score: c.score, status: c.runStatus }))}
                />
              </Panel>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card lift-sm rounded-3xl px-5 py-5">
      <h2 className="mb-2.5 text-[12.5px] font-medium text-navy-deep">{title}</h2>
      {children}
    </section>
  );
}

function Facts({ items }: { items: [label: string, value: string][] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {items.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
          <dd className="tnum truncate text-[12.5px] font-medium text-navy-deep">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
