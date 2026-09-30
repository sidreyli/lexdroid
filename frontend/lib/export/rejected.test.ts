/**
 * A rejected row leaves Output Data and is listed on its own sheet with the reviewer's reason, so
 * a rejection is on the record rather than a row that silently went missing.
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
  documentsFetchedIn: () => [],
  zeroFetchDemonstrated: () => false,
}));

import { buildWorkbook, outputCsv, rejectedRows, rowsFor } from "./workbook";

const row = (id: number, lawName: string) =>
  ({
    id, runId: "r", economy: "SGP", lawName, indicatorId: "6.2", sectionId: id, article: String(id),
    sourceUrl: `https://sso.agc.gov.sg/example#s${id}`, verbatimSnippet: `Quote ${id}`,
    sectionText: `The Quote ${id} is here.`, lastAmendedOn: null, lastAmended: null, notes: null,
    gates: [],
  }) as never;
const verdict = (rowId: number, action: string, attestation: string, actedAt: string) => ({
  rowId, action, attestation, changedFields: {}, reviewer: "Gwyneth", actedAt,
});

async function sheetNamed(name: string): Promise<ExcelJS.Worksheet | undefined> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load((await buildWorkbook({ runId: "r" })) as never);
  return book.getWorksheet(name);
}

describe("a rejected row", () => {
  it("leaves Output Data and the CSV", () => {
    data.rows = [row(1, "Kept Act"), row(2, "Rejected Act")];
    data.verdicts = [verdict(2, "reject", "The section is about fees, not data transfer", "2026-09-30T10:00:00Z")];
    expect(rowsFor({ runId: "r" }).map((r) => r.id)).toEqual([1]);
    expect(outputCsv({ runId: "r" })).not.toContain("Rejected Act");
  });

  it("is listed on the Rejected sheet with who, when and why", async () => {
    const sheet = await sheetNamed("Rejected");
    expect(sheet).toBeDefined();
    const values = sheet!.getRow(2).values as unknown[];
    expect(values).toContain("Rejected Act");
    expect(values).toContain("Gwyneth");
    expect(values).toContain("2026-09-30");
    expect(values).toContain("The section is about fees, not data transfer");
    expect(rejectedRows({ runId: "r" })).toHaveLength(1);
  });

  it("comes back, and off the Rejected sheet, when a later verdict accepts it", async () => {
    data.verdicts = [
      verdict(2, "reject", "Wrong section", "2026-09-30T10:00:00Z"),
      verdict(2, "accept", "", "2026-09-30T11:00:00Z"),
    ];
    expect(rowsFor({ runId: "r" }).map((r) => r.id)).toEqual([1, 2]);
    expect(await sheetNamed("Rejected")).toBeUndefined();
  });
});
