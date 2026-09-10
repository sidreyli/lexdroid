import { SidebarTrigger } from "@/components/ui/sidebar";
import { RubricBook } from "@/components/rubric/rubric-book";
import { getCurrentCells, getRubric } from "@/lib/data";
import { readBook } from "@/lib/rubric/book";

export const metadata = { title: "Rubric" };

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

export default function RubricPage() {
  const book = readBook(getRubric(), getCurrentCells());

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 pb-16 sm:px-8">
      <header className="flex items-center gap-3 py-6 sm:py-8">
        <SidebarTrigger className="-ml-1 size-8 rounded-lg text-muted-foreground" />
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

      <section className="bg-card lift mb-5 rounded-3xl p-6 sm:p-7">
        <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
          How a score is arrived at
        </h2>
        <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Every indicator scores on published steps, and a run may only land on one of them. The
          model reads the law and reports what it found; the step is then chosen by rule, which is
          why the same evidence always gives the same score. Where an economy has been answered, its
          code sits on the step it met &mdash; solid where a measure was found, outlined where the
          governing law imposes none.
        </p>
        <p className="mt-2 max-w-[72ch] text-[13.5px] leading-relaxed text-muted-foreground">
          {book.answered} of {book.indicators} indicators have been answered for at least one
          economy so far.
        </p>
      </section>

      <RubricBook book={book} />

      <footer className="mt-8 max-w-[72ch] text-[11.5px] leading-relaxed text-muted-foreground">
        Derived, not transcribed. Every criterion on this page is read from{" "}
        {book.sources.map((s) => s.document).join(", ")} by a script in this repository, so a
        correction to the source becomes a correction here.
      </footer>
    </div>
  );
}
