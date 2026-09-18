import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Comparison, type Column } from "@/components/economies/comparison";
import { getEconomies } from "@/lib/data";
import { corpusOverview } from "@/lib/data/corpus";
import { clip } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Economies" };

/**
 * How many cards to put across, so the last row is not one lonely card.
 *
 * The widest layout that divides the set evenly, up to four -- four economies read better as one
 * row of four or two rows of two than as three and a straggler.
 */
function evenColumns(n: number): number {
  for (let c = 4; c > 1; c -= 1) if (n % c === 0) return c;
  return Math.min(n, 3) || 1;
}

export default function EconomiesPage() {
  const economies = [...getEconomies()].sort((a, b) => a.name.localeCompare(b.name));
  const corpus = corpusOverview();
  const columns: Column[] = economies.map((economy) => ({
    economy,
    corpus: corpus?.economies.find((c) => c.code === economy.code),
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            Economies
          </h1>
          <p className="mt-0.5 max-w-[80ch] text-[13.5px] leading-snug text-muted-foreground">
            How each jurisdiction publishes its law, and where this system goes to read it. A
            citation is only as good as the rung it came from, so the hierarchy is written down
            before anything is scored.
          </p>
        </div>
      </header>

      <section className="bg-card lift mb-5 rounded-3xl p-6 sm:p-8">
        <h2 className="text-[18px] leading-tight font-semibold tracking-tight text-navy-deep">
          Where they differ
        </h2>
        <p className="mt-2 mb-6 max-w-[72ch] text-[13.5px] leading-relaxed text-muted-foreground">
          The profiles agree on most of their shape. These are the lines where they do not, and
          each one changes how a run has to behave.
        </p>
        <Comparison columns={columns} />
      </section>

      {/*
        As many columns as divide the set evenly, up to four. A fixed three left the fourth
        economy alone on a row of its own; the count is not a constant, so neither is the grid.
      */}
      <div
        className="grid gap-4 sm:grid-cols-2"
        style={{ gridTemplateColumns: `repeat(${evenColumns(columns.length)}, minmax(0, 1fr))` }}
      >
        {columns.map(({ economy, corpus: c }) => (
          <Link
            key={economy.code}
            href={`/economies/${economy.code.toLowerCase()}`}
            className="bg-card lift-sm flex flex-col rounded-3xl p-6 transition-shadow hover:shadow-[var(--lift)]"
          >
            <div className="flex items-baseline gap-2.5">
              <h3 className="text-[17px] font-semibold tracking-tight text-navy-deep">
                {economy.name}
              </h3>
              <span className="tnum text-[12px] text-muted-foreground">{economy.code}</span>
            </div>
            <p className="mt-2.5 flex-1 text-[13px] leading-relaxed text-muted-foreground">
              {clip(economy.legalSystem.note, 230)}
            </p>
            <p className="tnum mt-4 text-[12.5px] text-muted-foreground">
              {(c?.registered ?? 0).toLocaleString("en-GB")} instruments registered,{" "}
              {(c?.sections ?? 0).toLocaleString("en-GB")} sections read
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
