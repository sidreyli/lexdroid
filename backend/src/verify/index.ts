/**
 * Verification: what can be checked without asking anything.
 *
 * Every gate here is a question with a determinate answer -- the quoted words are in the source or
 * they are not, the offset points at them or it does not, the instrument is in force or it is not.
 * No model is consulted, because a model's opinion of a model's output is not verification.
 *
 * These are not gates we invented. Each one answers a comment ESCAP's reviewers actually wrote on
 * the fifteen graded submissions:
 *
 *   quote-in-source     "section 125 did not mention the minimum 7 years period"
 *   offsets-resolve     the same defect, caught before a human has to read the Act
 *   pinpoint-citation   "none of the reference links lead to the right document"
 *   official-host       a citation to a law-firm summary instead of the statute
 *   in-force            the MAS Notice cancelled 01 July 2022
 *   timeframe-evidenced "no evidence that the Act was last amended in 2023, please double check"
 *   one-measure         "if the single entry includes multi measures, suggest to separate"
 *   quote-leads         "rationale quotes before it interprets", six times over
 *   score-recomputes    ours, and the one no other submission could run: the score is a pure
 *                       function of recorded attributes, so it can be derived again and compared.
 *
 * A row that fails a gate is HELD, with the failure named. Nothing is dropped, nothing is deleted,
 * and no pattern is written to make a bad row disappear -- a held row is a row a reviewer is asked
 * about, which is the whole point of having a reviewer.
 */
import type { Db } from '../db/index.js';
import { amendsAnotherAct } from '../parse/identity.js';
import { citationUrl } from '../export/index.js';
import { decide, type Evidence, type FrameworkEvidence, type SurfacedInstrument } from '../decide/index.js';
import { loadRubric } from '../rubric/index.js';
import { ratesOfRun } from '../run/index.js';
import { elidedFragments } from '../util/locate.js';

export interface GateOutcome {
  gate: string;
  passed: boolean;
  detail: string | null;
}

export interface RowVerdict {
  exportRowId: number;
  indicatorId: string;
  held: boolean;
  outcomes: GateOutcome[];
}

export interface VerifyResult {
  rows: number;
  held: number;
  byGate: Record<string, { passed: number; failed: number }>;
  verdicts: RowVerdict[];
}

/**
 * Hosts whose documents are the law rather than a description of it.
 *
 * Deliberately per-economy and read from the profile, not hardcoded here: the live-test economy is
 * one nobody has looked at, and a list of Singapore and Australian domains compiled in advance
 * would silently fail every row of it.
 */
function officialHosts(db: Db, economy: string): Set<string> {
  const hosts = new Set<string>();
  const rows = db
    .prepare('SELECT url FROM portal WHERE economy_code = ?')
    .all(economy) as { url: string | null }[];
  for (const r of rows) {
    if (!r.url) continue;
    try {
      hosts.add(new URL(r.url).host.toLowerCase());
    } catch {
      // A portal row with an unparseable base is a profile defect; it must not take the gate down.
    }
  }
  return hosts;
}

/**
 * Is this host an arm of the state?
 *
 * The portal list is the primary answer. The suffix rules are a fallback for an economy whose
 * profile is thin, and they are conservative on purpose -- a false pass here is a citation to
 * somebody's blog surviving into the export.
 */
export function isOfficialHost(host: string, known: Set<string>): boolean {
  const h = host.toLowerCase();
  if (known.has(h)) return true;
  for (const k of known) if (h.endsWith(`.${k}`)) return true;
  return /(^|\.)gov(\.[a-z]{2,3})?(\.[a-z]{2})?$/.test(h) || /\.gov\.[a-z]{2}$/.test(h) || h.endsWith('.gov');
}

/**
 * Are the quoted words in the provision?
 *
 * A quotation that elides is checked fragment by fragment, each after the one before. That is a
 * weaker claim than an unbroken quote and a real one: the words are there, in that order.
 */
export function quoteAppearsIn(sectionText: string, quote: string): boolean {
  const haystack = normalise(sectionText);
  const fragments = elidedFragments(quote);
  if (!fragments) return haystack.includes(normalise(quote));

  let from = 0;
  for (const fragment of fragments) {
    const at = haystack.indexOf(normalise(fragment), from);
    if (at < 0) return false;
    from = at + normalise(fragment).length;
  }
  return true;
}

/** Normalised for comparison: whitespace and the quotation marks a source may render differently. */
function normalise(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Does the rationale put its evidence before its interpretation?
 *
 * Checked as a position, not a presence: a quotation appended after a paragraph of our own prose
 * is not the reviewer's request. The quoted passage has to come first.
 */
export function quoteLeads(rationale: string | null): boolean {
  if (!rationale) return false;
  const trimmed = rationale.trimStart();
  return trimmed.startsWith('"') || trimmed.startsWith('“');
}

interface RowRecord {
  id: number;
  cell_id: number;
  economy: string;
  indicator_id: string;
  verbatim_snippet: string | null;
  mapping_rationale: string | null;
  source_url: string | null;
  last_amended: string | null;
  notes: string | null;
  section_id: number | null;
  state: string | null;
  score: number | null;
  band_ordinal: number | null;
  section_text: string | null;
  doc_text: string | null;
  quote_char_start: number | null;
  quote_char_end: number | null;
  anchor: string | null;
  status: string | null;
  status_basis: string | null;
  timeframe_basis: string | null;
}

/**
 * Run every gate over every export row of a run.
 *
 * Offline by design. A link check needs the network and belongs to a stage that is allowed to
 * reach it; everything here is answerable from what the run already stored, which means it can be
 * re-run months later against the same store and give the same answer.
 */
export function verifyRun(db: Db, runId: string): VerifyResult {
  const now = new Date().toISOString();

  const rows = db
    .prepare(
      `SELECT e.id, e.cell_id, e.economy, e.indicator_id, e.verbatim_snippet, e.mapping_rationale,
              e.source_url, e.last_amended, e.notes, e.section_id,
              e.quote_char_start, e.quote_char_end,
              c.state, a.score, a.band_ordinal,
              s.text AS section_text, s.anchor,
              dt.text AS doc_text,
              i.status, i.status_basis, i.timeframe_basis
         FROM export_row e
         JOIN cell c ON c.id = e.cell_id
         LEFT JOIN cell_answer a ON a.cell_id = e.cell_id
         LEFT JOIN section s ON s.id = e.section_id
         LEFT JOIN document d ON d.id = s.document_id
         LEFT JOIN document_text dt ON dt.document_id = d.id
         LEFT JOIN instrument i ON i.id = d.instrument_id
        WHERE c.run_id = ? ORDER BY e.id`,
    )
    .all(runId) as RowRecord[];

  const hostsByEconomy = new Map<string, Set<string>>();
  const record = db.prepare(
    `INSERT INTO gate_result (export_row_id, gate, passed, detail, checked_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(export_row_id, gate) DO UPDATE SET
       passed = excluded.passed, detail = excluded.detail, checked_at = excluded.checked_at`,
  );

  const byGate: Record<string, { passed: number; failed: number }> = {};
  const verdicts: RowVerdict[] = [];

  // The score is derived again from the record before any row is judged, because it is a property
  // of the cell rather than of the row, and every row the cell produced stands or falls with it.
  const recomputed = recomputeScores(db, runId);

  db.transaction(() => {
    for (const row of rows) {
      if (!hostsByEconomy.has(row.economy)) {
        hostsByEconomy.set(row.economy, officialHosts(db, row.economy));
      }
      const outcomes = gatesFor(row, hostsByEconomy.get(row.economy)!);
      const again = recomputed.perCell.get(row.cell_id);
      if (again) {
        outcomes.push({ gate: 'score-recomputes', passed: again.agreed, detail: again.why });
      }
      for (const o of outcomes) {
        record.run(row.id, o.gate, o.passed ? 1 : 0, o.detail, now);
        const t = (byGate[o.gate] ??= { passed: 0, failed: 0 });
        if (o.passed) t.passed += 1;
        else t.failed += 1;
      }
      const held = outcomes.some((o) => !o.passed);
      verdicts.push({ exportRowId: row.id, indicatorId: row.indicator_id, held, outcomes });
    }
  })();

  return { rows: rows.length, held: verdicts.filter((v) => v.held).length, byGate, verdicts };
}

/**
 * The gates for one row.
 *
 * A row citing no provision -- a finding of absence, or a cell we could not answer -- is not put
 * through the provision gates. It is not exempt from scrutiny; it is a different claim, and
 * running a quote gate against a row that never claimed a quote would report a failure that is
 * really a category error, and bury the real failures under it.
 */
function gatesFor(row: RowRecord, hosts: Set<string>): GateOutcome[] {
  const out: GateOutcome[] = [];
  const cites = row.section_id !== null;

  if (cites) {
    // 1. The quoted words are in the provision, character for character once whitespace and
    //    typographic quotation marks are normalised.
    const quote = row.verbatim_snippet;
    if (!quote) {
      out.push({ gate: 'quote-in-source', passed: false, detail: 'the row cites a provision but quotes nothing from it' });
    } else if (!row.section_text) {
      out.push({ gate: 'quote-in-source', passed: false, detail: 'the cited provision is no longer in the store' });
    } else {
      const found = quoteAppearsIn(row.section_text, quote);
      out.push({
        gate: 'quote-in-source',
        passed: found,
        detail: found ? null : `not found in the provision: "${quote.slice(0, 80)}"`,
      });
    }

    // 2. The row's own offsets point at its own words in the document text. On the row rather
    //    than the reading: one reading yields several findings, each quoting a different span.
    if (quote && row.quote_char_start !== null && row.quote_char_end !== null && row.doc_text) {
      const at = row.doc_text.slice(row.quote_char_start, row.quote_char_end);
      // An elided quotation spans the words it skipped, so the offsets bound the passage rather
      // than reproduce it. What is checked is that every fragment sits inside those bounds, in order.
      const fragments = elidedFragments(quote);
      const ok = fragments ? quoteAppearsIn(at, quote) : normalise(at) === normalise(quote);
      out.push({
        gate: 'offsets-resolve',
        passed: ok,
        detail: ok ? null : `offset ${row.quote_char_start}-${row.quote_char_end} reads "${at.slice(0, 60)}"`,
      });
    } else {
      out.push({
        gate: 'offsets-resolve',
        passed: false,
        detail: 'no offsets were recorded, so the quotation cannot be located mechanically',
      });
    }

    // 3. The link goes to the provision, not the top of a two-hundred-section Act.
    const deep = row.source_url !== null && row.source_url.includes('#');
    out.push({
      gate: 'pinpoint-citation',
      passed: deep,
      detail: deep ? null : row.anchor
        ? 'the provision has an anchor on the source site and the citation does not use it'
        : 'the source document offers no per-provision anchor',
    });

    // 4. The instrument is one a row may cite at all.
    const status = row.status ?? 'unknown';
    out.push({
      gate: 'in-force',
      passed: status === 'in-force' && row.status_basis !== null,
      detail:
        status !== 'in-force'
          ? `the instrument's status is "${status}"`
          : row.status_basis === null
            ? 'the instrument is marked in force with nothing recorded to evidence it'
            : null,
    });

    // 5. A stated date is evidenced by the document itself, or it is not stated.
    const dated = row.last_amended !== null;
    const evidenced = row.timeframe_basis !== null && row.timeframe_basis.trim().length > 0;
    out.push({
      gate: 'timeframe-evidenced',
      passed: !dated || evidenced,
      detail: !dated || evidenced ? null : 'a date is stated with nothing in the document to support it',
    });

    // 6. One measure per row.
    const measures = (row.notes ?? '').match(/Measure: /g)?.length ?? 0;
    out.push({
      gate: 'one-measure',
      passed: measures <= 1,
      detail: measures <= 1 ? null : `${measures} measures on one row`,
    });
  }

  // 7. The rationale leads with the evidence. Asked of every row that makes a positive claim; a
  //    row reporting absence has no quotation to lead with and says so in its own words.
  if (cites) {
    const leads = quoteLeads(row.mapping_rationale);
    out.push({
      gate: 'quote-leads',
      passed: leads,
      detail: leads ? null : 'the rationale interprets before it quotes',
    });
  }

  // 8. An official host, whatever the row claims.
  if (row.source_url) {
    let host = '';
    try {
      host = new URL(row.source_url).host;
    } catch {
      host = '';
    }
    const ok = host !== '' && isOfficialHost(host, hosts);
    out.push({
      gate: 'official-host',
      passed: ok,
      detail: ok ? null : host === '' ? `unparseable url: ${row.source_url.slice(0, 60)}` : `${host} is not a known official host for ${row.economy}`,
    });
  } else if (row.state !== 'unresolved') {
    out.push({ gate: 'official-host', passed: false, detail: 'the row cites no source at all' });
  }

  // 9. The cell has an answer, and its band is one the rubric defines. A row whose cell never
  //    resolved to a band is a row with nothing behind it.
  if (row.state !== 'unresolved') {
    const banded = row.band_ordinal !== null && row.score !== null;
    out.push({
      gate: 'score-recorded',
      passed: banded,
      detail: banded ? null : 'the row exists but its cell resolved to no band',
    });
  }

  return out;
}

/**
 * Derive every score again, from the record alone, and see whether it comes out the same.
 *
 * This is the gate no submission that generates its scores can run. Zone 3 is a pure function of
 * attributes the reader returned, so the attributes are stored and the function can be applied to
 * them a second time -- next week, on another machine, with no model running anywhere -- and the
 * answer compared to the one the run reported. Agreement is evidence that the score follows from
 * the evidence rather than from anything that happened at the time; disagreement is a defect,
 * either in what was stored or in a rubric that has been edited since the run.
 *
 * It is also the honest form of the reproducibility claim. "Same input, same score, every time" is
 * a property to be checked, not asserted, and this checks it against real runs rather than against
 * fixtures written to agree.
 */
export interface RecomputeResult {
  cells: number;
  agreed: number;
  disagreed: { indicatorId: string; stored: number | null; recomputed: number | null; why: string }[];
  /** Per cell, so verifyRun can hang the outcome on every row that cell produced. */
  perCell: Map<number, { agreed: boolean; why: string | null }>;
}

/** The instrument ids recorded with the cell, or none where a store predates the column. */
function parseGoverning(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

export function recomputeScores(db: Db, runId: string): RecomputeResult {
  const cells = db
    .prepare(
      `SELECT c.id, c.economy_code, c.indicator_id, c.sections_read, c.sections_indexed, c.surfaced,
              c.governing, a.score, a.band_ordinal
         FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
        WHERE c.run_id = ? ORDER BY c.indicator_id`,
    )
    .all(runId) as {
    id: number; economy_code: string; indicator_id: string;
    sections_read: number | null; sections_indexed: number | null; surfaced: number | null;
    governing: string | null; score: number | null; band_ordinal: number | null;
  }[];

  const evidenceFor = db.prepare(
    `SELECT r.attributes, r.section_id, s.heading_path, s.text, s.anchor, d.url AS doc_url,
            i.id AS instrument_id, i.title
       FROM reading r
       JOIN section s ON s.id = r.section_id
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE r.cell_id = ? AND r.applies = 1 ORDER BY r.id`,
  );

  const frameworkFor = db.prepare(
    `SELECT f.instrument_id, f.establishes_framework, f.horizontal, f.dedicated,
            f.dedicated_shown, f.sectoral_shown, f.sector, f.quote,
            i.title, i.source_url
       FROM framework_reading f JOIN instrument i ON i.id = f.instrument_id
      WHERE f.cell_id = ? ORDER BY f.id`,
  );

  // Which instruments the search surfaced, and how high. Needed to evidence a zero, and rebuilt
  // from the shortlist rather than re-run: the point is to re-derive the decision from what was
  // recorded, not to redo the search and get a different list to decide over.
  const currentToFor = new Map<number, string | null>(
    (db.prepare('SELECT id, last_amended_on FROM instrument').all() as
      { id: number; last_amended_on: string | null }[]).map((r) => [r.id, r.last_amended_on]),
  );

  const surfacedFor = db.prepare(
    `SELECT i.id AS instrumentId, i.title AS instrumentTitle, MIN(se.rank) AS rank
       FROM shortlist_entry se
       JOIN section s ON s.id = se.section_id
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE se.cell_id = ? GROUP BY i.id ORDER BY rank`,
  );

  const rubric = loadRubric();
  const byId = new Map(rubric.indicators.map((i) => [i.id, i]));
  // The rate that produced the score, not today's, or re-deriving would re-price rather than check.
  const rates = ratesOfRun(db, runId);

  let agreed = 0;
  const disagreed: { indicatorId: string; stored: number | null; recomputed: number | null; why: string }[] = [];
  const perCell = new Map<number, { agreed: boolean; why: string | null }>();

  for (const cell of cells) {
    const indicator = byId.get(cell.indicator_id);
    if (!indicator) {
      const why = 'the rubric no longer defines this indicator';
      disagreed.push({ indicatorId: cell.indicator_id, stored: cell.score, recomputed: null, why });
      perCell.set(cell.id, { agreed: false, why });
      continue;
    }

    const evidence: Evidence[] = [];
    for (const r of evidenceFor.all(cell.id) as {
      attributes: string; section_id: number; heading_path: string; text: string; anchor: string | null;
      doc_url: string; instrument_id: number; title: string;
    }[]) {
      let findings: unknown = [];
      try {
        findings = JSON.parse(r.attributes);
      } catch {
        findings = [];
      }
      if (!Array.isArray(findings)) continue;
      for (const finding of findings) {
        evidence.push({
          finding: finding as Evidence['finding'],
          sectionId: r.section_id,
          instrumentId: r.instrument_id,
          instrumentTitle: r.title,
          headingPath: r.heading_path,
          amendsAnotherAct: amendsAnotherAct(r.text),
          citation: citationUrl(r.doc_url, r.anchor),
        });
      }
    }

    const frameworkEvidence: FrameworkEvidence[] = (frameworkFor.all(cell.id) as {
      instrument_id: number; establishes_framework: number; horizontal: number | null;
      dedicated: number | null; dedicated_shown: number | null; sectoral_shown: number | null;
      sector: string | null; quote: string | null;
      title: string; source_url: string;
    }[]).map((f) => ({
      instrumentId: f.instrument_id,
      instrumentTitle: f.title,
      citation: f.source_url,
      establishesFramework: f.establishes_framework === 1,
      horizontal: f.horizontal === 1,
      dedicated: f.dedicated === 1,
      dedicatedShown: f.dedicated_shown === 1,
      sectoralShown: f.sectoral_shown === 1,
      sector: f.sector,
      quote: f.quote ?? '',
    }));

    const surfaced = surfacedFor.all(cell.id) as SurfacedInstrument[];
    for (const s of surfaced) s.currentTo = currentToFor.get(s.instrumentId) ?? null;

    const again = decide({
      indicator,
      economy: cell.economy_code,
      evidence,
      frameworkEvidence,
      surfaced,
      // The register's verdict as the run had it. Re-deriving against today's register would be
      // re-running the shortlist rather than checking the score.
      governing: parseGoverning(cell.governing),
      coverage: {
        sectionsRead: cell.sections_read ?? 0,
        sectionsIndexed: cell.sections_indexed ?? 0,
        instrumentsConsidered: cell.surfaced ?? 0,
      },
      rates,
    });

    if (again.score === cell.score && (again.band?.ordinal ?? null) === cell.band_ordinal) {
      agreed += 1;
      perCell.set(cell.id, { agreed: true, why: null });
    } else {
      const why =
        `band ${cell.band_ordinal} recorded, band ${again.band?.ordinal ?? 'none'} re-derived ` +
        `from ${evidence.length} finding(s)`;
      disagreed.push({
        indicatorId: cell.indicator_id, stored: cell.score, recomputed: again.score, why,
      });
      perCell.set(cell.id, { agreed: false, why });
    }
  }

  return { cells: cells.length, agreed, disagreed, perCell };
}
