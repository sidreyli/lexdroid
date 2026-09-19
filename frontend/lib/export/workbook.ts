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
import type { ExportRow, Run } from "@/lib/data/types";
import type { ReviewDecision } from "@/lib/review";
import {
  addEngineComparison,
  addInstructions,
  addSubmissionChecklist,
  checklist,
  type EnginePass,
} from "./sheets";
import { getEngines, documentsFetchedBy, zeroFetchDemonstrated } from "@/lib/data/submission";

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
  /**
   * The other engine's pass, for the Engine Comparison sheet.
   *
   * Named rather than guessed: on the day there will be several runs and the comparison has to be
   * between the two the short note describes, not between whichever two happen to be most recent.
   */
  compareRunId?: string | undefined;
}

const pillarOf = (indicatorId: string): number => Number(indicatorId.split(".")[0]);

/**
 * The finals template wants a year here, where Round 1 wanted the whole timeframe sentence.
 * The sentence is kept, in Notes, because it says what the year is evidenced by.
 */
function amendedYear(row: ExportRow): number | null {
  const iso = row.lastAmendedOn?.slice(0, 4);
  if (iso && /^\d{4}$/.test(iso)) return Number(iso);
  // Only a year the sentence says is an amendment's. The last four-digit number anywhere in it made
  // "Since January 2000" an amendment in 2000, and the template says to leave the column blank
  // where the law was not amended.
  const said = /last amended in (?:[A-Z][a-z]+ )?(\d{4})\b/i.exec(row.lastAmended ?? "");
  return said ? Number(said[1]) : null;
}

function notesOf(row: ExportRow): string | null {
  const timeframe = row.lastAmended && /last amended/i.test(row.lastAmended) ? row.lastAmended : null;
  return [row.notes, timeframe].filter(Boolean).join(" -- ") || null;
}

/**
 * The gates a row cannot be submitted past, each of them a column the finals template requires:
 * the Verbatim Snippet is "the exact text ... verified against the source", the Source URL is "on
 * the official government portal", and a repealed provision or a draft "scores zero". The others --
 * an anchor on the link, the rationale's order, one measure per row, a supported date -- are for
 * the reviewer, and a row that fails one is still a row.
 */
export const BLOCKING_GATES = ["quote-in-source", "offsets-resolve", "in-force", "official-host"] as const;

/** Only words the provision holds clear a quotation, whoever vouches for them. */
const WORDS_GATES = new Set<string>(["quote-in-source", "offsets-resolve"]);

const words = (s: string | null | undefined): string =>
  (s ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Why a row may not be submitted, or nothing.
 *
 * A failed blocking gate holds the row unless a reviewer acted on it after the gate ran. An
 * acceptance is a reviewer's word, and it answers whether the instrument is in force or the host
 * official; it cannot answer whether words are in a provision. That takes an edit whose words are
 * there -- checked here against the provision's own text, not taken on trust.
 */
export function heldBecause(row: ExportRow, decisions: ReviewDecision[]): string[] {
  const mine = decisions.filter((d) => d.rowId === row.id);
  const reasons: string[] = [];
  for (const g of row.gates) {
    if (g.passed || !(BLOCKING_GATES as readonly string[]).includes(g.gate)) continue;
    const later = mine.filter((d) => d.action !== "reject" && (!g.checkedAt || d.actedAt > g.checkedAt));
    const cleared = WORDS_GATES.has(g.gate)
      ? later.some(
          (d) =>
            d.action === "edit" &&
            d.changedFields.verbatimSnippet !== undefined &&
            !!row.sectionText &&
            words(row.verbatimSnippet).length > 0 &&
            words(row.sectionText).includes(words(row.verbatimSnippet)),
        )
      : later.length > 0;
    if (!cleared) reasons.push(`${g.gate}: ${g.detail ?? "failed"}`);
  }
  return reasons;
}

function selected(selection: Selection): ExportRow[] {
  const wanted = selection.economies?.map((e) => e.toUpperCase());
  return getExportRows()
    .filter((r) => (selection.runId ? r.runId === selection.runId : true))
    .filter((r) => (wanted ? wanted.includes(r.economy) : true))
    .sort(
      (a, b) =>
        a.economy.localeCompare(b.economy) || compareIndicatorIds(a.indicatorId, b.indicatorId),
    );
}

/** The verdict that stands on a row, which is the last one recorded. */
function standingOf(decisions: ReviewDecision[], rowId: number): ReviewDecision["action"] | undefined {
  return decisions.filter((d) => d.rowId === rowId).at(-1)?.action;
}

/** What goes in the submission: not rejected, and not held by a gate nobody has cleared. */
export function rowsFor(selection: Selection): ExportRow[] {
  const decisions = getVerdicts();
  return selected(selection).filter(
    (r) => standingOf(decisions, r.id) !== "reject" && heldBecause(r, decisions).length === 0,
  );
}

/** What was kept out by a gate, with why -- listed, so a held row is visible rather than missing. */
export function heldRows(selection: Selection): { row: ExportRow; reasons: string[] }[] {
  const decisions = getVerdicts();
  return selected(selection)
    .filter((r) => standingOf(decisions, r.id) !== "reject")
    .map((row) => ({ row, reasons: heldBecause(row, decisions) }))
    .filter((h) => h.reasons.length > 0);
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

  // Rows a gate kept out of Output Data, with the gate. Not part of the template's four sheets; it
  // is here so that a row missing from the submission is a row someone can see and act on.
  const held = heldRows(selection);
  if (held.length > 0) {
    const sheet = book.addWorksheet("Held");
    sheet.addRow(["Economy", "Law Name", "Article / Section", "Indicator ID", "Verbatim Snippet", "Held because"]);
    sheet.getRow(1).font = { bold: true };
    for (const { row, reasons } of held) {
      const added = sheet.addRow([row.economy, row.lawName, row.article, row.indicatorId, row.verbatimSnippet, reasons.join("; ")]);
      added.getCell(4).numFmt = "@";
    }
    sheet.columns.forEach((c, i) => (c.width = [10, 40, 18, 12, 60, 60][i] ?? 16));
  }

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
      run.usd ?? "unknown",
    ]);
  }
  record.columns.forEach((c, i) => (c.width = i === 0 ? 38 : 16));

  // The three sheets the template has and this file did not. Engine Comparison is filled during
  // the live hour; it is built here so the hour is not spent diffing rows by hand.
  const allRuns = getRuns();
  const runOf = (id: string | undefined): Run | null =>
    (id ? allRuns.find((r) => r.id === id) : undefined) ?? null;

  const passA: EnginePass = {
    run: runOf(selection.runId) ?? allRuns[0] ?? null,
    rows,
    documentsFetched: documentsFetchedBy(selection.runId ?? allRuns[0]?.id),
  };
  const passB: EnginePass = {
    run: runOf(selection.compareRunId),
    rows: selection.compareRunId
      ? rowsFor({ ...selection, runId: selection.compareRunId, compareRunId: undefined })
      : [],
    documentsFetched: documentsFetchedBy(selection.compareRunId),
  };
  addEngineComparison(book, passA, passB);

  const engines = getEngines();
  const pillars = new Set(rows.map((r) => pillarOf(r.indicatorId)));
  addSubmissionChecklist(
    book,
    checklist({
      economies: economies.length,
      pillars,
      rows: rows.length,
      rowsWithQuote: rows.filter((r) => (r.verbatimSnippet ?? "").trim().length > 0).length,
      rowsWithUrl: rows.filter((r) => (r.sourceUrl ?? "").trim().length > 0).length,
      // Not "not English": a row whose language could not be established is not evidence of a
      // non-English source, and counting it as one is the claim C1c is marked on.
      nonEnglishRows: rows.filter((r) => r.languageOfSource && r.languageOfSource !== "en").length,
      taggedRows: rows.filter((r) => r.discoveryTag !== null).length,
      declaredEngines: engines,
      zeroFetchDemonstrated: zeroFetchDemonstrated(),
      costRecorded: (passA.run?.usd ?? 0) > 0 || (passA.run?.calls ?? 0) > 0 || passA.run?.usd === null,
      rejectionsApplied: getVerdicts().filter((v) => v.action === "reject").length,
    }),
  );

  addInstructions(book);

  return Buffer.from(await book.xlsx.writeBuffer());
}
