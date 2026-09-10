/**
 * A run's own words, read into a position, a pace, and a list of what went unread.
 * Pure: the same events always give the same reading, so the page can be tested without a run.
 */
import type { CellState, Pillar, Run, RunEvent } from "@/lib/data/types";

/** A provision as the reader cites it: instrument, the headings above it, then the section. */
export interface Citation {
  instrument: string;
  path: string[];
  section: string;
}

export type LegState = "done" | "reading" | "waiting";

export interface PillarLeg {
  id: number;
  name: string;
  /** Indicators in the pillar. The leg is drawn this wide, so the track shows real work. */
  indicators: number;
  answered: number;
  state: LegState;
}

export interface Reading {
  citation: Citation;
  indicatorId: string | null;
  done: number;
  total: number;
  seconds: number | null;
}

export interface Unread {
  id: number;
  at: string;
  indicatorId: string | null;
  citation: Citation;
  detail: string;
}

export interface Decision {
  id: number;
  at: string;
  indicatorId: string;
  score: number;
  state: CellState;
}

export interface RunProgress {
  legs: PillarLeg[];
  pillar: number | null;
  reading: Reading | null;
  decisions: Decision[];
  unread: Unread[];
  answered: number;
  readsDone: number;
  /** Median over the recent reads, which is steadier than a mean when one provision is long. */
  secondsPerRead: number | null;
  readsLeft: number | null;
  pillarSecondsLeft: number | null;
  pillarsLeft: number;
  lastSpokeAt: string | null;
}

const SUBJECT_SPLIT = " :: ";
const PATH_SPLIT = " > ";

/** "Copyright Act 2021 :: Division 7 > 131 Nature of copyright" read back into its parts. */
export function citation(subject: string | null): Citation {
  if (!subject) return { instrument: "", path: [], section: "" };
  const cut = subject.indexOf(SUBJECT_SPLIT);
  if (cut < 0) return { instrument: subject, path: [], section: "" };

  const instrument = subject.slice(0, cut);
  const parts = subject
    .slice(cut + SUBJECT_SPLIT.length)
    .split(PATH_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  return { instrument, path: parts.slice(0, -1), section: parts.at(-1) ?? "" };
}

/** The engine's own words about a refusal, said the way an analyst would say them. */
export function whyUnread(detail: string): string {
  if (/without finishing|cut off/i.test(detail)) return "The model never finished reading it";
  if (/did not answer|no answer|silent/i.test(detail)) return "The model answered with nothing";
  return "The model produced no reading";
}

/** "score 0.5 [restricted]" is how a decision is recorded. */
function decision(e: RunEvent): Decision | null {
  const m = /score\s+([\d.]+)\s*\[([a-z-]+)\]/i.exec(e.detail ?? "");
  if (!m || !e.indicatorId) return null;
  return {
    id: e.id,
    at: e.at,
    indicatorId: e.indicatorId,
    score: Number(m[1]),
    state: m[2] as CellState,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Which pillars this run was asked for, in the order the driver takes them. */
function asked(run: Run, rubric: Pillar[]): number[] {
  const ids = run.pillars === "all" ? rubric.map((p) => p.id) : [...run.pillars];
  return ids.sort((a, b) => a - b);
}

export function readProgress(run: Run, events: RunEvent[], rubric: Pillar[]): RunProgress {
  const byId = new Map(rubric.map((p) => [p.id, p]));
  const wanted = asked(run, rubric);

  // The driver opens each pillar with its own "pillars N" line, so the run says where it is.
  const opened: number[] = [];
  for (const e of events) {
    if (e.stage !== "run" || e.kind !== "started") continue;
    const m = /pillars?\s+(\d+)/.exec(e.detail ?? "");
    if (m) opened.push(Number(m[1]));
  }
  const current = run.status === "running" ? (opened.at(-1) ?? null) : null;

  const answeredIn = new Map<number, number>();
  const decisions: Decision[] = [];
  const unread: Unread[] = [];
  const readSeconds: number[] = [];
  let reading: Reading | null = null;
  let readsDone = 0;

  for (const e of events) {
    if (e.stage === "decide" && e.kind === "finished") {
      const d = decision(e);
      if (d) {
        decisions.push(d);
        if (e.pillarId) answeredIn.set(e.pillarId, (answeredIn.get(e.pillarId) ?? 0) + 1);
      }
    }
    if (e.kind === "refused" || e.kind === "failed") {
      unread.push({
        id: e.id,
        at: e.at,
        indicatorId: e.indicatorId,
        citation: citation(e.subject),
        detail: e.detail ?? "",
      });
    }
    if (e.stage === "read" && e.kind === "finished") {
      readsDone += 1;
      if (e.seconds !== null) readSeconds.push(e.seconds);
      reading = {
        citation: citation(e.subject),
        indicatorId: e.indicatorId,
        done: e.done ?? 0,
        total: e.total ?? 0,
        seconds: e.seconds,
      };
    }
  }

  const legs: PillarLeg[] = wanted.map((id) => {
    const p = byId.get(id);
    const started = opened.indexOf(id) >= 0;
    const state: LegState = id === current ? "reading" : started ? "done" : "waiting";
    return {
      id,
      name: p?.name ?? `Pillar ${id}`,
      indicators: p?.indicatorIds.length ?? 1,
      answered: answeredIn.get(id) ?? 0,
      state,
    };
  });

  const secondsPerRead = median(readSeconds.slice(-40));
  const readsLeft =
    reading && reading.total > 0 && current !== null ? Math.max(0, reading.total - reading.done) : null;

  return {
    legs,
    pillar: current,
    reading: current === null ? null : reading,
    decisions,
    unread,
    answered: decisions.length,
    readsDone,
    secondsPerRead,
    readsLeft,
    pillarSecondsLeft:
      readsLeft !== null && secondsPerRead !== null ? Math.round(readsLeft * secondsPerRead) : null,
    pillarsLeft: current === null ? 0 : wanted.length - wanted.indexOf(current) - 1,
    lastSpokeAt: events.at(-1)?.at ?? null,
  };
}
