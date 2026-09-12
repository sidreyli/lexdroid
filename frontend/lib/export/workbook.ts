/**
 * The submission workbook, in ESCAP's column order. Rows a reviewer rejected are left out,
 * and rows they corrected go in as corrected -- which is what "the correction took effect" means.
 */
import "server-only";
import ExcelJS from "exceljs";
import {
  getEconomies,
  getExportRows,
  getRubric,
  getRuns,
  getVerdicts,
  compareIndicatorIds,
} from "@/lib/data";
import type { ExportRow } from "@/lib/data/types";

export const OUTPUT_COLUMNS = [
  "Economy",
  "Law Name",
  "Law Number / Ref",
  "Last Amended",
  "Indicator ID",
  "Article / Section",
  "Discovery Tag",
  "Location Reference",
  "Verbatim Snippet",
  "Mapping Rationale",
  "Source URL",
  "Confidence",
  "Notes",
  "Language of Source",
  "Pillar",
] as const;

export interface Selection {
  runId?: string | undefined;
  economies?: string[] | undefined;
}

const pillarOf = (indicatorId: string): number => Number(indicatorId.split(".")[0]);

/**
 * The finals template wants a year here, where Round 1 wanted the whole timeframe sentence.
 * The sentence is kept, in Notes, because it says what the year is evidenced by.
 */
function amendedYear(row: ExportRow): number | null {
  const iso = row.lastAmendedOn?.slice(0, 4);
  if (iso && /^\d{4}$/.test(iso)) return Number(iso);
  const years = (row.lastAmended?.match(/\d{4}/g) ?? [])
    .map(Number)
    .filter((y) => y >= 1800 && y <= 2100);
  return years.at(-1) ?? null;
}

function notesOf(row: ExportRow): string | null {
  const timeframe = row.lastAmended && /last amended/i.test(row.lastAmended) ? row.lastAmended : null;
  return [row.notes, timeframe].filter(Boolean).join(" -- ") || null;
}

/** The verdict that stands on each row, which is the last one recorded. */
function standing(): Map<number, "accept" | "edit" | "reject"> {
  const at = new Map<number, "accept" | "edit" | "reject">();
  for (const v of getVerdicts()) at.set(v.rowId, v.action);
  return at;
}

export function rowsFor(selection: Selection): ExportRow[] {
  const verdicts = standing();
  const wanted = selection.economies?.map((e) => e.toUpperCase());
  return getExportRows()
    .filter((r) => (selection.runId ? r.runId === selection.runId : true))
    .filter((r) => (wanted ? wanted.includes(r.economy) : true))
    .filter((r) => verdicts.get(r.id) !== "reject")
    .sort(
      (a, b) =>
        a.economy.localeCompare(b.economy) || compareIndicatorIds(a.indicatorId, b.indicatorId),
    );
}

function outputValues(rows: ExportRow[]): (string | number | null)[][] {
  const names = new Map(getEconomies().map((e) => [e.code, e.name]));
  return rows.map((r) => [
    names.get(r.economy) ?? r.economy,
    r.lawName,
    r.lawNumberRef,
    amendedYear(r),
    r.indicatorId,
    r.article,
    r.discoveryTag,
    r.locationReference,
    r.verbatimSnippet,
    r.mappingRationale,
    r.sourceUrl,
    r.confidence,
    notesOf(r),
    r.languageOfSource,
    pillarOf(r.indicatorId),
  ]);
}

export function outputCsv(selection: Selection): string {
  const quote = (v: string | number | null): string =>
    v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`;
  const lines = [OUTPUT_COLUMNS.map(quote).join(",")];
  for (const row of outputValues(rowsFor(selection))) lines.push(row.map(quote).join(","));
  return lines.join("\r\n");
}

export async function buildWorkbook(selection: Selection): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "LexDroid";
  book.created = new Date();

  const rows = rowsFor(selection);
  const rubric = getRubric();

  const output = book.addWorksheet("Output Data");
  output.addRow([...OUTPUT_COLUMNS]);
  for (const values of outputValues(rows)) {
    const added = output.addRow(values);
    // Written as text, or 12.10 collapses to 12.1 and 4.01 to 4.1, which are different indicators.
    added.getCell(5).numFmt = "@";
    added.getCell(5).value = String(values[4] ?? "");
  }
  output.getRow(1).font = { bold: true };
  output.columns.forEach((c, i) => {
    c.width = [22, 40, 16, 13, 12, 18, 14, 20, 60, 50, 40, 11, 30, 18, 8][i] ?? 16;
  });
  output.getColumn(9).alignment = { wrapText: true, vertical: "top" };
  output.getColumn(10).alignment = { wrapText: true, vertical: "top" };

  const reference = book.addWorksheet("Indicator Reference");
  reference.addRow(["Indicator ID", "Pillar", "Pillar Name", "Category", "Criterion"]);
  reference.getRow(1).font = { bold: true };
  for (const pillar of rubric.pillars) {
    for (const indicator of rubric.indicators.filter((i) => pillarOf(i.id) === pillar.id)) {
      const added = reference.addRow([
        indicator.id,
        pillar.id,
        pillar.name,
        indicator.category,
        indicator.criteriaText,
      ]);
      added.getCell(1).numFmt = "@";
    }
  }
  reference.columns.forEach((c, i) => (c.width = [14, 8, 34, 26, 80][i] ?? 16));
  reference.getColumn(5).alignment = { wrapText: true, vertical: "top" };

  const economies = [...new Set(rows.map((r) => r.economy))].sort();
  const coverage = book.addWorksheet("Coverage Matrix");
  coverage.addRow(["Indicator ID", "Pillar", ...economies]);
  coverage.getRow(1).font = { bold: true };
  for (const indicator of [...rubric.indicators].sort((a, b) => compareIndicatorIds(a.id, b.id))) {
    const counts = economies.map(
      (code) => rows.filter((r) => r.economy === code && r.indicatorId === indicator.id).length,
    );
    const added = coverage.addRow([indicator.id, pillarOf(indicator.id), ...counts]);
    added.getCell(1).numFmt = "@";
  }
  coverage.columns.forEach((c, i) => (c.width = i < 2 ? [14, 8][i]! : 14));

  const record = book.addWorksheet("Run Record");
  record.addRow([
    "Run",
    "Started",
    "Finished",
    "Economies",
    "Engine",
    "Model",
    "Source Mode",
    "Code Revision",
    "Cells",
    "Rows",
    "Model Calls",
    "Tokens",
    "Wall Seconds",
    "USD",
  ]);
  record.getRow(1).font = { bold: true };
  const runs = selection.runId
    ? getRuns().filter((r) => r.id === selection.runId)
    : getRuns().slice(0, 20);
  for (const run of runs) {
    record.addRow([
      run.id,
      run.startedAt,
      run.finishedAt ?? "",
      run.economies.join(", "),
      run.engine,
      run.model,
      run.sourceMode,
      run.codeRevision,
      run.cells,
      run.rows,
      run.calls,
      run.tokens,
      run.wallSeconds,
      run.usd,
    ]);
  }
  record.columns.forEach((c, i) => (c.width = i === 0 ? 38 : 16));

  return Buffer.from(await book.xlsx.writeBuffer());
}
