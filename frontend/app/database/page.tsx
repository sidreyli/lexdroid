import { SidebarTrigger } from "@/components/ui/sidebar";
import { EconomyLinks, Scoreboard } from "@/components/database/scoreboard";
import { getRubric, getScoreboard } from "@/lib/data";

export const metadata = { title: "Database" };

export default function DatabasePage() {
  const board = getScoreboard();
  const rubric = getRubric();

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-4 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            Database
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            The latest score for every economy against every indicator. Rubric {rubric.version},{" "}
            {board.answeredTotal} of {board.indicatorsTotal} indicators answered.
          </p>
        </div>
        {/* Its own row under the title: nine economies no longer fit beside it. */}
        <div className="w-full sm:pl-10">
          <EconomyLinks economies={board.economies} />
        </div>
      </header>

      <Scoreboard board={board} />
    </div>
  );
}
