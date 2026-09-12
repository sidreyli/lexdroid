import { SidebarTrigger } from "@/components/ui/sidebar";
import { Composition, Reach } from "@/components/corpus/reach";
import { Register } from "@/components/corpus/register";
import { UnreadLedger } from "@/components/corpus/unread";
import { getEconomies } from "@/lib/data";
import {
  corpusOverview,
  registerFacets,
  searchRegister,
  type ReadState,
  type RegisterFilters,
} from "@/lib/data/corpus";

// Read at request time: the register is searched from the query string.
export const dynamic = "force-dynamic";
export const metadata = { title: "Corpus" };

const num = (n: number) => n.toLocaleString("en-GB");
const READ_STATES = new Set<ReadState>(["read", "unread", "unfetched"]);

const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v) || undefined;

export default async function CorpusPage({ searchParams }: PageProps<"/corpus">) {
  const params = await searchParams;
  const read = one(params.read);
  const filters: RegisterFilters = {
    economy: one(params.economy)?.toUpperCase(),
    kind: one(params.kind),
    status: one(params.status),
    read: read && READ_STATES.has(read as ReadState) ? (read as ReadState) : undefined,
    q: one(params.q),
    page: Number(one(params.page)) || 1,
  };

  const overview = corpusOverview();
  const economies = getEconomies();
  const names = new Map(economies.map((e) => [e.code, e.name]));
  const result = searchRegister(filters);
  const facets = registerFacets();

  if (!overview) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
        <header className="py-6 sm:py-8">
          <h1 className="text-[24px] font-semibold tracking-tight text-navy-deep">Corpus</h1>
        </header>
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          There is no store here yet. Run the setup, then start a run from the overview, and the
          register will fill as the portals are walked.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
        <div className="min-w-0">
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            Corpus
          </h1>
          <p className="mt-0.5 max-w-[82ch] text-[13.5px] leading-snug text-muted-foreground">
            {num(overview.registered)} instruments are registered across{" "}
            {overview.economies.length} economies. {num(overview.fetched)} of them have been
            fetched, and the {num(overview.sections)} sections that came out are what every answer
            is read from.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5">
        <section className="bg-card lift grid gap-x-12 gap-y-7 rounded-3xl p-6 sm:p-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <div>
            <h2 className="text-[18px] leading-tight font-semibold tracking-tight text-navy-deep">
              How far the register has been read
            </h2>
            <p className="mt-2 max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">
              The register is the search space, not the reading list. Every instrument is recorded
              from its portal&rsquo;s own listing &mdash; title, number, kind and where it lives
              &mdash; without fetching one of them. A question is then matched against that record,
              and only the instruments it turns on are retrieved.
            </p>
            <p className="mt-3 max-w-[46ch] text-[13.5px] leading-relaxed text-muted-foreground">
              This is why the filled part of each bar is small, and why that is not a shortfall.
              Downloading a whole statute book would take tens of thousands of requests, and the
              portals refuse sustained crawling well before that. An instrument that later proves
              relevant is fetched then.
            </p>
          </div>
          <Reach economies={overview.economies} names={names} />
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="bg-card lift min-w-0 rounded-3xl p-6 sm:p-7">
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              What the register holds
            </h2>
            <p className="mt-2 mb-5 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
              Shaded by how much weight an instrument carries: darkest for Acts, lighter for the
              subsidiary legislation made under them, ochre for what binds only the entities it is
              issued to, and pale for guidance that binds nobody.
            </p>
            <Composition economies={overview.economies} names={names} />
          </section>

          <section className="bg-card lift min-w-0 rounded-3xl p-6 sm:p-7">
            <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
              What could not be read
            </h2>
            <p className="mt-2 mb-5 max-w-[60ch] text-[13px] leading-relaxed text-muted-foreground">
              {num(overview.unread)} fetched documents produced no usable text. Each one is recorded
              with the reason, so a cell that finds nothing is never quietly resting on a document
              nobody could read.
            </p>
            <UnreadLedger economies={overview.economies} names={names} />
            {overview.sectionsCounted > overview.sections ? (
              <p className="mt-4 max-w-[60ch] text-[12.5px] leading-relaxed text-ochre">
                A further {num(overview.sectionsCounted - overview.sections)} sections were tallied
                when their documents were parsed and are not in the store. Those documents carry a
                section count, so nothing marks them unread and nothing can be retrieved from them
                either. That is a fault on this side, not in the source.
              </p>
            ) : null}
          </section>
        </div>

        <Register
          filters={filters}
          result={result}
          facets={facets}
          economies={economies.map((e) => ({ code: e.code, name: e.name }))}
        />
      </div>

      <footer className="mt-8 max-w-[78ch] text-[11.5px] leading-relaxed text-muted-foreground">
        Counted from the working store as this page was rendered, across {overview.portals} declared
        source portals. Fetches honour each host&rsquo;s robots.txt and are rate limited per host.
      </footer>
    </div>
  );
}
