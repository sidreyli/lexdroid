import { PageSidebarTrigger } from "@/components/shell/page-sidebar-trigger";
import { RubricBook } from "@/components/rubric/rubric-book";
import { getCurrentCells, getEconomies, getRubric } from "@/lib/data";
import { readBook } from "@/lib/rubric/book";

export const metadata = { title: "Rubric" };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function RubricPage() {
  const book = readBook(getRubric(), getCurrentCells());
  const names = Object.fromEntries(getEconomies().map((e) => [e.code, e.name]));

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <PageSidebarTrigger />
        <div className="min-w-0">
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-navy-deep">
            Rubric
          </h1>
          <p className="mt-0.5 max-w-[80ch] text-[13.5px] leading-snug text-muted-foreground">
            The {book.indicators} regulatory indicators this system answers, in ESCAP&rsquo;s own
            words. Version {book.version}, read from the methodology sheet on {day(book.derivedAt)}.
          </p>
        </div>
      </header>

      {/*
        Explanation on one side, what it looks like on the other. The paragraph alone left most of
        the card empty once the page grew wider than a line of reading.
      */}
      <section className="bg-card lift mb-5 grid gap-x-12 gap-y-6 rounded-3xl p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
            How a score is arrived at
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            Every indicator scores on published steps, and a run may only land on one of them. The
            model reads the law and reports what it found; the step is then chosen by rule, which is
            why the same evidence always gives the same score. Where an economy has been answered,
            its code sits on the step it met &mdash; solid where a measure was found, outlined where
            the governing law imposes none.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl bg-inset p-5">
          <p className="flex items-baseline gap-2.5">
            <span className="tnum text-[28px] leading-none font-semibold tracking-tight text-navy-deep">
              {book.answered}
            </span>
            <span className="text-[13px] leading-snug text-muted-foreground">
              of {book.indicators} indicators answered for at least one economy
            </span>
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-edge">
            <div
              className="h-full rounded-full bg-navy"
              style={{ width: `${book.indicators ? (book.answered / book.indicators) * 100 : 0}%` }}
            />
          </div>
          <ul className="flex flex-col gap-2 text-[12.5px] text-muted-foreground">
            <li className="flex items-center gap-2.5">
              <span className="w-10 shrink-0 rounded-full bg-navy py-0.5 text-center text-[10.5px] leading-none font-medium text-paper">
                SGP
              </span>
              A measure was found at this step
            </li>
            <li className="flex items-center gap-2.5">
              <span className="w-10 shrink-0 rounded-full bg-paper py-0.5 text-center text-[10.5px] leading-none font-medium text-muted-foreground ring-1 ring-edge">
                SGP
              </span>
              The governing law imposes none
            </li>
          </ul>
        </div>
      </section>

      <RubricBook book={book} names={names} />
    </div>
  );
}
