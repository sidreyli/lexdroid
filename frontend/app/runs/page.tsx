import Link from "next/link";
import { PageSidebarTrigger } from "@/components/shell/page-sidebar-trigger";
import { LiveRuns, type RunCard } from "@/components/runs/live-runs";
import { readProgress } from "@/lib/runs/progress";
import { getEconomies, getRubric, getRunEvents, getRuns } from "@/lib/data";
import { duration, pillarsAsked } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Run } from "@/lib/data/types";

const statusWord: Record<string, string> = {
  complete: "Finished",
  failed: "Failed",
  cancelled: "Stopped",
  running: "Running",
};

function day(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const yesterday = new Date(today.getTime() - 86_400_000);
  if (sameDay(then, today)) return "Today";
  if (sameDay(then, yesterday)) return "Yesterday";
  return then.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export default function RunsPage() {
  const runs = getRuns();
  const rubric = getRubric();
  const names = new Map(getEconomies().map((e) => [e.code, e.name]));
  const where = (run: Run) => run.economies.map((c) => names.get(c) ?? c).join(", ");

  const cards: RunCard[] = runs
    .filter((r) => r.status === "running")
    .map((run) => {
      const progress = readProgress(run, getRunEvents(run.id), [...rubric.pillars]);
      return {
        id: run.id,
        where: where(run),
        pillarsAsked: pillarsAsked(run.pillars),
        startedAt: run.startedAt,
        lastSpokeAt: progress.lastSpokeAt,
        legs: progress.legs,
        reading: progress.reading,
      };
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const past = runs.filter((r) => r.status !== "running").slice(0, 40);
  const days: { label: string; runs: Run[] }[] = [];
  for (const run of past) {
    const label = day(run.startedAt);
    if (days.at(-1)?.label !== label) days.push({ label, runs: [] });
    days.at(-1)?.runs.push(run);
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <PageSidebarTrigger />
        <div>
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            Runs
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Every pass the system has made over a statute book, and what it said while it read.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <LiveRuns cards={cards} />

        <section className="bg-card lift rounded-3xl p-6 sm:p-7">
          <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">Earlier runs</h2>

          {days.map((group) => (
            <div key={group.label} className="mt-5 first:mt-4">
              <h3 className="text-[12.5px] font-medium text-muted-foreground">{group.label}</h3>
              <ul className="mt-1 flex flex-col">
                {group.runs.map((run) => (
                  <li key={run.id} className="border-b border-edge/70 last:border-0">
                    {/*
                      Each row is its own grid, so no column may size to its text: an "auto" status
                      column was narrower on a stopped run than on a finished one, and every column
                      before it shifted. Fixed tracks keep all rows, across days, on one set of lines.
                    */}
                    <Link
                      href={`/runs/${run.id}`}
                      className="-mx-2 grid grid-cols-[minmax(0,1fr)_7.5rem_3rem] items-baseline gap-x-4 gap-y-1 rounded-xl px-2 py-2.5 transition-colors hover:bg-inset sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_10rem_3.5rem] sm:gap-x-6"
                    >
                      <span className="truncate text-[13.5px] leading-tight text-navy-deep">
                        {where(run)}
                      </span>
                      <span className="hidden truncate text-[12.5px] leading-tight text-muted-foreground sm:block">
                        {pillarsAsked(run.pillars)}
                      </span>
                      <span
                        className={cn(
                          "tnum truncate text-right text-[12.5px] leading-tight",
                          run.status === "failed" ? "text-brick" : "text-muted-foreground",
                        )}
                      >
                        {run.status === "complete"
                          ? `${run.cells} cells in ${duration(run.wallSeconds)}`
                          : statusWord[run.status]}
                      </span>
                      <span className="tnum text-right text-[12.5px] leading-tight whitespace-nowrap text-muted-foreground">
                        {new Date(run.startedAt).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
