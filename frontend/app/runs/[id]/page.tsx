import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSidebarTrigger } from "@/components/shell/page-sidebar-trigger";
import { RunMonitor } from "@/components/runs/run-monitor";
import { RescoreButton } from "@/components/runs/rescore-button";
import { getEconomies, getExportRows, getRubric, getRun, getRunEvents, getRuns } from "@/lib/data";
import { passesOf } from "@/lib/export/pair";
import { Download } from "lucide-react";
import { isReadOnlyDeployment } from "@/lib/deployment";

export default async function RunPage({ params }: PageProps<"/runs/[id]">) {
  const { id } = await params;
  const run = getRun(id);
  if (!run) notFound();

  const rubric = getRubric();
  const names = new Map(getEconomies().map((e) => [e.code, e.name]));
  const rows = getExportRows().filter((r) => r.runId === run.id).length;
  // The other engine's pass over the same draw. With it, one export carries the Engine
  // Comparison and the Run Record for the hour, which is what the live test hands in.
  const passes = passesOf(run, getRuns());
  const partner = passes ? (passes.a.id === run.id ? passes.b : passes.a) : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <PageSidebarTrigger />
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
            {partner ? (
              <>
                {" "}
                Compared with{" "}
                <Link href={`/runs/${partner.id}`} className="font-medium text-navy hover:opacity-70">
                  {partner.model}&rsquo;s pass
                </Link>{" "}
                over the same draw.
              </>
            ) : null}
          </p>
        </div>
        {run.status === "complete" && !isReadOnlyDeployment() ? <RescoreButton runId={run.id} /> : null}
        {passes ? (
          <>
            {rows > 0 ? (
              <a
                href={`/api/export?run=${run.id}`}
                className="shrink-0 text-[12.5px] font-medium text-navy transition-opacity hover:opacity-70"
              >
                This run only
              </a>
            ) : null}
            <a
              href={`/api/export?run=${passes.a.id}&compare=${passes.b.id}`}
              title="Engine A's rows, the Engine Comparison and the Run Record for both passes"
              className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-navy px-4 text-[13px] font-medium text-paper transition-colors hover:bg-navy-deep"
            >
              <Download className="size-4" />
              Export both passes
            </a>
          </>
        ) : rows > 0 ? (
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
        snapshot={isReadOnlyDeployment()}
      />
    </div>
  );
}
