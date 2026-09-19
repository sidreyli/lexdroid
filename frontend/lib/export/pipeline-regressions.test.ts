/**
 * The whole-pipeline review's export reproducers, turned round (docs/whole-pipeline-review.md).
 * Each asserted a defect; each now asserts what replaced it.
 */
import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";

const data = vi.hoisted(() => ({ rows: [] as unknown[], verdicts: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/data", () => ({
  getEconomies: () => [{ code: "SGP", name: "Singapore" }],
  getExportRows: () => data.rows,
  getRubric: () => ({ pillars: [], indicators: [] }),
  getRuns: () => [],
  getVerdicts: () => data.verdicts,
  compareIndicatorIds: (a: string, b: string) => a.localeCompare(b),
}));
vi.mock("@/lib/data/submission", () => ({
  getEngines: () => [],
  documentsFetchedBy: () => 0,
  zeroFetchDemonstrated: () => false,
}));

import { outputCsv, rowsFor, heldRows } from "./workbook";
import { compareProvisions, addEngineComparison } from "./sheets";

const CHECKED = "2026-09-19T00:00:00.000Z";
const row = (id: number, over: Record<string, unknown> = {}) =>
  ({
    id, runId: "r", economy: "SGP", lawName: "Example Act", indicatorId: "6.2", sectionId: 1, article: "1",
    sourceUrl: "https://sso.agc.gov.sg/example#s1", verbatimSnippet: "Quote", sectionText: "The Quote is here.",
    lastAmendedOn: null, lastAmended: null, notes: null,
    gates: [{ gate: "quote-in-source", passed: true, detail: null, checkedAt: CHECKED }],
    ...over,
  }) as never;
const failing = (gate: string) => [{ gate, passed: false, detail: "fixture", checkedAt: CHECKED }];
const decision = (rowId: number, action: string, changedFields: Record<string, unknown> = {}) => ({
  rowId, action, changedFields, attestation: "", reviewer: "r", actedAt: "2026-09-20T00:00:00.000Z",
});

describe("F17: the amendment year is an amendment's", () => {
  it("leaves the year blank for a commencement date", () => {
    data.verdicts = [];
    data.rows = [row(1, { lastAmended: "Since January 2000" })];
    expect(outputCsv({ runId: "r" })).not.toContain('"2000"');
  });

  it("takes the year the sentence says the law was last amended in", () => {
    data.rows = [row(1, { lastAmended: "Since March 2013, last amended in February 2021" })];
    expect(outputCsv({ runId: "r" })).toContain("2021");
  });
});

describe("F13: a row that fails a blocking gate is not submitted", () => {
  it("holds it, and lists it with the gate", () => {
    data.verdicts = [];
    data.rows = [row(1, { gates: failing("quote-in-source") }), row(2)];
    expect(rowsFor({ runId: "r" }).map((r) => r.id)).toEqual([2]);
    expect(heldRows({ runId: "r" })[0]!.reasons[0]).toMatch(/^quote-in-source/);
  });

  it("will not let an acceptance vouch for words the provision does not hold", () => {
    data.rows = [row(1, { gates: failing("quote-in-source"), verbatimSnippet: "Not there" })];
    data.verdicts = [decision(1, "accept")];
    expect(rowsFor({ runId: "r" })).toHaveLength(0);
  });

  it("releases it when a reviewer corrects the quote to words the provision holds", () => {
    data.rows = [row(1, { gates: failing("quote-in-source"), verbatimSnippet: "Quote is here" })];
    data.verdicts = [decision(1, "edit", { verbatimSnippet: { from: "Not there", to: "Quote is here" } })];
    expect(rowsFor({ runId: "r" })).toHaveLength(1);
  });

  it("releases an in-force hold on a reviewer's acceptance made after the gate ran", () => {
    data.rows = [row(1, { gates: failing("in-force") })];
    data.verdicts = [decision(1, "accept")];
    expect(rowsFor({ runId: "r" })).toHaveLength(1);
  });

  it("does not hold a row on an advisory gate", () => {
    data.verdicts = [];
    data.rows = [row(1, { gates: failing("pinpoint-citation") })];
    expect(rowsFor({ runId: "r" })).toHaveLength(1);
  });
});

describe("F18: the engine comparison covers every row either engine produced", () => {
  it("keeps a second finding on the same provision", () => {
    const a = [row(1), row(2, { indicatorId: "6.4", verbatimSnippet: "Extra finding" })];
    const b = [row(3)];
    const diff = compareProvisions(a, b);
    expect(diff).toHaveLength(2);
    expect(diff.find((d) => d.indicatorId === "6.2")?.howTheyDiffer).toBe("identical");
    expect(diff.find((d) => d.indicatorId === "6.4")?.foundBy).toBe("Engine A");
  });

  it("does not certify a second pass that never ran", () => {
    const book = new ExcelJS.Workbook();
    addEngineComparison(book, { run: null, rows: [], documentsFetched: 0 }, { run: null, rows: [], documentsFetched: 0 });
    const values = JSON.stringify(book.getWorksheet("Engine Comparison")!.getSheetValues());
    expect(values).not.toContain("Engine B fetched 0 documents, as required");
    expect(values).toContain("No second pass has been run");
  });
});
