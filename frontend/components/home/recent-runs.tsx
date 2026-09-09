import Link from "next/link";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import type { Run } from "@/lib/data/types";

const statusTone: Record<string, string> = {
  running: "bg-ochre",
  complete: "bg-navy",
  failed: "bg-brick",
  cancelled: "bg-slate-soft",
};

function where(run: Run, names: Map<string, string>): string {
  return run.economies.map((c) => names.get(c) ?? c).join(", ");
}

function what(run: Run): string {
  if (run.pillars === "all") return "all pillars";
  return run.pillars.length === 1
    ? `pillar ${run.pillars[0]}`
    : `pillars ${run.pillars.join(" and ")}`;
}

export function RecentRuns({
  runs,
  economies,
}: {
  runs: Run[];
  economies: { code: string; name: string }[];
}) {
  const names = new Map(economies.map((e) => [e.code, e.name]));

  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">Recent runs</h2>
        <Link
          href="/runs"
          className="text-[12.5px] font-medium text-navy transition-opacity hover:opacity-70"
        >
          All runs
        </Link>
      </div>

      <ul className="mt-4 flex flex-col gap-0.5">
        {runs.map((run) => (
          <li key={run.id}>
            <Link
              href={`/runs/${run.id}`}
              className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-inset"
            >
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  statusTone[run.status] ?? "bg-slate-soft",
                  run.status === "running" && "motion-safe:animate-pulse",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] leading-tight text-navy-deep">
                    {where(run, names)}
                  </span>
                  <span className="shrink-0 text-[12px] whitespace-nowrap text-muted-foreground">
                    {relativeTime(run.startedAt)}
                  </span>
                </span>
                <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted-foreground">
                  {what(run)}
                  {run.status === "running"
                    ? ", running now"
                    : run.status === "failed"
                      ? ", failed"
                      : `, ${run.cells} ${run.cells === 1 ? "cell" : "cells"}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
