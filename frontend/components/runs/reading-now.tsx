import { cn } from "@/lib/utils";
import { duration } from "@/lib/format";
import type { Reading } from "@/lib/runs/progress";

/** Reads run from two seconds to four minutes, so silence only means trouble well past that. */
function silence(seconds: number): { text: string; tone: string } {
  if (seconds < 90) return { text: `spoke ${duration(seconds)} ago`, tone: "text-muted-foreground" };
  if (seconds < 300) return { text: `quiet for ${duration(seconds)}`, tone: "text-ochre" };
  return { text: `nothing for ${duration(seconds)}`, tone: "text-brick" };
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="tnum text-[19px] leading-none font-semibold tracking-tight text-navy-deep">
        {value}
      </p>
      <p className="mt-1.5 text-[12px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}

export function ReadingNow({
  reading,
  secondsPerRead,
  pillarSecondsLeft,
  pillarsLeft,
  silentFor,
}: {
  reading: Reading | null;
  secondsPerRead: number | null;
  pillarSecondsLeft: number | null;
  pillarsLeft: number;
  silentFor: number | null;
}) {
  const quiet = silentFor === null ? null : silence(silentFor);

  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="flex items-center gap-2.5 text-[13px] font-medium text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full bg-ochre motion-safe:animate-pulse" />
          Reading now
        </h2>
        {quiet ? <p className={cn("tnum text-[12.5px]", quiet.tone)}>{quiet.text}</p> : null}
      </div>

      {reading ? (
        <>
          <p className="mt-4 text-[14.5px] leading-snug font-medium text-navy">
            {reading.citation.instrument}
          </p>
          {reading.citation.path.length > 0 ? (
            <p className="mt-1 max-w-[80ch] text-[12.5px] leading-snug text-muted-foreground">
              {reading.citation.path.join(" › ")}
            </p>
          ) : null}
          <p className="mt-2 max-w-[46ch] text-[26px] leading-[1.15] font-semibold tracking-tight text-navy-deep">
            {reading.citation.section || reading.citation.instrument}
          </p>

          <div className="mt-6 flex flex-wrap gap-x-10 gap-y-5 border-t border-edge pt-5">
            <Figure
              value={reading.total ? `${reading.done} of ${reading.total}` : String(reading.done)}
              label={reading.indicatorId ? `provisions read for ${reading.indicatorId}` : "provisions read"}
            />
            {secondsPerRead !== null ? (
              <Figure value={duration(secondsPerRead)} label="typical time on a provision" />
            ) : null}
            {pillarSecondsLeft !== null ? (
              <Figure value={duration(pillarSecondsLeft)} label="left in this pillar" />
            ) : null}
            <Figure
              value={String(pillarsLeft)}
              label={pillarsLeft === 1 ? "pillar after this one" : "pillars after this one"}
            />
          </div>
        </>
      ) : (
        <p className="mt-4 max-w-[60ch] text-[14px] leading-relaxed text-muted-foreground">
          The run has opened but has not reached a provision yet. Retrieval runs first, and it
          decides which provisions are worth reading.
        </p>
      )}
    </section>
  );
}
