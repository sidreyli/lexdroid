import { notFound } from "next/navigation";
import Link from "next/link";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { InstrumentLadder } from "@/components/economies/ladder";
import { Commitments, PortalList } from "@/components/economies/portals";
import { getEconomy } from "@/lib/data";
import { corpusOverview } from "@/lib/data/corpus";
import { languageName } from "@/lib/format";

// Read at request time: the counts beside each rung come from the working register.
export const dynamic = "force-dynamic";

const num = (n: number) => n.toLocaleString("en-GB");

export async function generateMetadata({ params }: PageProps<"/economies/[code]">) {
  const { code } = await params;
  return { title: getEconomy(code)?.name ?? "Economy" };
}

export default async function EconomyProfilePage({ params }: PageProps<"/economies/[code]">) {
  const { code } = await params;
  const economy = getEconomy(code);
  if (!economy) notFound();

  const corpus = corpusOverview()?.economies.find((c) => c.code === economy.code);
  const counts = new Map((corpus?.kinds ?? []).map((k) => [k.kind, k.count]));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div className="min-w-0">
          <Link
            href="/economies"
            className="text-[12.5px] text-muted-foreground underline-offset-[3px] hover:underline"
          >
            Economies
          </Link>
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            {economy.name}
          </h1>
          <p className="mt-0.5 text-[13.5px] leading-snug text-muted-foreground">
            {economy.legalSystem.family.replace(/-/g, " ")}, published in{" "}
            {economy.officialLanguages.map(languageName).join(", ")}.{" "}
            <Link
              href={`/database/${economy.code.toLowerCase()}`}
              className="underline-offset-[3px] hover:underline"
            >
              See how it scores
            </Link>
            .
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <section className="bg-card lift grid gap-x-10 gap-y-6 rounded-3xl p-6 sm:p-8 lg:grid-cols-2">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              How the law is published
            </h2>
            <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-muted-foreground">
              {economy.legalSystem.note}
            </p>
          </div>
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              Which language governs
            </h2>
            <p className="mt-2 max-w-[68ch] text-[13.5px] leading-relaxed text-muted-foreground">
              {economy.languageNote ??
                `Official languages: ${economy.officialLanguages.map(languageName).join(", ")}.`}
            </p>
          </div>
        </section>

        {economy.instrumentTypes?.length ? (
          <section className="bg-card lift rounded-3xl p-6 sm:p-8">
            <h2 className="text-[18px] leading-tight font-semibold tracking-tight text-navy-deep">
              What outranks what
            </h2>
            <p className="mt-2 mb-6 max-w-[72ch] text-[13.5px] leading-relaxed text-muted-foreground">
              A run may only report an obligation from an instrument that creates one. Guidance says
              how a regulator reads a statute, and a row that cites guidance where a statute governs
              is wrong even when the words match. The count beside each rung is what the register
              holds of it today.
            </p>
            <InstrumentLadder types={economy.instrumentTypes} counts={counts} />
          </section>
        ) : null}

        <section className="bg-card lift rounded-3xl p-6 sm:p-8">
          <h2 className="text-[18px] leading-tight font-semibold tracking-tight text-navy-deep">
            Where the law is fetched from
          </h2>
          <div className="mt-4">
            <PortalList portals={economy.portals} />
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="bg-card lift min-w-0 rounded-3xl p-6 sm:p-7">
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              What has been read
            </h2>
            <dl className="mt-4 flex flex-col">
              {[
                ["Instruments registered", num(corpus?.registered ?? 0)],
                ["Recorded as in force", num(corpus?.inForce ?? 0)],
                ["Instruments fetched", num(corpus?.fetched ?? 0)],
                ["Documents fetched", num(corpus?.documents ?? 0)],
                ["Sections indexed", num(corpus?.sections ?? 0)],
                ["Sections searchable by meaning", num(corpus?.embedded ?? 0)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-t border-edge py-2"
                >
                  <dt className="text-[12.5px] text-muted-foreground">{label}</dt>
                  <dd className="tnum text-[13.5px] text-navy-deep">{value}</dd>
                </div>
              ))}
            </dl>
            {corpus?.unread.length ? (
              <p className="mt-4 max-w-[60ch] text-[12.5px] leading-relaxed text-muted-foreground">
                {num(corpus.unread.reduce((a, u) => a + u.count, 0))} fetched documents could not be
                read.{" "}
                <Link
                  href={`/corpus?economy=${economy.code}&read=unread`}
                  className="underline-offset-[3px] hover:underline"
                >
                  Find them in the corpus
                </Link>
                , where each is recorded with its reason.
              </p>
            ) : null}
          </section>

          {economy.commitments?.length ? (
            <section className="bg-card lift min-w-0 rounded-3xl p-6 sm:p-7">
              <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
                Trade commitments
              </h2>
              <p className="mt-2 mb-4 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
                Agreements this economy is party to. They are context for a reading, never the
                source of a domestic obligation.
              </p>
              <Commitments commitments={economy.commitments} />
            </section>
          ) : null}
        </div>

        {economy.notes ? (
          <section className="bg-card lift rounded-3xl p-6 sm:p-8">
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              Why this economy is in the set
            </h2>
            <p className="mt-2 max-w-[80ch] text-[13.5px] leading-relaxed text-muted-foreground">
              {economy.notes}
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
