import { SidebarTrigger } from "@/components/ui/sidebar";
import { Attention, type AttentionItem } from "@/components/home/attention";
import { Coverage, type CoverageSquare } from "@/components/home/coverage";
import { RecentRuns } from "@/components/home/recent-runs";
import { StartRun } from "@/components/home/start-run";
import {
  getCoverage,
  getEconomies,
  getExportRows,
  getRubric,
  getRuns,
} from "@/lib/data";
import { clip } from "@/lib/format";

export default function Home() {
  const rubric = getRubric();
  const economies = getEconomies().map((e) => ({ code: e.code, name: e.name }));
  const coverage = getCoverage();
  const rows = getExportRows();
  const runs = getRuns();

  const names = new Map(economies.map((e) => [e.code, e.name]));
  const labels = new Map(rubric.indicators.map((i) => [i.id, clip(i.category, 150)]));

  const squares: CoverageSquare[] = coverage.map((c) => ({
    economy: c.economy,
    economyName: names.get(c.economy) ?? c.economy,
    indicatorId: c.indicatorId,
    indicatorLabel: labels.get(c.indicatorId) ?? "",
    state: c.state,
    score: c.score,
  }));

  const failedGates = rows.reduce(
    (n, r) => n + r.gates.filter((g) => !g.passed).length,
    0,
  );
  const unresolved = coverage.filter((c) => c.state === "unresolved").length;

  const attention: AttentionItem[] = [
    {
      count: rows.length,
      label: "Findings to check",
      detail: "Each one cites a provision that no reviewer has confirmed yet",
      href: "/workbench",
      warm: true,
    },
    {
      count: failedGates,
      label: "Failed checks",
      detail: "A citation that did not survive its own verification",
      href: "/workbench?gate=failed",
      warm: true,
    },
    {
      count: unresolved,
      label: "Unresolved cells",
      detail: "Searched, and the search did not settle the question",
      href: "/database?state=unresolved",
      warm: false,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div>
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            Overview
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            Rubric {rubric.version}, {rubric.indicators.length} regulatory indicators across{" "}
            {rubric.pillars.length} pillars.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <Coverage pillars={[...rubric.pillars]} economies={economies} squares={squares} />

        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <StartRun economies={economies} pillars={[...rubric.pillars]} />
          </div>
          <div className="xl:col-span-4">
            <Attention items={attention} />
          </div>
          <div className="lg:col-span-2 xl:col-span-3">
            <RecentRuns runs={runs.slice(0, 6)} economies={economies} />
          </div>
        </div>
      </div>
    </div>
  );
}
