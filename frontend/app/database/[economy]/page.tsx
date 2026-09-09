import { notFound } from "next/navigation";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { BarRows, type BarRow } from "@/components/database/ladder";
import { IndicatorRow } from "@/components/database/indicator-row";
import { getEconomies, getEconomyScores } from "@/lib/data";
import { languageName } from "@/lib/format";

const RULER = [0, 0.25, 0.5, 0.75, 1];

export function generateStaticParams() {
  return getEconomies().map((e) => ({ economy: e.code.toLowerCase() }));
}

export default async function EconomyPage({ params }: PageProps<"/database/[economy]">) {
  const { economy } = await params;
  const scores = getEconomyScores(economy);
  if (!scores) notFound();

  const code = scores.economy.code;
  const bars: BarRow[] = scores.pillars.map((p) => ({
    key: String(p.id),
    label: `${p.id}. ${p.name}`,
    value: p.mean,
    note: p.answered === 0 ? "" : `${p.answered} of ${p.total} answered`,
  }));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div className="min-w-0">
          <Link
            href="/database"
            className="text-[12.5px] text-muted-foreground underline-offset-[3px] hover:underline"
          >
            Database
          </Link>
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            {scores.economy.name}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-muted-foreground">
            {scores.economy.legalSystem.family.replace("-", " ")}, published in{" "}
            {scores.economy.officialLanguages.map(languageName).join(", ")}. {scores.answered} of{" "}
            {scores.indicatorsTotal} indicators answered.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <section className="bg-card lift grid gap-x-12 gap-y-7 rounded-3xl p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,34rem)]">
          <div className="max-w-[46ch]">
            <h2 className="flex items-baseline gap-3">
              <span className="tnum text-[34px] leading-none font-semibold tracking-tight text-navy-deep">
                {scores.overall === null ? "--" : scores.overall.toFixed(2)}
              </span>
              <span className="text-[14px] text-muted-foreground">
                across {scores.pillarsComplete} of {scores.pillarsTotal} pillars
              </span>
            </h2>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              A pillar reports a mean once every indicator in it has been answered. The figure above
              averages only those pillars, unweighted, so it moves as more of the rubric is scored.
            </p>
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted-foreground">
              {scores.economy.legalSystem.note}
            </p>
          </div>

          <div className="min-w-0">
            <p className="mb-2 text-[11.5px] text-muted-foreground/80">By pillar</p>
            <BarRows rows={bars} ticks={RULER} axis />
            <p className="mt-3 text-[12px] text-muted-foreground/80">
              A dashed line is a pillar nothing has attempted yet.
            </p>
          </div>
        </section>

        {scores.pillars.map((p) =>
          p.answered > 0 ? (
            <section key={p.id} className="bg-card lift-sm rounded-3xl px-4 py-6 sm:px-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-2">
                <h2 className="flex items-baseline gap-2.5">
                  <span className="tnum text-[13px] font-semibold text-navy">{p.id}</span>
                  <span className="text-[17px] leading-tight font-semibold tracking-tight text-navy-deep">
                    {p.name}
                  </span>
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                  {p.mean === null
                    ? `${p.answered} of ${p.total} answered, no mean yet`
                    : `Pillar mean ${p.mean.toFixed(2)} over ${p.total} indicators`}
                </p>
              </div>
              <div className="mt-4">
                {p.indicators.map((row) => (
                  <IndicatorRow key={row.indicatorId} economy={code} row={row} />
                ))}
              </div>
            </section>
          ) : (
            <div
              key={p.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-1.5 sm:px-8"
            >
              <span className="tnum text-[12px] font-semibold text-muted-foreground/80">{p.id}</span>
              <span className="text-[13px] leading-tight text-muted-foreground">{p.name}</span>
              <span className="ml-auto text-[11.5px] text-muted-foreground/70">
                {p.total} indicators, not attempted
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
