/**
 * The export row: the unit ESCAP actually grades.
 *
 * Everything before this stage is our own bookkeeping. This is where a run becomes the thing a
 * reviewer reads, and it is a pure projection -- no model, no network, nothing decided here that
 * was not already decided upstream. If a fact is not in the run record it does not appear in a
 * row, and if it is in the run record it appears unchanged.
 *
 * Three rules from ESCAP's own marking of the fifteen graded submissions are structural here
 * rather than advisory:
 *
 *   One measure per row.  "if the single entry includes multi measures, suggest to separate."
 *                         A reading may carry several findings for one indicator; each becomes
 *                         its own row, because a reviewer accepts or rejects one claim at a time.
 *
 *   One official URL.     "better not to compile the links... add one official link for one
 *                         document." Secondary links belong in the notes.
 *
 *   Every cell answered.  A cell that found no requirement still produces a row, naming the
 *                         instrument it was read against -- the Australia 2.2 shape. A cell we
 *                         could not answer produces a row that says so. Silence is never a row.
 *
 *   Only what was stood on.  Rows come from the answer's basis, not from everything the reader
 *                         returned. Zone 3 sets most findings aside with a reason -- a sentence
 *                         that declares rather than obliges, a power to make a rule rather than
 *                         the rule -- and a finding it refused to score is not a measure. They
 *                         stay in `reading`, which is the record of what was read.
 *
 * The discovery tag is deliberately not set here. NEW versus KNOWN is defined against ESCAP's
 * sample kit, and no module under src/ outside the quarantine may read it -- so the tag is applied
 * by the caller that is allowed to, and a row leaves this module without one.
 */
import type { Db } from '../db/index.js';
import { locateQuote } from '../util/locate.js';
import { detectLanguage } from '../parse/language.js';
import { loadProfile } from '../profile/index.js';
import { loadConfirmations } from '../read/confirmations.js';

export interface BuildResult {
  rows: number;
  cells: number;
  /** Cells that produced no row at all. Should always be zero; reported so it cannot hide. */
  cellsWithoutRow: number;
  /** Reviewer decisions carried across the rebuild onto a row that did not change. */
  reviewsCarried: number;
  /**
   * Reviewer decisions that could not be carried, because the row they were about is no longer
   * there or no longer says the same thing. Reported rather than swallowed: it is somebody's work.
   */
  reviewsDropped: number;
}

/**
 * What identifies a row across a rebuild.
 *
 * `export_row.id` does not: this function deletes the run's rows and reinserts them, so every id
 * changes, and `gate_result` and `review_action` both cascade off it. The gates are recomputed by
 * verifyRun afterwards, so they heal. A reviewer's accept or reject is not recomputable by anything
 * -- it is a person's judgement, and a re-export was silently destroying it.
 *
 * Keyed by what the reviewer actually looked at. A row whose quotation or citation changed is not
 * the row they approved, and it correctly loses the approval rather than inheriting it.
 */
function rowIdentity(r: {
  cell_id: number;
  section_id: number | null;
  article: string | null;
  verbatim_snippet: string | null;
  source_url: string | null;
}): string {
  // JSON rather than a joined string: a separator has to be a character no field can contain, and
  // the obvious choice is a NUL, which makes the source file binary to git and invisible to grep.
  // JSON escaping makes the parts unambiguous without one.
  return JSON.stringify([
    r.cell_id,
    r.section_id,
    (r.article ?? '').trim(),
    (r.verbatim_snippet ?? '').trim(),
    (r.source_url ?? '').trim(),
  ]);
}

interface CarriedReview {
  identity: string;
  action: string;
  attestation: string | null;
  changed_fields: string | null;
  reviewer: string | null;
  acted_at: string;
}

interface CellRow {
  id: number;
  economy_code: string;
  indicator_id: string;
  state: string | null;
  unresolved_reason: string | null;
  score: number | null;
  rationale: string | null;
  controlling_instrument_id: number | null;
}

/** One finding the answer stood on, with the provision it was read out of. */
interface BasisRow {
  section_id: number;
  measure: string | null;
  reading_id: number | null;
  reading_quote: string | null;
  attributes: string | null;
  section_text: string;
  section_char_start: number;
  heading_path: string;
  label: string | null;
  anchor: string | null;
  language: string | null;
  doc_url: string;
  extraction: string | null;
  title: string;
  official_number: string | null;
  commenced_on: string | null;
  last_amended_on: string | null;
  instrument_language: string | null;
}

interface FrameworkBasisRow {
  title: string;
  sectoral_shown: number | null;
  official_number: string | null;
  commenced_on: string | null;
  last_amended_on: string | null;
  source_url: string;
  instrument_language: string | null;
  quote: string | null;
  sector: string | null;
  quote_verified: number | null;
}

/** One finding as the reader returned it. Only the fields a row shows are named. */
interface Finding {
  measure?: string;
  quote?: string;
  requirement?: string;
  dutyBearer?: string;
  dutyAct?: string;
}

/**
 * The finding behind one basis entry, out of the reading it was recorded in.
 *
 * Keyed on the measure because the decision is: one provision answers a measure once, so the
 * pair is unique and a reading that carried several findings gives back the one that counted.
 */
function findingOf(attributes: string | null, measure: string | null): Finding | null {
  if (!attributes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(attributes);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return (parsed as Finding[]).find((f) => f.measure === measure) ?? null;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * "Since March 2013, last amended in February 2021".
 *
 * ESCAP's reviewers asked for exactly this and no more: "suggest to just keep Since Month Year,
 * last amended in Month year". A day is precision we cannot always evidence, so it is not shown
 * even when the document happens to state one.
 */
export function timeframe(commencedOn: string | null, lastAmendedOn: string | null): string | null {
  const monthYear = (iso: string | null): string | null => {
    if (!iso) return null;
    const m = /^(\d{4})-(\d{2})/.exec(iso);
    if (!m) return null;
    const month = MONTHS[Number(m[2]) - 1];
    return month ? `${month} ${m[1]}` : m[1]!;
  };
  const since = monthYear(commencedOn);
  const amended = monthYear(lastAmendedOn);
  if (!since && !amended) return null;
  if (!since) return `Last amended in ${amended}`;
  return amended ? `Since ${since}, last amended in ${amended}` : `Since ${since}`;
}

/**
 * The Language of Source column, in the order the answers are worth believing.
 *
 * What the parser recorded for that provision, then what the portal said about the instrument,
 * then the provision's own words read against the languages the economy publishes law in. The
 * column was blank on every Malaysian row in the store, because the first two are null for that
 * whole economy and there was no third.
 *
 * The profile supplies the candidates rather than a fixed list: Malay and Indonesian share most of
 * their function words, and the economy is what separates them. A provision that still cannot be
 * classified stays null, because this column is a statement about a source document and a wrong
 * one is worse than an empty one.
 */
const profileLanguages = new Map<string, readonly string[]>();
function languageOf(
  sectionLanguage: string | null,
  instrumentLanguage: string | null,
  text: string,
  economy: string,
): string | null {
  if (sectionLanguage) return sectionLanguage;
  if (instrumentLanguage) return instrumentLanguage;

  let candidates = profileLanguages.get(economy);
  if (!candidates) {
    try {
      candidates = loadProfile(economy).officialLanguages;
    } catch {
      // An economy with no profile yet is the live-test case. Detection still runs; it just has
      // the whole Latin set to choose from, and abstains where that is not decisive.
      candidates = [];
    }
    profileLanguages.set(economy, candidates);
  }
  return detectLanguage(text, { candidates });
}

/**
 * A deep link to the provision, not to the top of a two-hundred-section Act.
 *
 * "none of the reference links lead to the right document" was a reviewer comment on someone
 * else's submission, and the anchor is the difference between a citation a reviewer can check in
 * one click and one they have to go hunting in.
 */
export function citationUrl(docUrl: string, anchor: string | null): string {
  if (!anchor) return docUrl;
  if (docUrl.includes('#')) return docUrl;
  // An anchor carrying a path of its own is a link, not a fragment: a compilation published in
  // several volumes gives each provision the volume it is actually in.
  return anchor.includes('#') ? new URL(anchor, docUrl).toString() : `${docUrl}#${anchor}`;
}

/**
 * How much of this row stands on checkable ground -- stated from facts, never from a feeling.
 *
 * A confidence that is a model's opinion of itself is worth nothing to a reviewer, so the ladder
 * below is a statement about the evidence: whether the quoted words were located
 * character-for-character in the stored source, whether the text they were located in was read or
 * guessed at by OCR, and whether a second, independent reading was asked to confirm the measure and
 * said yes.
 *
 * The template wants column L as a number between 0.00 and 1.00 and validates it programmatically,
 * so the number goes there and the sentence that earned it goes in Notes, which is free text.
 *
 * **These are ordinal, not calibrated probabilities.** `npm run -w backend calibration` measures the
 * agreement behind each rung against ESCAP's published answers; on run 82673dbf the two rungs
 * holding 89% of rows came out at 0.755 (CONFIRMED) and 0.694 (LOCATED). The ordering is real and
 * the separation is 0.061, which is why a reviewer should read the sentence in Notes rather than
 * threshold on the number. Anything at or below LOCATED deserves a human check.
 */
export const CONFIDENCE = {
  /** Quoted words located in the stored source, and a second reading confirmed the measure. */
  CONFIRMED: 0.9,
  /** Quoted words located in the stored source; no second reading was asked. */
  LOCATED: 0.75,
  /** Located, but in text recovered by OCR, which may have misread the characters. */
  OCR: 0.65,
  /** A quotation the stored source does not contain character-for-character. */
  UNLOCATED: 0.5,
  /** No requirement found, stated against an instrument that was actually read. */
  ABSENT: 0.6,
  /** A claim with no quotation behind it. */
  UNQUOTED: 0.4,
  /** The question could not be answered from the corpus. */
  UNRESOLVED: 0.2,
} as const;

/** The rung at or below which a row is worth a human's time. Quoted in the README. */
export const CHECK_BELOW = CONFIDENCE.LOCATED;

export interface Confidence {
  /** Column L, as the template wants it: 0.00 to 1.00. */
  value: number;
  /** Why it earned that, for Notes. Never null, so a row always says what it stands on. */
  because: string;
}

export function confidenceOf(opts: {
  quote: string | null;
  offsetsResolved: boolean;
  extraction: string | null;
  /** The second reading's verdict, where one was asked. `undefined` means it never was. */
  confirmed?: boolean | undefined;
}): Confidence {
  if (!opts.quote) return { value: CONFIDENCE.UNQUOTED, because: 'No quotation.' };
  if (!opts.offsetsResolved) {
    return {
      value: CONFIDENCE.UNLOCATED,
      because: 'Quoted words not located in the stored source.',
    };
  }
  if (opts.extraction === 'ocr') {
    return {
      value: CONFIDENCE.OCR,
      because: 'Quoted words located in text recovered by OCR.',
    };
  }
  if (opts.confirmed === true) {
    return {
      value: CONFIDENCE.CONFIRMED,
      because: 'Quoted words located in the stored source, and confirmed by a second reading.',
    };
  }
  return {
    value: CONFIDENCE.LOCATED,
    because: 'Quoted words located in the stored source; no second reading was asked.',
  };
}

/**
 * Column L, as the template formats it. Two decimals, so 0.9 is written 0.90 and a validator
 * reading the column as a number gets one.
 */
export function confidenceValue(c: Confidence): string {
  return c.value.toFixed(2);
}

/** The evidentiary sentence in front of whatever else the row had to say. */
export function noteWith(because: string, existing: string | null): string {
  return existing ? `${because} ${existing}` : because;
}

/**
 * The sentence a reviewer reads first.
 *
 * "rationale quotes before it interprets" appears six times across the graded submissions, so the
 * quotation leads and our reading follows it. Capped at the template's 300 characters by trimming
 * the interpretation, never the quotation: the quotation is the evidence and our sentence is the
 * claim, and a claim shortened past sense is better than evidence shortened past checking.
 */
const RATIONALE_MAX = 300;

/**
 * The template's cap, for the rows that have no quotation to build a rationale around.
 *
 * A zero row and an unresolved row state their reasoning in prose rather than through
 * `mappingRationale`, and so used to reach the workbook uncapped -- 78 of run 82673dbf's rows were
 * over the limit for exactly that reason. Trimmed on a word boundary, because a sentence cut
 * mid-word reads as corruption rather than as a limit.
 */
export function cappedRationale(text: string): string {
  if (text.length <= RATIONALE_MAX) return text;
  const room = RATIONALE_MAX - 3;
  const cut = text.slice(0, room);
  const space = cut.lastIndexOf(' ');
  return `${(space > room - 40 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

export function mappingRationale(quote: string | null, requirement: string | null): string {
  const MAX = RATIONALE_MAX;
  if (!quote) return cappedRationale(requirement ?? '');
  const quoted = `"${quote}"`;
  if (!requirement) return quoted.slice(0, MAX);
  const full = `${quoted} -- ${requirement}`;
  if (full.length <= MAX) return full;
  const room = MAX - quoted.length - ' -- '.length - '...'.length;
  return room > 20 ? `${quoted} -- ${requirement.slice(0, room)}...` : quoted.slice(0, MAX);
}

/**
 * Turn one run's answers into export rows.
 *
 * Idempotent: rows for the run's cells are cleared and rebuilt, so running it twice does not
 * double the export and a fixed defect does not leave its old rows behind.
 */
export function buildExportRows(db: Db, runId: string): BuildResult {
  const now = new Date().toISOString();

  const cells = db
    .prepare(
      `SELECT c.id, c.economy_code, c.indicator_id, c.state, c.unresolved_reason,
              a.score, a.rationale, a.controlling_instrument_id
         FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
        WHERE c.run_id = ? ORDER BY c.indicator_id`,
    )
    .all(runId) as CellRow[];

  const basisFor = db.prepare(
    `SELECT b.section_id, b.measure, r.id AS reading_id, r.quote AS reading_quote, r.attributes,
            s.text AS section_text, s.char_start AS section_char_start,
            s.heading_path, s.label, s.anchor, s.language,
            d.url AS doc_url, d.extraction,
            i.title, i.official_number, i.commenced_on, i.last_amended_on,
            i.language AS instrument_language
       FROM answer_basis b
       JOIN section s ON s.id = b.section_id
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
       LEFT JOIN reading r ON r.cell_id = b.cell_id AND r.section_id = b.section_id
      WHERE b.cell_id = ? AND b.section_id IS NOT NULL
      ORDER BY b.ordinal`,
  );

  // A framework indicator cites the instrument, not a provision: ESCAP is explicit that a
  // per-provision citation there is not a discovery.
  const frameworkBasisFor = db.prepare(
    `SELECT i.title, i.official_number, i.commenced_on, i.last_amended_on, i.source_url,
            i.language AS instrument_language, f.quote, f.sector, f.sectoral_shown, f.quote_verified
       FROM answer_basis b
       JOIN instrument i ON i.id = b.instrument_id
       LEFT JOIN framework_reading f ON f.cell_id = b.cell_id AND f.instrument_id = b.instrument_id
      WHERE b.cell_id = ? AND b.section_id IS NULL
      ORDER BY b.ordinal`,
  );

  // The instruments carrying the same framework. ESCAP asked for one official link per row and
  // the rest in the notes, so they are named rather than given rows of their own.
  const alsoCarrying = db.prepare(
    `SELECT i.title
       FROM framework_reading f
       JOIN instrument i ON i.id = f.instrument_id
      WHERE f.cell_id = ? AND f.establishes_framework = 1
        AND f.instrument_id <> (SELECT instrument_id FROM answer_basis
                                 WHERE cell_id = ? AND section_id IS NULL ORDER BY ordinal LIMIT 1)
      ORDER BY f.id`,
  );

  // A few of an instrument's own provisions, for a row that has no quote of its own to read a
  // language out of. Cached per instrument: one Act cited by forty zero rows is one question.
  const instrumentSample = db.prepare(
    `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id
      WHERE d.instrument_id = ? AND length(s.text) > 200 ORDER BY s.id LIMIT 5`,
  );
  const samples = new Map<number, string>();
  const sampleOf = (instrumentId: number | null): string => {
    if (!instrumentId) return '';
    let text = samples.get(instrumentId);
    if (text === undefined) {
      text = (instrumentSample.all(instrumentId) as { text: string }[]).map((r) => r.text).join(' ');
      samples.set(instrumentId, text);
    }
    return text;
  };

  const instrument = db.prepare(
    `SELECT i.id, i.title, i.official_number, i.commenced_on, i.last_amended_on, i.source_url,
            i.language
       FROM instrument i WHERE i.id = ?`,
  );

  const insert = db.prepare(
    `INSERT INTO export_row
       (cell_id, economy, law_name, law_number_ref, last_amended, indicator_id, article,
        discovery_tag, location_reference, verbatim_snippet, quote_char_start, quote_char_end,
        mapping_rationale, source_url,
        confidence, notes, language_of_source, section_id, reading_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  let rows = 0;
  let cellsWithoutRow = 0;

  // The second reading's verdicts, so a row can say whether anything checked it. Banked by the
  // confirmation pass; a run that never ran one simply finds nothing here and says so.
  const confirmations = loadConfirmations(db);

  let reviewsCarried = 0;
  let reviewsDropped = 0;

  db.transaction(() => {
    // Taken before the delete, because the delete cascades them away.
    const priorReviews = (
      db
        .prepare(
          `SELECT e.cell_id, e.section_id, e.article, e.verbatim_snippet, e.source_url,
                  r.action, r.attestation, r.changed_fields, r.reviewer, r.acted_at
             FROM review_action r
             JOIN export_row e ON e.id = r.export_row_id
             JOIN cell c ON c.id = e.cell_id
            WHERE c.run_id = ?`,
        )
        .all(runId) as (Parameters<typeof rowIdentity>[0] & Omit<CarriedReview, 'identity'>)[]
    ).map((r) => ({ ...r, identity: rowIdentity(r) }));

    db.prepare('DELETE FROM export_row WHERE cell_id IN (SELECT id FROM cell WHERE run_id = ?)').run(runId);

    for (const cell of cells) {
      let made = 0;

      if (cell.state === 'restricted') {
        for (const b of basisFor.all(cell.id) as BasisRow[]) {
          const f = findingOf(b.attributes, b.measure);
          const quote = f?.quote ?? b.reading_quote;
          // Located per finding, because the quote differs per finding and the reading carries
          // only the first one's span.
          const at = quote ? locateQuote(b.section_text, quote) : null;
          const confidence = confidenceOf({
            quote,
            offsetsResolved: at !== null,
            extraction: b.extraction,
            confirmed: confirmations.verdict(b.section_id, cell.indicator_id, b.measure),
          });
          insert.run(
            cell.id,
            cell.economy_code,
            b.title,
            b.official_number,
            timeframe(b.commenced_on, b.last_amended_on),
            cell.indicator_id,
            b.label ?? b.heading_path,
            null, // discovery tag: applied outside src/, where the baseline may be read
            b.heading_path,
            quote,
            at ? b.section_char_start + at.start : null,
            at ? b.section_char_start + at.end : null,
            mappingRationale(quote, f?.requirement ?? null),
            citationUrl(b.doc_url, b.anchor),
            confidenceValue(confidence),
            noteWith(
              confidence.because,
              noteFor(f ?? (b.measure ? { measure: b.measure } : {}), b.extraction),
            ),
            languageOf(b.language, b.instrument_language, b.section_text, cell.economy_code),
            b.section_id,
            b.reading_id,
            now,
          );
          rows += 1;
          made += 1;
        }

        for (const b of frameworkBasisFor.all(cell.id) as FrameworkBasisRow[]) {
          // No confirmation is asked of a framework row: the second reading asks whether a
          // provision states a measure, and this row's claim is about an instrument as a whole.
          const confidence = confidenceOf({
            quote: b.quote,
            offsetsResolved: b.quote_verified === 1,
            extraction: null,
          });
          insert.run(
            cell.id,
            cell.economy_code,
            b.title,
            b.official_number,
            timeframe(b.commenced_on, b.last_amended_on),
            cell.indicator_id,
            null, // the instrument is the citation; there is no provision to point at
            null,
            null,
            b.quote,
            null,
            null,
            mappingRationale(b.quote, cell.rationale),
            b.source_url,
            confidenceValue(confidence),
            noteWith(
              confidence.because,
              frameworkNote(b, (alsoCarrying.all(cell.id, cell.id) as { title: string }[]).map((x) => x.title)),
            ),
            b.instrument_language,
            null,
            null,
            now,
          );
          rows += 1;
          made += 1;
        }
      }

      // A cell that found no requirement still names what it was read against. Without this row
      // the export would simply be missing the cell, and a missing cell reads as an oversight
      // where a finding of absence belongs -- more than half of ESCAP's own rows are this shape.
      if (cell.state === 'no-restriction' && made === 0) {
        const inst = cell.controlling_instrument_id
          ? (instrument.get(cell.controlling_instrument_id) as
              | {
                  title: string; official_number: string | null; commenced_on: string | null;
                  last_amended_on: string | null; source_url: string; language: string | null;
                }
              | undefined)
          : undefined;
        insert.run(
          cell.id, cell.economy_code, inst?.title ?? 'No instrument identified',
          inst?.official_number ?? null,
          timeframe(inst?.commenced_on ?? null, inst?.last_amended_on ?? null),
          cell.indicator_id, null, null, null, null, null, null,
          cappedRationale(cell.rationale ?? 'No requirement found.'),
          inst?.source_url ?? null,
          CONFIDENCE.ABSENT.toFixed(2),
          noteWith(
            inst
              ? 'No requirement found in the instrument read.'
              : 'No requirement found, and no instrument was identified to state it against.',
            null,
          ),
          // A zero row has no quote to read a language out of, so the instrument it was read
          // against answers for it -- sampled from its own provisions, not assumed.
          languageOf(null, inst?.language ?? null, sampleOf(cell.controlling_instrument_id), cell.economy_code),
          null, null, now,
        );
        rows += 1;
        made += 1;
      }

      if (cell.state === 'unresolved' && made === 0) {
        insert.run(
          cell.id, cell.economy_code, 'Not determined', null, null, cell.indicator_id,
          null, null, null, null, null, null,
          cappedRationale(cell.unresolved_reason ?? 'The question could not be answered from the corpus.'),
          null,
          CONFIDENCE.UNRESOLVED.toFixed(2),
          noteWith('The question could not be answered from the corpus.', cell.unresolved_reason),
          null, null, null, now,
        );
        rows += 1;
        made += 1;
      }

      if (made === 0) cellsWithoutRow += 1;
    }

    // Put the reviewers' decisions back on the rows that still say the same thing.
    if (priorReviews.length > 0) {
      const rebuilt = new Map<string, number>();
      for (const row of db
        .prepare(
          `SELECT e.id, e.cell_id, e.section_id, e.article, e.verbatim_snippet, e.source_url
             FROM export_row e JOIN cell c ON c.id = e.cell_id WHERE c.run_id = ?`,
        )
        .all(runId) as (Parameters<typeof rowIdentity>[0] & { id: number })[]) {
        // First writer wins: two identical rows are indistinguishable to a reviewer anyway.
        const key = rowIdentity(row);
        if (!rebuilt.has(key)) rebuilt.set(key, row.id);
      }

      const reinsert = db.prepare(
        `INSERT INTO review_action
           (export_row_id, action, attestation, changed_fields, reviewer, acted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const r of priorReviews) {
        const id = rebuilt.get(r.identity);
        if (id === undefined) {
          reviewsDropped += 1;
          continue;
        }
        reinsert.run(id, r.action, r.attestation, r.changed_fields, r.reviewer, r.acted_at);
        reviewsCarried += 1;
      }
    }
  })();

  return { rows, cells: cells.length, cellsWithoutRow, reviewsCarried, reviewsDropped };
}

/**
 * What the row should say about itself beyond the claim.
 *
 * OCR is named because ESCAP marks a tool that flags text it could not read cleanly above one
 * that presents everything with equal confidence.
 */
function noteFor(f: Finding, extraction: string | null): string | null {
  const parts: string[] = [];
  if (f.measure) parts.push(`Measure: ${f.measure}.`);
  if (f.dutyBearer && f.dutyAct) parts.push(`Binds ${f.dutyBearer}: ${f.dutyAct}.`);
  if (extraction === 'ocr') parts.push('Source text recovered by OCR; the quotation should be spot-checked.');
  return parts.length ? parts.join(' ') : null;
}

/**
 * What a framework row says beyond naming the instrument.
 *
 * Reach is reported only where the instrument's own words confine it -- the reader's sector label
 * is a claim, and an unshown claim would put "limited to: all" on a row.
 */
function frameworkNote(row: FrameworkBasisRow, alsoCarrying: string[]): string {
  const parts: string[] = [];
  parts.push(
    row.sectoral_shown === 1 && row.sector
      ? `Framework limited to ${row.sector}, in the instrument's own words.`
      : 'Framework applying across sectors.',
  );
  if (alsoCarrying.length > 0) {
    parts.push(`Also carried by: ${alsoCarrying.slice(0, 6).join('; ')}.`);
  }
  return parts.join(' ');
}
