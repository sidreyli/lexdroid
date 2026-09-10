"use client";

import { cn } from "@/lib/utils";
import { duration } from "@/lib/format";
import { readProgress } from "@/lib/runs/progress";
import { useLiveRun } from "@/lib/runs/live";
import { useSecondsSince } from "@/lib/runs/now";
import { PillarTrack } from "./pillar-track";
import { ReadingNow } from "./reading-now";
import { Ledger } from "./ledger";
import type { Pillar, Run, RunEvent } from "@/lib/data/types";

const statusWord: Record<string, string> = {
  running: "Running",
  complete: "Finished",
  failed: "Failed",
  cancelled: "Stopped",
};

const statusTone: Record<string, string> = {
  running: "bg-ochre",
  complete: "bg-navy",
  failed: "bg-brick",
  cancelled: "bg-slate-soft",
};

function Outcome({
  answered,
  restricted,
  none,
  reads,
  unread,
}: {
  answered: number;
  restricted: number;
  none: number;
  reads: number;
  unread: number;
}) {
  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-7">
      <h2 className="text-[13px] font-medium text-muted-foreground">What the run produced</h2>
      <p className="mt-3 flex items-baseline gap-2.5">
        <span className="tnum text-[34px] leading-none font-semibold tracking-tight text-navy-deep">
          {answered}
        </span>
        <span className="text-[15px] text-muted-foreground">
          {answered === 1 ? "cell settled" : "cells settled"}
        </span>
      </p>
      <p className="mt-2 max-w-[62ch] text-[13.5px] leading-relaxed text-muted-foreground">
        {restricted} found a measure in the law, {none} found the governing law and no measure.
        The run read {reads.toLocaleString()} provisions to get there
        {unread > 0 ? `, and ${unread} more it could not read.` : ", and read every one it reached."}
      </p>
    </section>
  );
}

export function RunMonitor({
  run,
  seed,
  pillars,
  economyNames,
}: {
  run: Run;
  seed: RunEvent[];
  pillars: Pillar[];
  economyNames: string[];
}) {
  const { events, status, connection, silentFor } = useLiveRun(run.id, seed, run.status);
  const progress = readProgress({ ...run, status }, events, pillars);

  const elapsed = useSecondsSince(run.startedAt);

  const wall =
    status === "running"
      ? elapsed
      : run.finishedAt
        ? (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000
        : run.wallSeconds;

  const restricted = progress.decisions.filter((d) => d.state === "restricted").length;
  const none = progress.decisions.filter((d) => d.state === "no-restriction").length;

  return (
    <div className="flex flex-col gap-5">
      <section className="bg-card lift rounded-3xl p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h2 className="flex items-center gap-2.5">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                statusTone[status] ?? "bg-slate-soft",
                status === "running" && "motion-safe:animate-pulse",
              )}
            />
            <span className="text-[17px] font-semibold tracking-tight text-navy-deep">
              {economyNames.join(", ")}
            </span>
            <span className="text-[13.5px] text-muted-foreground">
              {statusWord[status] ?? status}
            </span>
          </h2>
          <p className="tnum text-[13px] text-muted-foreground">
            {wall === null ? "" : `${duration(wall)} ${status === "running" ? "so far" : "in total"}`}
          </p>
        </div>

        <div className="mt-6">
          <PillarTrack legs={progress.legs} reading={progress.reading} />
        </div>

        {status === "running" && connection !== "live" ? (
          <p className="mt-5 text-[12.5px] leading-snug text-ochre">
            {connection === "offline"
              ? "Not receiving updates. This shows the run as it stood when the page loaded."
              : "Connecting to the run."}
          </p>
        ) : null}
      </section>

      {status === "running" ? (
        <ReadingNow
          reading={progress.reading}
          secondsPerRead={progress.secondsPerRead}
          pillarSecondsLeft={progress.pillarSecondsLeft}
          pillarsLeft={progress.pillarsLeft}
          silentFor={silentFor}
        />
      ) : (
        <Outcome
          answered={progress.answered}
          restricted={restricted}
          none={none}
          reads={progress.readsDone}
          unread={progress.unread.length}
        />
      )}

      <Ledger events={events} />
    </div>
  );
}
