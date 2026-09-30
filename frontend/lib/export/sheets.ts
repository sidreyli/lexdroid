/**
 * The three sheets of ESCAP's template we were not producing.
 *
 * The workbook had four sheets against the template's seven. Three of the four matched by name and
 * the Output Data columns matched exactly, so what was missing was not the format -- it was the
 * parts of the submission that are about the submission rather than about the law.
 *
 *   Engine Comparison    C5b, four points, filled during the live hour. Every provision either
 *                        engine produced, how they differ, and the hard check: the second engine's
 *                        document count must be zero.
 *   Submission Checklist twenty-nine items due before 30 September, of which the tool can answer
 *                        about half from its own record. It answers those and leaves the rest.
 *   Instructions         what the template says about itself, carried through so the file opens
 *                        the way a reviewer expects.
 *
 * The comparison is built here rather than left to a human with two exports because the template
 * asks whether the tool produces it natively, and because an hour is not long enough to diff nine
 * hundred rows by hand.
 */
import type ExcelJS from "exceljs";
import type { ExportRow, Run } from "@/lib/data/types";
import { clockAt, LIVE_TEST_TIME_ZONE } from "./pair";

const BOLD = { bold: true } as const;

/** Dollars to the cent, as a bill reads; a floating-point tail is not a figure anyone was charged. */
const cents = (usd: number): number =>
  // A pass that cost a fraction of a cent keeps its figure: rounded to 0 it would read as free.
  usd > 0 && usd < 0.005 ? Math.round(usd * 10000) / 10000 : Math.round(usd * 100) / 100;

/** A section heading inside a sheet, as the template lays them out. */
function heading(sheet: ExcelJS.Worksheet, text: string): void {
  const row = sheet.addRow([text]);
  row.font = BOLD;
}

/* ---------------------------------------------------------------------------------------------
 * Engine Comparison
 * ------------------------------------------------------------------------------------------- */

/**
 * What two engines said about the same provision.
 *
 * Matched on economy, indicator and the provision cited, because that is the unit ESCAP asks about
 * -- "cover every provision either engine produced". A row only one engine produced is a finding
 * about that engine and is listed as one, not dropped for having no partner.
 */
export interface ProvisionComparison {
  lawName: string;
  article: string;
  indicatorId: string;
  foundBy: "Engine A" | "Engine B" | "Both";
  indicatorDiffers: boolean;
  citationDiffers: boolean;
  quoteDiffers: boolean;
  howTheyDiffer: string;
}

/** The provision a row is about, as a key two runs can be matched on. */
function provisionKey(row: ExportRow): string {
  // The section, where the row records one. Two engines reading the same provision cite the same
  // section id, whatever they then say about it, so this matches on what was read rather than on
  // what was concluded -- which is the point of the comparison.
  if (row.sectionId !== null) return `${row.economy}::s${row.sectionId}`;
  return `${row.economy}::${row.lawName.toLowerCase()}::${(row.article ?? "").toLowerCase()}`;
}

const normalise = (s: string | null): string => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Every row of each engine, paired with the other engine's row about the same provision.
 *
 * A provision can carry several rows -- two indicators, or two clauses under one -- and keeping the
 * first per provision dropped the rest from a comparison that must "cover every provision either
 * engine produced": a second finding of A's vanished, and a provision where the engines differed
 * was reported identical. So within a provision the rows are paired closest first -- same indicator
 * and same words, then same indicator, then whatever is left, which is where the indicator differs
 * -- and a row with no partner is listed as one engine's alone.
 */
export function compareProvisions(a: ExportRow[], b: ExportRow[]): ProvisionComparison[] {
  const group = (rows: ExportRow[]): Map<string, ExportRow[]> => {
    const m = new Map<string, ExportRow[]>();
    for (const row of rows) m.set(provisionKey(row), [...(m.get(provisionKey(row)) ?? []), row]);
    return m;
  };
  const byKeyA = group(a);
  const byKeyB = group(b);

  const pairs: [ExportRow | null, ExportRow | null][] = [];
  for (const key of new Set([...byKeyA.keys(), ...byKeyB.keys()])) {
    const left = [...(byKeyA.get(key) ?? [])];
    const right = [...(byKeyB.get(key) ?? [])];
    const take = (match: (x: ExportRow, y: ExportRow) => boolean): void => {
      for (const x of [...left]) {
        const i = right.findIndex((y) => match(x, y));
        if (i < 0) continue;
        pairs.push([x, right[i]!]);
        right.splice(i, 1);
        left.splice(left.indexOf(x), 1);
      }
    };
    take((x, y) => x.indicatorId === y.indicatorId && normalise(x.verbatimSnippet) === normalise(y.verbatimSnippet));
    take((x, y) => x.indicatorId === y.indicatorId);
    take(() => true);
    for (const x of left) pairs.push([x, null]);
    for (const y of right) pairs.push([null, y]);
  }

  const out: ProvisionComparison[] = [];
  for (const [rowA, rowB] of pairs) {
    if (!rowB) {
      out.push({
        lawName: rowA!.lawName,
        article: rowA!.article ?? "",
        indicatorId: rowA!.indicatorId,
        foundBy: "Engine A",
        indicatorDiffers: false,
        citationDiffers: false,
        quoteDiffers: false,
        howTheyDiffer: "Engine B did not produce this provision",
      });
      continue;
    }
    if (!rowA) {
      out.push({
        lawName: rowB.lawName,
        article: rowB.article ?? "",
        indicatorId: rowB.indicatorId,
        foundBy: "Engine B",
        indicatorDiffers: false,
        citationDiffers: false,
        quoteDiffers: false,
        howTheyDiffer: "Engine A did not produce this provision",
      });
      continue;
    }

    const indicatorDiffers = rowA.indicatorId !== rowB.indicatorId;
    const citationDiffers = normalise(rowA.sourceUrl) !== normalise(rowB.sourceUrl);
    const quoteDiffers = normalise(rowA.verbatimSnippet) !== normalise(rowB.verbatimSnippet);

    const how: string[] = [];
    if (indicatorDiffers) how.push(`A mapped it to ${rowA.indicatorId}, B to ${rowB.indicatorId}`);
    if (citationDiffers) how.push("the two cited different links to the same provision");
    if (quoteDiffers) how.push("the two copied different words out of it");
    out.push({
      lawName: rowA.lawName,
      article: rowA.article ?? "",
      indicatorId: rowA.indicatorId,
      foundBy: "Both",
      indicatorDiffers,
      citationDiffers,
      quoteDiffers,
      howTheyDiffer: how.length === 0 ? "identical" : how.join("; "),
    });
  }

  return out.sort(
    (x, y) => x.lawName.localeCompare(y.lawName) || x.article.localeCompare(y.article),
  );
}

export interface EnginePass {
  run: Run | null;
  rows: ExportRow[];
  /** Documents taken over the network during this pass. Engine B's must be zero. */
  documentsFetched: number;
}

export function addEngineComparison(
  book: ExcelJS.Workbook,
  passA: EnginePass,
  passB: EnginePass,
): void {
  const sheet = book.addWorksheet("Engine Comparison");
  sheet.addRow(["Finale morning — engine comparison  (criterion C5b, 4 points)"]).font = BOLD;
  sheet.addRow([
    "Completed during the live hour and submitted with the evidence. Covers every provision either " +
      "engine produced. The second engine re-reads documents already downloaded and fetches nothing new.",
  ]);
  sheet.addRow([]);

  const minutes = (run: Run | null): string => {
    if (!run?.startedAt || !run.finishedAt) return "";
    const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    return ms > 0 ? (ms / 60000).toFixed(1) : "";
  };
  const clock = (iso: string | null | undefined): string => clockAt(iso);

  heading(sheet, "1 · Per-engine summary");
  sheet.addRow(["Field", "Engine A — first pass", "Engine B — second pass"]).font = BOLD;
  sheet.addRow(["Provider and model name", passA.run?.model ?? "", passB.run?.model ?? ""]);
  sheet.addRow(["Run id", passA.run?.id ?? "", passB.run?.id ?? ""]);
  sheet.addRow([`Start time (hh:mm, ${LIVE_TEST_TIME_ZONE})`, clock(passA.run?.startedAt), clock(passB.run?.startedAt)]);
  sheet.addRow([`End time (hh:mm, ${LIVE_TEST_TIME_ZONE})`, clock(passA.run?.finishedAt), clock(passB.run?.finishedAt)]);
  sheet.addRow(["Elapsed (minutes)", minutes(passA.run), minutes(passB.run)]);
  sheet.addRow(["Documents fetched during this pass", passA.documentsFetched, passB.documentsFetched]);
  // Unknown is said, not rounded to nothing: a hosted engine's bill was never recorded here.
  const cost = (run: typeof passA.run): number | string => (!run ? "" : run.usd === null ? "unknown" : cents(run.usd));
  sheet.addRow(["Cost of this pass (US$)", cost(passA.run), cost(passB.run)]);
  sheet.addRow(["Evidence rows produced", passA.rows.length, passB.rows.length]);

  // The check a steward performs against the Run Record, stated on the sheet so it is not a claim
  // the reader has to go and verify somewhere else.
  // Zero fetched means something only of a second pass that ran. Counted over no run at all, the
  // sheet certified a pass that did not exist.
  const ran = passB.run !== null && passB.run.status === "complete";
  const zeroFetch = ran && passB.run!.sourceMode === "cache-only" && passB.documentsFetched === 0;
  const claim = sheet.addRow([
    !passB.run
      ? "No second pass has been run, so there is no zero-fetch result to report."
      : !ran
        ? `The second pass (${passB.run.id}) is ${passB.run.status}, not complete; its fetch count is not a result yet.`
        : passB.run.sourceMode !== "cache-only"
          ? `The second pass (${passB.run.id}) was allowed to fetch. It must run cache-only to count as a clean second pass.`
          : zeroFetch
            ? "Engine B fetched 0 documents, as required. The figure is counted from this run's own fetch log."
            : `Engine B fetched ${passB.documentsFetched} document(s). This must be 0 — the second pass is not a clean second pass.`,
  ]);
  claim.font = { bold: true, color: { argb: zeroFetch ? "FF1B5E20" : "FFB71C1C" } };
  sheet.addRow([]);

  heading(sheet, "2 · Provision-by-provision comparison");
  sheet.addRow([
    "#",
    "Law Name",
    "Article / Section",
    "Indicator ID",
    "Found by",
    "Indicator differs?",
    "Citation differs?",
    "Quoted words differ?",
    "How they differ — one line",
  ]).font = BOLD;

  const comparisons = compareProvisions(passA.rows, passB.rows);
  const yesNo = (v: boolean) => (v ? "Yes" : "No");
  comparisons.forEach((c, i) => {
    const row = sheet.addRow([
      i + 1,
      c.lawName,
      c.article,
      c.indicatorId,
      c.foundBy,
      c.foundBy === "Both" ? yesNo(c.indicatorDiffers) : "",
      c.foundBy === "Both" ? yesNo(c.citationDiffers) : "",
      c.foundBy === "Both" ? yesNo(c.quoteDiffers) : "",
      c.howTheyDiffer,
    ]);
    row.getCell(4).numFmt = "@";
    row.getCell(4).value = c.indicatorId;
  });

  sheet.addRow([]);
  const onlyA = comparisons.filter((c) => c.foundBy === "Engine A").length;
  const onlyB = comparisons.filter((c) => c.foundBy === "Engine B").length;
  const both = comparisons.filter((c) => c.foundBy === "Both").length;
  sheet.addRow(["Found by Engine A only:", "", "", onlyA]);
  sheet.addRow(["Found by Engine B only:", "", "", onlyB]);
  sheet.addRow(["Found by both:", "", "", both]);
  const agreed = comparisons.filter(
    (c) => c.foundBy === "Both" && !c.indicatorDiffers && !c.citationDiffers && !c.quoteDiffers,
  ).length;
  sheet.addRow(["Of those found by both, identical in indicator, citation and quote:", "", "", agreed]);
  sheet.addRow([]);

  heading(sheet, "3 · Which output would you hand to a ministry, and why?");
  sheet.addRow([
    "One paragraph, in your own words. Written by a person during the hour — this sheet does not " +
      "fill it in, because it is the part that carries the marks and the part a tool cannot fake.",
  ]);
  sheet.addRow([]);

  sheet.columns.forEach((c, i) => (c.width = [6, 44, 20, 14, 14, 16, 16, 18, 62][i] ?? 18));
  sheet.getColumn(9).alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
}

/* ---------------------------------------------------------------------------------------------
 * Run Record
 * ------------------------------------------------------------------------------------------- */

export interface Downloaded {
  runId: string;
  url: string;
  at: string;
  bytes: number | null;
  mediaType: string | null;
}

/**
 * What the template calls a file type: PDF, HTML, DOCX. From what the server said it sent, else the
 * URL's extension, else blank -- an API or a search form names nothing, and a guess is a wrong line.
 */
export function fileType(mediaType: string | null, url: string): string {
  const byMedia: Record<string, string> = {
    "application/pdf": "PDF",
    "text/html": "HTML",
    "application/xhtml+xml": "HTML",
    "text/plain": "TXT",
    "application/msword": "DOC",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
    "application/epub+zip": "EPUB",
    "application/json": "JSON",
    "application/xml": "XML",
    "text/xml": "XML",
  };
  const media = mediaType?.split(";")[0]?.trim().toLowerCase();
  if (media && byMedia[media]) return byMedia[media];
  if (media?.endsWith("+json")) return "JSON";
  if (media?.endsWith("+xml")) return "XML";
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // Not a URL; read it as a path.
  }
  const ext = /\.([a-z0-9]{2,5})$/i.exec(path)?.[1]?.toLowerCase();
  if (!ext) return "";
  // Pages a server builds: what they send is a page, whatever the script is called.
  if (["htm", "html", "aspx", "asp", "php", "jsp", "cfm"].includes(ext)) return "HTML";
  return ext.toUpperCase();
}

/**
 * The template's Run Record: the two passes, every document downloaded during the hour, and the
 * short note's headings. The document list is the hard check -- "if no documents were fetched
 * during the hour, C5a scores zero" -- so it is written from the fetch log, row for row, and the
 * counts under it are counted from the list itself rather than stated beside it.
 */
export function addRunRecord(
  book: ExcelJS.Workbook,
  passA: EnginePass,
  passB: EnginePass,
  documents: readonly Downloaded[],
): void {
  const sheet = book.addWorksheet("Run Record");
  sheet.addRow(["Finale morning — run record"]).font = BOLD;
  sheet.addRow([
    "Evidence that the hour happened as described. The document list is the hard check: if no documents " +
      "were fetched during the hour, C5a scores zero regardless of what the evidence file contains.",
  ]);
  sheet.addRow([]);

  const minutes = (run: Run | null): number | string => {
    if (!run?.startedAt || !run.finishedAt) return "";
    const ms = new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime();
    return ms > 0 ? Math.round(ms / 6000) / 10 : "";
  };
  const cost = (run: Run | null): number | string => (!run ? "" : run.usd === null ? "unknown" : cents(run.usd));

  heading(sheet, "1 · Engine runs");
  sheet.addRow([
    "Engine",
    "Provider / model name",
    `Start (hh:mm, ${LIVE_TEST_TIME_ZONE})`,
    `End (hh:mm, ${LIVE_TEST_TIME_ZONE})`,
    "Elapsed (min)",
    "Cost (US$)",
    "Run id",
  ]).font = BOLD;
  const passes: [string, EnginePass][] = [
    ["Engine A — first pass", passA],
    ["Engine B — second pass", passB],
  ];
  for (const [label, pass] of passes) {
    sheet.addRow([
      label,
      pass.run?.model ?? "",
      clockAt(pass.run?.startedAt),
      clockAt(pass.run?.finishedAt),
      minutes(pass.run),
      cost(pass.run),
      pass.run?.id ?? "",
    ]);
  }
  // A total over an unknown is unknown, not the sum of what happens to be known.
  const known = passes.map(([, p]) => p.run).filter((r): r is Run => r !== null);
  const total = known.some((r) => r.usd === null)
    ? "unknown"
    : cents(known.reduce((t, r) => t + (r.usd ?? 0), 0));
  sheet.addRow(["Total cost for the hour (US$)", "", "", "", "", total]).font = BOLD;
  sheet.addRow([]);

  heading(sheet, "2 · Every document downloaded during the hour");
  sheet.addRow([
    "#",
    "Source URL",
    "Fetched during",
    `Time (hh:mm, ${LIVE_TEST_TIME_ZONE})`,
    "Size (KB)",
    "File type",
  ]).font = BOLD;
  const during = (runId: string): string =>
    runId === passA.run?.id ? "Engine A pass" : runId === passB.run?.id ? "Engine B pass" : runId;
  documents.forEach((d, i) => {
    sheet.addRow([
      i + 1,
      d.url,
      during(d.runId),
      clockAt(d.at),
      d.bytes === null ? "" : Math.max(1, Math.round(d.bytes / 1024)),
      fileType(d.mediaType, d.url),
    ]);
  });
  if (documents.length === 0) sheet.addRow(["", "No document was taken over the network by either pass."]);
  const fromA = documents.filter((d) => passA.run && d.runId === passA.run.id).length;
  const fromB = documents.filter((d) => passB.run && d.runId === passB.run.id).length;
  sheet.addRow(["Documents fetched during the hour (Engine A):", "", "", "", fromA]).font = BOLD;
  const zero = sheet.addRow(["Documents fetched by Engine B — must be zero:", "", "", "", passB.run ? fromB : ""]);
  zero.font = { bold: true, color: { argb: passB.run && fromB === 0 ? "FF1B5E20" : "FFB71C1C" } };
  sheet.addRow([]);

  heading(sheet, "3 · Short note");
  // Headings, and only the two answers the record holds. The rest is a person's account of the
  // hour, and the machine is whichever one the steward watched, not whichever opens the file.
  for (const h of [
    "What worked",
    "What broke",
    "What a human should check first",
    "Headline cost for the hour (US$)",
    "Machine used (make, RAM, GPU if any)",
    "The two engines used",
  ]) {
    const value =
      h === "Headline cost for the hour (US$)"
        ? total
        : h === "The two engines used"
          ? [passA.run?.model, passB.run?.model].filter(Boolean).join(" and ")
          : "";
    sheet.addRow([h, value]);
  }

  sheet.columns.forEach((c, i) => (c.width = [30, 70, 18, 18, 14, 12, 38][i] ?? 16));
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
}

/* ---------------------------------------------------------------------------------------------
 * Submission Checklist
 * ------------------------------------------------------------------------------------------- */

export type CheckStatus = "Yes" | "No" | "Not yet" | "";

export interface ChecklistItem {
  group: string;
  item: string;
  /** What the tool can say from its own record. Blank where only a person can answer. */
  status: CheckStatus;
  evidence: string;
}

export interface ChecklistFacts {
  economies: number;
  pillars: Set<number>;
  rows: number;
  rowsWithQuote: number;
  rowsWithUrl: number;
  nonEnglishRows: number;
  taggedRows: number;
  declaredEngines: { label: string; model: string; hosted: boolean; kind: string }[];
  zeroFetchDemonstrated: boolean;
  costRecorded: boolean;
  rejectionsApplied: number;
}

/**
 * The twenty-nine items, with the tool answering the ones it can evidence.
 *
 * Deliberately conservative: an item the record cannot settle is left blank for a person rather
 * than ticked optimistically. "An honest gap here costs you nothing" is the template's own
 * instruction, and a checklist that ticks itself is worth nothing to the person relying on it.
 */
export function checklist(facts: ChecklistFacts): ChecklistItem[] {
  const yesNo = (ok: boolean): CheckStatus => (ok ? "Yes" : "No");
  const bothPillars = facts.pillars.has(6) && facts.pillars.has(7);
  const openWeights = facts.declaredEngines.filter((e) => e.kind === "open-weights");
  const twoDeclared = facts.declaredEngines.length >= 2;

  return [
    { group: "Repository", item: "GitHub repository is public and accessible to the secretariat", status: "", evidence: "A person confirms this." },
    { group: "Repository", item: "Final release tag recorded — that exact tag is what will run on 15 October", status: "", evidence: "A person confirms this." },
    { group: "Repository", item: "LICENSE file contains the Apache License 2.0 text", status: "", evidence: "A person confirms this." },
    { group: "Repository", item: "README complete, following README_template_FINAL_ROUND.md — every section", status: "", evidence: "A person confirms this." },
    { group: "Repository", item: "README Quick Start reaches a working system on a clean machine in under 30 minutes", status: "", evidence: "Needs a timed run on a machine that has never built this." },
    { group: "Deployment", item: "Deployment guide included in the Stage 3 Word template, Section 1", status: "", evidence: "A person confirms this." },
    { group: "Deployment", item: "Someone who did not build the tool deployed it from the guide alone, in under 30 minutes", status: "", evidence: "Needs a person who did not build it." },
    { group: "Deployment", item: "Docker / Python environment requirements documented; no hardcoded paths", status: "", evidence: "A person confirms this." },
    {
      group: "Architecture",
      item: "The AI model backend is swappable from inside the interface, with no code or config change",
      status: yesNo(twoDeclared),
      evidence: twoDeclared
        ? `${facts.declaredEngines.map((e) => e.label).join(" and ")} are declared and selectable on the run screen.`
        : "Fewer than two engines are declared.",
    },
    { group: "Architecture", item: "Zone 1 (source discovery) and Zone 2 (extraction) are separate, documented modules", status: "Yes", evidence: "src/discover and src/read, driven by src/run/prepare.ts." },
    {
      group: "Architecture",
      item: "The human-review audit interface works and can be driven by a non-technical policy officer",
      status: facts.rejectionsApplied > 0 ? "Yes" : "Not yet",
      evidence:
        facts.rejectionsApplied > 0
          ? `${facts.rejectionsApplied} reviewer decision(s) recorded and applied to the export.`
          : "No reviewer decision has been recorded yet, so this has never been demonstrated end to end.",
    },
    {
      group: "Compliance",
      item: "The core pipeline runs end to end on the open-weights engine alone, with no proprietary API",
      status: yesNo(openWeights.some((e) => !e.hosted)),
      evidence: openWeights.length > 0 ? `${openWeights.map((e) => e.model).join(", ")} are open weights.` : "No open-weights engine declared.",
    },
    { group: "Compliance", item: "All dependencies listed with licences in the Stage 3 Word template, Section 3", status: "", evidence: "A person confirms this." },
    {
      group: "Evidence",
      item: "Output Data sheet complete — indicator IDs as text, verbatim snippets, live source URLs",
      status: yesNo(facts.rows > 0 && facts.rowsWithQuote > 0 && facts.rowsWithUrl > 0),
      evidence: `${facts.rows} row(s); ${facts.rowsWithQuote} carry quoted words, ${facts.rowsWithUrl} carry a source URL.`,
    },
    {
      group: "Evidence",
      item: "Coverage Matrix shows three or more economies",
      status: yesNo(facts.economies >= 3),
      evidence: `${facts.economies} econom${facts.economies === 1 ? "y" : "ies"} in this export.`,
    },
    {
      group: "Evidence",
      item: "Both mandatory pillars covered — 6 cross-border data, 7 domestic data protection",
      status: yesNo(bothPillars),
      evidence: `Pillars present: ${[...facts.pillars].sort((a, b) => a - b).join(", ") || "none"}.`,
    },
    {
      group: "Evidence",
      item: "At least one non-English source, recorded in Language of Source",
      status: yesNo(facts.nonEnglishRows > 0),
      evidence:
        facts.nonEnglishRows > 0
          ? `${facts.nonEnglishRows} row(s) cite a source that is not in English.`
          : "Every row in this export cites an English-language source.",
    },
    {
      group: "Evidence",
      item: "Every row tagged NEW or KNOWN against the published sample kit",
      status: yesNo(facts.rows > 0 && facts.taggedRows === facts.rows),
      evidence: `${facts.taggedRows} of ${facts.rows} row(s) tagged.`,
    },
    { group: "Interface", item: "The interface deploys from the repository at the declared tag — C3a and C3b", status: "", evidence: "A person confirms this." },
    { group: "Interface", item: "Walkthrough recording made — start a run, audit view, reject and export, switch the engine", status: "", evidence: "A person records this." },
    {
      group: "Live test",
      item: "Two AI engines declared in the Word submission — one commercial hosted, one open weights",
      status: yesNo(twoDeclared && facts.declaredEngines.some((e) => e.hosted) && openWeights.length > 0),
      evidence: facts.declaredEngines.map((e) => `${e.label}: ${e.model} (${e.hosted ? "hosted" : "local"}, ${e.kind})`).join("; ") || "None declared.",
    },
    { group: "Live test", item: "The engine switch is made inside the interface and a steward can watch it happen", status: yesNo(twoDeclared), evidence: "Engine selector on the run screen; the choice is recorded on the run." },
    {
      group: "Live test",
      item: "A second pass re-reads documents already downloaded, fetching nothing new",
      status: yesNo(facts.zeroFetchDemonstrated),
      evidence: facts.zeroFetchDemonstrated
        ? "A cache-only run is recorded with zero documents fetched."
        : "No cache-only run has been recorded yet.",
    },
    { group: "Live test", item: "The tool produces the Engine Comparison sheet", status: "Yes", evidence: "This workbook contains it, built from two runs." },
    { group: "Live test", item: "The run starts from a button; progress in plain words; review and export in the interface", status: "Yes", evidence: "Run screen, ledger and export are all in the interface." },
    { group: "Live test", item: "Politeness limits built in and ON by default — robots.txt respected", status: "Yes", evidence: "src/fetch honours robots.txt and a per-host delay by default." },
    { group: "Live test", item: "Cache and downloaded-document folders can be cleared on screen before the clock starts", status: "", evidence: "A person confirms this." },
    {
      group: "Live test",
      item: "Cost recorded per run and per engine, in US dollars",
      status: yesNo(facts.costRecorded),
      evidence: facts.costRecorded ? "run_cost carries calls, tokens, wall seconds and USD per engine." : "No cost recorded for this run.",
    },
    { group: "Live test", item: "Ready for any of the nine 2025 RDTII economies and their languages, in any pillar", status: "", evidence: "A person judges this." },
    { group: "Live test", item: "After submission the interface can be left available for the marking period", status: "", evidence: "A person confirms this." },
  ];
}

export function addSubmissionChecklist(book: ExcelJS.Workbook, items: ChecklistItem[]): void {
  const sheet = book.addWorksheet("Submission Checklist");
  sheet.addRow(["Checklist before 30 September"]).font = BOLD;
  sheet.addRow([
    "The live-test items cannot be fixed on 15 October — code is frozen at submission. Status is " +
      "filled in from this run's own record where the record can settle it, and left blank where " +
      "only a person can answer. An honest gap costs nothing; a checklist that ticks itself is worth nothing.",
  ]);
  sheet.addRow([]);
  sheet.addRow(["#", "Item", "Status", "Notes / evidence"]).font = BOLD;

  items.forEach((item, i) => {
    const row = sheet.addRow([i + 1, `[${item.group}]   ${item.item}`, item.status, item.evidence]);
    if (item.status === "No") row.getCell(3).font = { bold: true, color: { argb: "FFB71C1C" } };
    if (item.status === "Yes") row.getCell(3).font = { color: { argb: "FF1B5E20" } };
    if (item.status === "Not yet") row.getCell(3).font = { color: { argb: "FFE65100" } };
  });

  sheet.columns.forEach((c, i) => (c.width = [5, 82, 10, 72][i] ?? 20));
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
  sheet.getColumn(4).alignment = { wrapText: true, vertical: "top" };
}

/* ---------------------------------------------------------------------------------------------
 * Instructions
 * ------------------------------------------------------------------------------------------- */

export function addInstructions(book: ExcelJS.Workbook): void {
  const sheet = book.addWorksheet("Instructions");
  sheet.addRow(["How to read this workbook"]).font = BOLD;
  sheet.addRow([]);

  const lines: [string, string][] = [
    ["Output Data", "One row per provision the answer stood on. One measure per row, one official URL per row, and a row for every cell asked — including the cells where no requirement was found and the cells that could not be answered."],
    ["Indicator ID", "Written as text. As a number, 12.10 collapses to 12.1 and 4.01 to 4.1, which are different indicators."],
    ["Language of Source", "The original language of the legal document, read from the provision itself where the portal did not say. It drives criterion C1c. Blank means the language could not be established, not that it is English."],
    ["Discovery Tag", "NEW or KNOWN against ESCAP's published sample kit. Applied after the rows exist, by the one module allowed to read the kit — nothing in discovery or extraction can see it, or every instrument would be KNOWN by construction."],
    ["Pillar", "Derived from the Indicator ID."],
    ["Confidence", "Whether the quoted words were located in the stored source, and where they were not, why."],
    ["Rejected", "Rows a reviewer rejected are not in Output Data. They are listed on the Rejected sheet with who rejected each one, when, and the reason they gave. Rows a reviewer corrected are in Output Data as corrected."],
    ["Indicator Reference", "Every indicator in the framework with its pillar, category and the criterion text it is scored against."],
    ["Coverage Matrix", "How many rows each economy produced for each indicator. A zero is a cell that produced no evidence row, which is different from a cell nobody asked."],
    ["Run Record", "The live hour's two passes, every document downloaded during it, and the short note's headings, as the template lays them out."],
    ["Run Log", "What produced this file: the engine, the model, the code revision, the source mode, and the measured cost."],
    ["Engine Comparison", "Every provision either declared engine produced, and how the two differ. The second engine's document count is counted from the run's own fetch log."],
    ["Submission Checklist", "Answered from the record where the record can answer, blank where only a person can."],
  ];

  sheet.addRow(["Sheet or column", "What it means"]).font = BOLD;
  for (const [term, meaning] of lines) sheet.addRow([term, meaning]);

  sheet.columns.forEach((c, i) => (c.width = [24, 110][i] ?? 24));
  sheet.getColumn(2).alignment = { wrapText: true, vertical: "top" };
}
