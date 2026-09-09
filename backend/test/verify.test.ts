/**
 * The gates, and the export rows they are run against.
 *
 * Each gate here answers a comment ESCAP's reviewers wrote on somebody's submission. The tests are
 * written the same way round: the case that failed in the graded set is the case asserted, so a
 * change that quietly re-admits it fails here rather than in a reviewer's hands.
 */
import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import {
  buildExportRows, citationUrl, confidenceOf, mappingRationale, timeframe,
} from '../src/export/index.js';
import { isOfficialHost, quoteLeads, recomputeScores, verifyRun } from '../src/verify/index.js';

const SECTION_TEXT =
  'A company must keep such accounting records as are necessary to explain the transactions ' +
  'of the company, and must retain those records for not less than 5 years.';

const QUOTE = 'must retain those records for not less than 5 years';

/** A store holding one run, one cell, one provision read, and nothing invented. */
function storeWithOneAnswer(
  over: { quote?: string; anchor?: string | null; status?: string; statusBasis?: string | null } = {},
): Db {
  const db = openDb(':memory:');
  const now = '2026-09-07T00:00:00.000Z';
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  db.prepare(
    "INSERT INTO portal (economy_code, name, url, kind) VALUES ('SGP','SSO','https://sso.agc.gov.sg/','legislation-database')",
  ).run();
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1', ?, '["SGP"]', '[7]', 'engine-a', 'm', 'cache-only', 'abc', ?, 'complete')`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO instrument (id, economy_code, title, kind, status, status_basis, source_url,
                             official_number, commenced_on, last_amended_on, timeframe_basis,
                             language, discovered_via, discovered_at)
     VALUES (1,'SGP','Companies Act 1967','act',?,?,'https://sso.agc.gov.sg/Act/CoA1967','Act 42 of 1967',
             '1967-12-29','2023-07-01','"Last amended on 1 July 2023"','en','portal',?)`,
  ).run(
    over.status ?? 'in-force',
    over.statusBasis === undefined
      ? 'Listed under "Browse > Acts > Current" at https://sso.agc.gov.sg on 2026-09-07'
      : over.statusBasis,
    now,
  );
  db.prepare(
    `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status,
                           fetched_at, extraction)
     VALUES (1,1,'https://sso.agc.gov.sg/Act/CoA1967','h','text/html',1,200,?,'html')`,
  ).run(now);
  db.prepare(
    "INSERT INTO document_text (document_id, text, parser, parsed_at) VALUES (1, ?, 'cheerio', ?)",
  ).run(SECTION_TEXT, now);
  db.prepare(
    `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end,
                          language, anchor)
     VALUES (1,1,1,'Part VI ACCOUNTS AND AUDIT > 199 Accounting records',?,?,0,?, 'en', ?)`,
  ).run('199', SECTION_TEXT, SECTION_TEXT.length, over.anchor === undefined ? 'pr199-' : over.anchor);

  db.prepare(
    `INSERT INTO cell (id, run_id, economy_code, indicator_id, state, answered_at,
                       queries, depth, surfaced, sections_indexed, sections_read)
     VALUES (1,'r1','SGP','7.3','restricted',?, '["retention"]', 50, 6, 6143, 24)`,
  ).run(now);

  const quote = over.quote ?? QUOTE;
  const start = SECTION_TEXT.indexOf(quote);
  db.prepare(
    `INSERT INTO reading (id, cell_id, section_id, engine, model, applies, quote,
                          quote_char_start, quote_char_end, attributes, read_at)
     VALUES (1,1,1,'engine-a','m',1,?,?,?,?,?)`,
  ).run(
    quote,
    start >= 0 ? start : null,
    start >= 0 ? start + quote.length : null,
    JSON.stringify([
      {
        indicatorId: '7.3', measure: 'minimum-retention', quote,
        dutyBearer: 'A company', dutyAct: 'must keep', dutyForce: 'requires',
        definingWords: 'not less than 5 years',
        imposingWords: 'must keep',
        requirement: 'Accounting records must be kept for at least five years.',
        sectorScope: 'all', sector: null, dataScope: 'non-personal', dataDescription: null,
        appliesOnlyToGovernmentData: false, mandatory: true, countriesNamed: [],
        statedPeriod: '5 years', authorisation: 'unstated',
      },
    ]),
    now,
  );
  db.prepare(
    `INSERT INTO cell_answer (cell_id, score, band_ordinal, band_criterion, deciding_fact,
                              controlling_instrument_id, rationale, computed_at)
     VALUES (1, 1, 1, 'A minimum retention period is imposed', 'a stated period of 5 years', 1, 'x', ?)`,
  ).run(now);
  return db;
}

describe('the export row', () => {
  it('makes one row per measure, not one per reading', () => {
    // "if the single entry includes multi measures, suggest to separate" -- a reviewer accepts or
    // rejects one claim at a time, so two findings in one reading are two rows.
    const db = storeWithOneAnswer();
    db.prepare('UPDATE reading SET attributes = ? WHERE id = 1').run(
      JSON.stringify([
        { indicatorId: '7.3', measure: 'minimum-retention', quote: QUOTE, requirement: 'Five years.', mandatory: true, dutyForce: 'requires' },
        { indicatorId: '7.3', measure: 'minimum-retention', quote: QUOTE, requirement: 'Records kept.', mandatory: true, dutyForce: 'requires' },
      ]),
    );
    const built = buildExportRows(db, 'r1');
    expect(built.rows).toBe(2);
    expect(built.cellsWithoutRow).toBe(0);
    db.close();
  });

  it('gives a cell that found nothing a row naming what it was read against', () => {
    // More than half of ESCAP's own rows are this shape. A missing cell reads as an oversight
    // where a finding of absence belongs.
    const db = storeWithOneAnswer();
    db.prepare("UPDATE cell SET state = 'no-restriction' WHERE id = 1").run();
    db.prepare('UPDATE cell_answer SET score = 0, rationale = ? WHERE cell_id = 1').run(
      'Companies Act 1967 regulates this area and imposes no minimum retention period.',
    );
    const built = buildExportRows(db, 'r1');
    expect(built.rows).toBe(1);
    const row = db.prepare('SELECT * FROM export_row').get() as { law_name: string; verbatim_snippet: string | null };
    expect(row.law_name).toBe('Companies Act 1967');
    expect(row.verbatim_snippet).toBeNull();
    db.close();
  });

  it('leaves no cell without a row, including one it could not answer', () => {
    const db = storeWithOneAnswer();
    db.prepare("UPDATE cell SET state = 'unresolved', unresolved_reason = 'nothing readable' WHERE id = 1").run();
    const built = buildExportRows(db, 'r1');
    expect(built.cellsWithoutRow).toBe(0);
    expect(built.rows).toBe(1);
    db.close();
  });

  it('rebuilds rather than duplicates when it is run twice', () => {
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    const second = buildExportRows(db, 'r1');
    expect(second.rows).toBe(1);
    expect((db.prepare('SELECT COUNT(*) n FROM export_row').get() as { n: number }).n).toBe(1);
    db.close();
  });

  it('states a timeframe in the words the reviewers asked for', () => {
    expect(timeframe('1967-12-29', '2023-07-01')).toBe('Since December 1967, last amended in July 2023');
    expect(timeframe('1967-12-29', null)).toBe('Since December 1967');
    expect(timeframe(null, null)).toBeNull();
  });

  it('deep-links to the provision', () => {
    // "none of the reference links lead to the right document."
    expect(citationUrl('https://sso.agc.gov.sg/Act/CoA1967', 'pr199-')).toBe(
      'https://sso.agc.gov.sg/Act/CoA1967#pr199-',
    );
    expect(citationUrl('https://x.gov/a', null)).toBe('https://x.gov/a');
  });

  it('quotes before it interprets, and trims the interpretation rather than the quotation', () => {
    // Repeated six times across the graded set. The quotation is the evidence; our sentence is the
    // claim, and a claim shortened past sense beats evidence shortened past checking.
    const long = 'x'.repeat(400);
    const r = mappingRationale(QUOTE, long);
    expect(r.startsWith(`"${QUOTE}"`)).toBe(true);
    expect(r.length).toBeLessThanOrEqual(300);
    expect(quoteLeads(r)).toBe(true);
  });

  it('states confidence from the evidence, not from a feeling', () => {
    expect(confidenceOf({ quote: QUOTE, offsetsResolved: true, extraction: 'html' })).toContain('high');
    expect(confidenceOf({ quote: QUOTE, offsetsResolved: false, extraction: 'html' })).toContain('medium');
    expect(confidenceOf({ quote: QUOTE, offsetsResolved: true, extraction: 'ocr' })).toContain('OCR');
    expect(confidenceOf({ quote: null, offsetsResolved: false, extraction: null })).toBe('no quotation');
  });
});

describe('an official host', () => {
  it('accepts the economy’s own portals and their subdomains', () => {
    const known = new Set(['sso.agc.gov.sg']);
    expect(isOfficialHost('sso.agc.gov.sg', known)).toBe(true);
    expect(isOfficialHost('www.sso.agc.gov.sg', known)).toBe(true);
    expect(isOfficialHost('legislation.gov.au', new Set())).toBe(true);
  });

  it('rejects a summary of the law in place of the law', () => {
    // The failure this exists for: a citation to a law firm's note instead of the statute.
    expect(isOfficialHost('www.somelawfirm.com', new Set(['sso.agc.gov.sg']))).toBe(false);
    expect(isOfficialHost('en.wikipedia.org', new Set())).toBe(false);
  });
});

describe('the gates', () => {
  it('passes a row whose quotation is in the source at the offset it claims', () => {
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    const result = verifyRun(db, 'r1');
    expect(result.rows).toBe(1);
    const failed = result.verdicts[0]!.outcomes.filter((o) => !o.passed);
    expect(failed, `unexpected failures: ${failed.map((f) => `${f.gate}: ${f.detail}`).join('; ')}`).toEqual([]);
    expect(result.held).toBe(0);
    db.close();
  });

  it('holds a row whose quotation is not in the provision it cites', () => {
    // "section 125 did not mention the minimum 7 years period" -- the defect, caught mechanically
    // before a human has to read the Act to find it.
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    db.prepare("UPDATE export_row SET verbatim_snippet = 'must retain those records for not less than 7 years'").run();
    const result = verifyRun(db, 'r1');
    expect(result.held).toBe(1);
    expect(result.byGate['quote-in-source']!.failed).toBe(1);
    db.close();
  });

  it('holds a row that cites a repealed instrument', () => {
    // The MAS Notice cancelled 01 July 2022, cited as if it were law.
    const db = storeWithOneAnswer({ status: 'repealed' });
    buildExportRows(db, 'r1');
    const result = verifyRun(db, 'r1');
    expect(result.byGate['in-force']!.failed).toBe(1);
    db.close();
  });

  it('holds a row marked in force with nothing recorded to evidence it', () => {
    // "unknown" was the status of all 6,365 registered instruments until the register started
    // keeping which listing an instrument came off. A bare claim of currency is not evidence.
    const db = storeWithOneAnswer({ statusBasis: null });
    buildExportRows(db, 'r1');
    const result = verifyRun(db, 'r1');
    expect(result.byGate['in-force']!.failed).toBe(1);
    db.close();
  });

  it('locates each finding of one reading at its own words, not at the first finding’s', () => {
    // The defect: offsets lived on the reading, which holds one quote, while a row is made per
    // finding. Nineteen of fifty-nine rows pointed at a sibling finding's words.
    const db = storeWithOneAnswer();
    const other = 'must keep such accounting records as are necessary';
    db.prepare('UPDATE reading SET attributes = ? WHERE id = 1').run(
      JSON.stringify([
        { indicatorId: '7.3', measure: 'minimum-retention', quote: QUOTE, requirement: 'Five years.', mandatory: true, dutyForce: 'requires' },
        { indicatorId: '7.3', measure: 'minimum-retention', quote: other, requirement: 'Records kept.', mandatory: true, dutyForce: 'requires' },
      ]),
    );
    buildExportRows(db, 'r1');
    const rows = db
      .prepare('SELECT verbatim_snippet q, quote_char_start s, quote_char_end e FROM export_row ORDER BY id')
      .all() as { q: string; s: number; e: number }[];
    for (const r of rows) expect(SECTION_TEXT.slice(r.s, r.e)).toBe(r.q);
    const result = verifyRun(db, 'r1');
    expect(result.byGate['offsets-resolve']!.failed).toBe(0);
    db.close();
  });

  it('locates a quotation whose typography differs from the source’s', () => {
    // The reader returns the provision's words in its own punctuation. An exact indexOf finds
    // nothing, and the row is held for a defect that is not there.
    const db = storeWithOneAnswer();
    db.prepare("UPDATE section SET text = ? WHERE id = 1").run(
      SECTION_TEXT.replace('not less than 5 years', 'not less than  5 years'),
    );
    db.prepare("UPDATE document_text SET text = (SELECT text FROM section WHERE id = 1)").run();
    db.prepare('UPDATE reading SET attributes = ? WHERE id = 1').run(
      JSON.stringify([
        { indicatorId: '7.3', measure: 'minimum-retention', quote: QUOTE, requirement: 'Five years.', mandatory: true, dutyForce: 'requires' },
      ]),
    );
    buildExportRows(db, 'r1');
    const row = db.prepare('SELECT quote_char_start s, quote_char_end e FROM export_row').get() as
      { s: number | null; e: number | null };
    expect(row.s).not.toBeNull();
    const result = verifyRun(db, 'r1');
    expect(result.byGate['offsets-resolve']!.failed).toBe(0);
    db.close();
  });

  it('holds a row that links to the top of the Act when the provision has an anchor', () => {
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    db.prepare("UPDATE export_row SET source_url = 'https://sso.agc.gov.sg/Act/CoA1967'").run();
    const result = verifyRun(db, 'r1');
    expect(result.byGate['pinpoint-citation']!.failed).toBe(1);
    db.close();
  });

  it('holds nothing silently -- every failure is recorded with its reason', () => {
    // The governing rule: nothing is dropped and no pattern is written to make a bad row vanish.
    // A held row is a row a reviewer is asked about.
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    db.prepare("UPDATE export_row SET verbatim_snippet = 'words that are not in the Act'").run();
    verifyRun(db, 'r1');
    const rows = db.prepare('SELECT gate, passed, detail FROM gate_result WHERE passed = 0').all() as {
      gate: string; passed: number; detail: string | null;
    }[];
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.detail, `${r.gate} failed without saying why`).toBeTruthy();
    expect((db.prepare('SELECT COUNT(*) n FROM export_row').get() as { n: number }).n).toBe(1);
    db.close();
  });
});

describe('deriving the score again from the record', () => {
  it('agrees with the run when nothing has drifted', () => {
    // Zone 3 is a pure function of attributes the reader returned, and the attributes are stored.
    // So the score can be derived a second time -- next week, on another machine, with no model
    // running anywhere -- and compared. This is the reproducibility claim, checked rather than
    // asserted, and it is the gate a system that generates its scores cannot run at all.
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    const again = recomputeScores(db, 'r1');
    expect(again.cells).toBe(1);
    expect(again.disagreed, JSON.stringify(again.disagreed)).toEqual([]);
    expect(again.agreed).toBe(1);
    db.close();
  });

  it('catches a score that does not follow from its evidence', () => {
    // This gate found a real defect the first time it ran: a fixture written by hand claimed band
    // 1 while the recorded finding named a measure the rubric does not define, so the rubric put
    // the cell in band 2. A stored score that the stored evidence does not produce is exactly what
    // this is for, whether it got there by a bug, an edited rubric, or a hand.
    const db = storeWithOneAnswer();
    buildExportRows(db, 'r1');
    db.prepare('UPDATE cell_answer SET score = 0, band_ordinal = 2 WHERE cell_id = 1').run();
    const result = verifyRun(db, 'r1');
    expect(result.byGate['score-recomputes']!.failed).toBe(1);
    expect(result.held).toBe(1);
    db.close();
  });
});
