import Link from "next/link";
import { notFound } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { RunMonitor } from "@/components/runs/run-monitor";
import { getEconomies, getExportRows, getRubric, getRun, getRunEvents } from "@/lib/data";
import { Download } from "lucide-react";

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) notFound();

  const rubric = getRubric();
  const names = new Map(getEconomies().map((e) => [e.code, e.name]));
  const rows = getExportRows().filter((r) => r.runId === run.id).length;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <Link
            href="/runs"
            className="text-[12.5px] font-medium text-navy transition-opacity hover:opacity-70"
          >
            Runs
          </Link>
          <h1 className="mt-0.5 text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            {run.economies.map((c) => names.get(c) ?? c).join(", ")}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Read by {run.model}, {run.sourceMode === "cache-only" ? "from the stored corpus" : "fetching as it went"},
            on build {run.codeRevision}.
          </p>
        </div>
        {rows > 0 ? (
          <a
            href={`/api/export?run=${run.id}`}
            className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-navy px-4 text-[13px] font-medium text-paper transition-colors hover:bg-navy-deep"
          >
            <Download className="size-4" />
            Export {rows} rows
          </a>
        ) : null}
      </header>

      <RunMonitor
        run={run}
        seed={getRunEvents(run.id)}
        pillars={[...rubric.pillars]}
        economyNames={run.economies.map((c) => names.get(c) ?? c)}
      />
    </div>
  );
}
