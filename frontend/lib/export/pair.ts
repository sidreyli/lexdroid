/**
 * Which two runs are the live hour's two passes.
 *
 * The Engine Comparison sheet was built but reachable only by typing `?compare=` into a URL, so on
 * the day it would have come out with Engine B's column empty. The pair is found here instead,
 * from what the runs themselves record: the same economies, pillars and indicators, a different
 * engine, both complete. Engine A is the pass that fetched; Engine B the one that read the cache.
 */
import type { Run } from "@/lib/data/types";

export interface Passes {
  a: Run;
  b: Run;
}

const scope = (r: Run): string =>
  JSON.stringify([
    [...r.economies].sort(),
    r.pillars === "all" ? "all" : [...r.pillars].sort((x, y) => x - y),
    r.indicators ? [...r.indicators].sort() : null,
  ]);

/** The run and the other engine's pass over the same draw, as A and B, or null if there is none. */
export function passesOf(run: Run, runs: readonly Run[]): Passes | null {
  if (run.status !== "complete") return null;
  const at = (r: Run) => new Date(r.startedAt).getTime();
  const partner = runs
    .filter((r) => r.id !== run.id && r.status === "complete" && r.engine !== run.engine && scope(r) === scope(run))
    // A pass of the other kind first -- a fetch against a cache-only read is the pair the sheet is
    // for -- then the nearest in time, which is the hour's rather than last week's.
    .sort(
      (x, y) =>
        Number(x.sourceMode === run.sourceMode) - Number(y.sourceMode === run.sourceMode) ||
        Math.abs(at(x) - at(run)) - Math.abs(at(y) - at(run)),
    )[0];
  if (!partner) return null;
  const [a, b] =
    run.sourceMode !== partner.sourceMode
      ? run.sourceMode === "fetch" ? [run, partner] : [partner, run]
      : at(run) <= at(partner) ? [run, partner] : [partner, run];
  return { a, b };
}

/**
 * Clock time where the live test is held. The template asks for hh:mm, and a steward in Bangkok
 * reading 03:15 for a pass started at 10:15 would be reading UTC, which is what the sheet printed.
 */
export const LIVE_TEST_TIME_ZONE = "Asia/Bangkok";

export function clockAt(iso: string | null | undefined, timeZone = LIVE_TEST_TIME_ZONE): string {
  if (!iso) return "";
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(t);
}
