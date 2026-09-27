/**
 * What the monitor tells an analyst is only as true as this file.
 * The events here are copies of real rows, including the refusal that lost Privacy Principle 8.
 */
import { describe, expect, it } from "vitest";
import { citation, readProgress, whyUnread } from "./progress";
import type { Pillar, Run, RunEvent } from "@/lib/data/types";

const pillars: Pillar[] = [
  { id: 1, name: "Trade Facilitation", indicatorIds: ["1.1"] },
  { id: 2, name: "Trade Agreements", indicatorIds: ["2.1", "2.2", "2.3"] },
  { id: 4, name: "Intellectual Property Rights", indicatorIds: ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7"] },
  { id: 6, name: "Cross-border Data Policies", indicatorIds: ["6.1", "6.2", "6.3", "6.4"] },
];

const run: Run = {
  id: "r1",
  startedAt: "2026-09-10T13:39:29.309Z",
  finishedAt: null,
  economies: ["AUS"],
  pillars: [1, 2, 4, 6],
  engine: "engine-a",
  model: "gemma4-lex-16k",
  sourceMode: "fetch",
  codeRevision: "799bb4a",
  rubricDerivedAt: "2026-09-06T00:00:00.000Z",
  status: "running",
  notes: null,
  cells: 0,
  rows: 0,
  usd: 0,
  calls: 0,
  tokens: 0,
  wallSeconds: 0,
  stages: [],
};

let next = 1;
const event = (over: Partial<RunEvent>): RunEvent => ({
  id: next++,
  runId: "r1",
  at: "2026-09-10T14:00:00.000Z",
  economy: "AUS",
  pillarId: null,
  indicatorId: null,
  stage: "read",
  kind: "finished",
  subject: null,
  detail: null,
  seconds: null,
  done: null,
  total: null,
  ...over,
});

const opens = (pillar: number) =>
  event({ stage: "run", kind: "started", detail: `pillars ${pillar} on gemma4-lex-16k` });
const closes = (cells: number) => event({ stage: "run", kind: "finished", detail: `${cells} cells` });
const settles = (pillarId: number, indicatorId: string, detail: string) =>
  event({ stage: "decide", kind: "finished", pillarId, indicatorId, detail });
const reads = (subject: string, done: number, total: number, seconds: number) =>
  event({ stage: "read", kind: "finished", subject, done, total, seconds });

describe("reading a citation back into its parts", () => {
  it("splits the instrument from the headings and the section", () => {
    const c = citation(
      "Privacy Act 1988 :: Part III—Information privacy > Division 2 > 16A Permitted general situations",
    );
    expect(c.instrument).toBe("Privacy Act 1988");
    expect(c.path).toEqual(["Part III—Information privacy", "Division 2"]);
    expect(c.section).toBe("16A Permitted general situations");
  });

  it("keeps a subject that names only an instrument", () => {
    expect(citation("Competition Act 2004")).toEqual({
      instrument: "Competition Act 2004",
      path: [],
      section: "",
    });
  });

  it("survives an empty subject, which retrieval events carry", () => {
    expect(citation(null).instrument).toBe("");
  });
});

describe("where the run is", () => {
  const events = [
    opens(1),
    settles(1, "1.1", "score 0 [no-restriction]"),
    closes(1),
    opens(2),
    settles(2, "2.1", "score 1 [restricted]"),
    settles(2, "2.2", "score 0 [no-restriction]"),
    settles(2, "2.3", "score 0.5 [restricted]"),
    closes(3),
    opens(4),
    reads("Copyright Act 1968 :: Part V > 116CB Exception relating to national security", 108, 140, 10.2),
  ];
  const progress = readProgress(run, events, pillars);

  it("names the pillar the run has open, not the last one it finished", () => {
    expect(progress.pillar).toBe(4);
  });

  it("draws each leg as wide as the indicators it holds", () => {
    expect(progress.legs.map((l) => l.indicators)).toEqual([1, 3, 7, 4]);
  });

  it("draws a leg as wide as the indicators asked, when the run asked only some", () => {
    // The live test: two indicators of one pillar. Four wide, a finished run read "2 of 4".
    const two = readProgress({ ...run, pillars: [6], indicators: ["6.1", "6.4"] }, [], pillars);
    expect(two.legs.map((l) => l.indicators)).toEqual([2]);
  });

  it("marks the pillars behind it done, the one it opened reading, and the rest waiting", () => {
    expect(progress.legs.map((l) => l.state)).toEqual(["done", "done", "reading", "waiting"]);
  });

  it("counts the cells each pillar settled, which is how a shortfall becomes visible", () => {
    expect(progress.legs.map((l) => l.answered)).toEqual([1, 3, 0, 0]);
  });

  it("reads the position from the provision in hand", () => {
    expect(progress.reading?.done).toBe(108);
    expect(progress.reading?.total).toBe(140);
    expect(progress.reading?.citation.section).toBe(
      "116CB Exception relating to national security",
    );
  });

  it("counts the pillars still to come", () => {
    expect(progress.pillarsLeft).toBe(1);
  });
});

describe("how long the pillar has left", () => {
  const events = [
    opens(6),
    reads("A :: 1 One", 1, 10, 4),
    reads("A :: 2 Two", 2, 10, 100),
    reads("A :: 3 Three", 3, 10, 6),
  ];
  const progress = readProgress(run, events, pillars);

  it("takes the middle read, so one slow provision does not set the pace", () => {
    expect(progress.secondsPerRead).toBe(6);
  });

  it("estimates only the pillar in hand, there being no way to know the rest", () => {
    expect(progress.readsLeft).toBe(7);
    expect(progress.pillarSecondsLeft).toBe(42);
  });
});

describe("what went unread", () => {
  // The real refusal that lost Australia's cross-border disclosure provision.
  const refusal = event({
    kind: "refused",
    stage: "read",
    pillarId: 6,
    indicatorId: "6.4",
    subject:
      "Privacy Act 1988 :: Schedule 1 > 8 Australian Privacy Principle 8—cross-border disclosure of personal information",
    detail: "gemma4-lex-16k wrote 4096 tokens without finishing and was cut off at the 4096-token limit",
  });
  const progress = readProgress(run, [opens(6), refusal], pillars);

  it("keeps the provision that was not read, rather than dropping it", () => {
    expect(progress.unread).toHaveLength(1);
    expect(progress.unread[0]?.citation.section).toBe(
      "8 Australian Privacy Principle 8—cross-border disclosure of personal information",
    );
  });

  it("says why in words an analyst reads, keeping the engine's own words alongside", () => {
    expect(whyUnread(progress.unread[0]!.detail)).toBe("The model never finished reading it");
    expect(progress.unread[0]?.detail).toContain("4096");
  });
});

describe("a run that has stopped", () => {
  const finished = { ...run, status: "complete" as const };
  const progress = readProgress(finished, [opens(6), reads("A :: 1 One", 1, 4, 3)], pillars);

  it("is not reading anything, whatever its last event said", () => {
    expect(progress.reading).toBeNull();
    expect(progress.pillar).toBeNull();
  });

  it("still reports the last thing it said, so silence can be measured against it", () => {
    expect(progress.lastSpokeAt).toBe("2026-09-10T14:00:00.000Z");
  });
});
