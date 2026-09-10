/**
 * The rubric page is a reference document, so a wrong band is a wrong answer on paper.
 * The fixtures here are copies of real rows, 6.2 included.
 */
import { describe, expect, it } from "vitest";
import { matches, readBook, rowOf } from "./book";
import type { Cell, Rubric } from "@/lib/data/types";

const rubric: Rubric = {
  version: "2.1",
  derivedAt: "2026-09-07T12:04:14.114Z",
  pillars: [
    { id: 6, name: "Cross-border Data Policies", indicatorIds: ["6.2"] },
    { id: 8, name: "Internet Intermediary Liability", indicatorIds: ["8.1"] },
  ],
  indicators: [
    {
      id: "6.2",
      pillarId: 6,
      pillarName: "Cross-border Data Policies",
      category: "Local storage requirements",
      exception: "Not score data localization measure applied to government data.",
      criteriaText: "1) ... 2) ... 3) No requirement",
      bands: [
        { score: 1, criterion: "Local storage requirement for all sectors or personal data", ordinal: 1 },
        { score: 0.5, criterion: "Local storage requirement applied to specific sector", ordinal: 2 },
        { score: 0, criterion: "No requirement", ordinal: 3 },
      ],
      shape: "provision",
      shapeBasis: "Default. A specific provision in a specific instrument answers this indicator.",
      provenance: {
        document: "docs/database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx",
        locator: 'sheet "RDTII 2.1 Methodology", row 31',
      },
    },
    {
      id: "8.1",
      pillarId: 8,
      pillarName: "Internet Intermediary Liability",
      category: "Intermediary liability for copyright infringement",
      exception: null,
      criteriaText: "1) ... 2) ... 3) ...",
      bands: [
        { score: 1, criterion: "No intermediary liability framework in place", ordinal: 1 },
        { score: 0.5, criterion: "Sectoral framework in place", ordinal: 2 },
        { score: 0, criterion: "Horizontal framework in place", ordinal: 3 },
      ],
      shape: "framework",
      shapeBasis: "METHODOLOGY band text for 8.1: the question is about a framework.",
      provenance: {
        document: "docs/database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx",
        locator: 'sheet "RDTII 2.1 Methodology", row 45',
      },
    },
  ],
  nonRegulatory: ["1.1", "1.2"],
  sources: [{ document: "docs/database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx", locator: "" }],
};

let next = 1;
const cell = (over: Partial<Cell>): Cell => ({
  id: next++,
  runId: "r1",
  economy: "AUS",
  indicatorId: "6.2",
  state: "restricted",
  unresolvedReason: null,
  answeredAt: "2026-09-10T13:54:00.336Z",
  queries: [],
  depth: null,
  surfaced: null,
  sectionsIndexed: null,
  sectionsRead: null,
  score: 0.5,
  bandOrdinal: 2,
  bandCriterion: null,
  decidingFact: null,
  rationale: null,
  computedAt: null,
  controllingInstrumentId: null,
  controllingInstrument: null,
  controllingInstrumentUrl: null,
  runStartedAt: "2026-09-10T13:19:49.000Z",
  runStatus: "complete",
  engine: "engine-a",
  model: "gemma4-lex-16k",
  sourceMode: "fetch",
  ...over,
});

describe("the rubric as a book", () => {
  const book = readBook(rubric, [
    cell({ economy: "AUS", bandOrdinal: 2, score: 0.5 }),
    cell({ economy: "SGP", bandOrdinal: 3, score: 0, state: "no-restriction" }),
  ]);
  const [six] = book.pillars;
  const [indicator] = six!.indicators;

  it("keeps ESCAP's bands in their own order, highest score first", () => {
    expect(indicator!.bands.map((b) => b.score)).toEqual([1, 0.5, 0]);
  });

  it("sits an economy on the band its cell recorded, not on one matched by score", () => {
    expect(indicator!.bands[1]?.met).toEqual([{ economy: "AUS", state: "restricted" }]);
    expect(indicator!.bands[2]?.met).toEqual([{ economy: "SGP", state: "no-restriction" }]);
    expect(indicator!.bands[0]?.met).toEqual([]);
  });

  it("carries the carve-out, which governs how the bands are read", () => {
    expect(indicator!.exception).toContain("government data");
  });

  it("says nothing about shape where a provision answers the indicator", () => {
    expect(indicator!.shapeNote).toBeNull();
  });

  it("marks the indicators no single provision can answer", () => {
    const eight = book.pillars[1]!.indicators[0]!;
    expect(eight.shapeNote).toContain("No single provision");
    expect(eight.shapeBasis).toContain("METHODOLOGY");
  });

  it("counts a pillar as answered only where a run reached it", () => {
    expect(book.pillars[0]?.answered).toBe(1);
    expect(book.pillars[1]?.answered).toBe(0);
    expect(book.answered).toBe(1);
  });

  it("names the row rather than repeating the sheet's path sixty-one times", () => {
    expect(indicator!.row).toBe("Methodology sheet, row 31");
    expect(rowOf("somewhere else")).toBe("somewhere else");
  });
});

describe("a cell that reached no band", () => {
  const book = readBook(rubric, [
    cell({ economy: "AUS", state: "unresolved", bandOrdinal: null, score: null, unresolvedReason: "The search did not settle it." }),
  ]);
  const indicator = book.pillars[0]!.indicators[0]!;

  it("is held apart from the bands rather than placed on one", () => {
    expect(indicator.bands.every((b) => b.met.length === 0)).toBe(true);
    expect(indicator.unsettled).toEqual([
      { economy: "AUS", reason: "The search did not settle it." },
    ]);
  });
});

describe("finding an indicator", () => {
  const book = readBook(rubric, []);
  const [six, eight] = book.pillars.map((p) => p.indicators[0]!);

  it("matches an indicator number by its opening digits", () => {
    expect(matches(six, "6")).toBe(true);
    expect(matches(eight, "6")).toBe(false);
    expect(matches(six, "6.2")).toBe(true);
  });

  it("matches a phrase in the question, the criteria or the carve-out", () => {
    expect(matches(six, "local storage")).toBe(true);
    expect(matches(six, "government data")).toBe(true);
    expect(matches(eight, "sectoral framework")).toBe(true);
  });

  it("matches the pillar's name, which is how an analyst asks for a subject", () => {
    expect(matches(six, "cross-border")).toBe(true);
  });

  it("shows everything when nothing has been typed", () => {
    expect(matches(six, "   ")).toBe(true);
  });
});
