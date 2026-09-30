"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { duration, relativeTime } from "@/lib/format";
import { useNow } from "@/lib/runs/now";
import { PillarTrack } from "./pillar-track";
import type { PillarLeg, Reading } from "@/lib/runs/progress";

/** A read can take four minutes, so only a much longer silence means the run has stopped. */
const STALLED_AFTER_SECONDS = 10 * 60;

export interface RunCard {
  id: string;
  where: string;
  pillarsAsked: string;
  startedAt: string;
  lastSpokeAt: string | null;
  legs: PillarLeg[];
  reading: Reading | null;
}

function Card({ card, silentFor }: { card: RunCard; silentFor: number | null }) {
  const stalled = silentFor !== null && silentFor > STALLED_AFTER_SECONDS;
  const reading = card.reading;

  return (
    <Link
      href={`/runs/${card.id}`}
      className="bg-card lift block rounded-3xl p-6 transition-shadow hover:shadow-[0_1px_2px_rgb(19_26_34/0.04),0_16px_40px_-14px_rgb(23_50_78/0.22)] sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h3 className="flex items-center gap-2.5">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              stalled ? "bg-slate-soft" : "bg-ochre motion-safe:animate-pulse",
            )}
          />
          <span className="text-[17px] font-semibold tracking-tight text-navy-deep">
            {card.where}
          </span>
          <span className="text-[13.5px] text-muted-foreground">{card.pillarsAsked}</span>
        </h3>
        <p className="tnum text-[13px] text-muted-foreground">
          started {relativeTime(card.startedAt)}
        </p>
      </div>

      {card.lastSpokeAt ? (
        <div className={cn("mt-6", stalled && "opacity-55")}>
          <PillarTrack legs={card.legs} reading={reading} />
        </div>
      ) : null}

      {stalled ? (
        <p className="mt-5 text-[13px] leading-tight text-muted-foreground">
          Marked as running, but it has said nothing for {duration(silentFor)}. It has most likely
          stopped.
        </p>
      ) : reading ? (
        <p className="mt-5 truncate text-[13px] leading-tight text-muted-foreground">
          <span className="text-navy-deep">
            {reading.citation.section || reading.citation.instrument}
          </span>
          {reading.citation.section ? `, ${reading.citation.instrument}` : ""}
        </p>
      ) : (
        <p className="mt-5 text-[13px] leading-tight text-muted-foreground">
          Searching for the provisions worth reading.
        </p>
      )}
    </Link>
  );
}

export function LiveRuns({ cards }: { cards: RunCard[] }) {
  const now = useNow();
  const silence = (card: RunCard): number | null =>
    now === null
      ? null
      : Math.max(0, now - Math.floor(new Date(card.lastSpokeAt ?? card.startedAt).getTime() / 1000));

  // Before the browser reports a clock, every run is shown as working rather than guessed at.
  const working = cards.filter((c) => (silence(c) ?? 0) <= STALLED_AFTER_SECONDS);
  const quiet = cards.filter((c) => (silence(c) ?? 0) > STALLED_AFTER_SECONDS);

  return (
    <>
      {working.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-navy-deep">
            {working.length === 1 ? "One run is working" : `${working.length} runs are working`}
          </h2>
          {working.map((c) => (
            <Card key={c.id} card={c} silentFor={silence(c)} />
          ))}
        </section>
      ) : (
        <section className="bg-card lift rounded-3xl p-6 sm:p-7">
          <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
            Nothing is running
          </h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
            Start a run from the overview and it will appear here while it works, provision by
            provision.
          </p>
        </section>
      )}

      {quiet.length > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-[15px] font-semibold tracking-tight text-navy-deep">
            {quiet.length === 1 ? "One run went quiet" : `${quiet.length} runs went quiet`}
          </h2>
          {quiet.map((c) => (
            <Card key={c.id} card={c} silentFor={silence(c)} />
          ))}
        </section>
      ) : null}
    </>
  );
}
