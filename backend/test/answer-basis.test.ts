/**
 * What the answer stood on, and what a cell state means.
 *
 * The defect this exists for: the twelve-pillar run exported 4,298 rows out of the 895 findings
 * the decision had actually counted. Zone 3 set the other 4,310 aside with a reason -- a sentence
 * that declares rather than obliges, a power to make a rule rather than the rule -- and the export
 * went back to the readings and published them all as measures anyway.
 *
 * Underneath it is a confusion between a score and a finding. A band chosen because nothing was
 * there is not a measure found, whatever it scores, and fourteen indicators score their maximum
 * for exactly that.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type FrameworkEvidence, type SurfacedInstrument } from '../src/decide/index.js';
import { buildExportRows } from '../src/export/index.js';
import type { Indicator } from '../src/rubric/types.js';

const deMinimis: Indicator = {
  id: '12.5',
  pillarId: 12,
  pillarName: 'Online Sales and Transactions',
  category: 'Low De Minimis',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'No De Minimis', ordinal: 1 },
    { score: 0.5, criterion: 'De Minimis below 200 USD', ordinal: 2 },
    { score: 0, criterion: 'De Minimis at or above 200 USD', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

const dataProtection: Indicator = {
  id: '7.1',
  pillarId: 7,
  pillarName: 'Domestic Data Protection & Privacy',
  category: 'Lack of comprehensive legal framework for data protection',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'No data protection legal framework', ordinal: 1 },
    { score: 0.5, criterion: 'Data protection legal framework only to specific sectors', ordinal: 2 },
    { score: 0, criterion: 'Comprehensive data protection framework', ordinal: 3 },
  ],
  shape: 'framework',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

/** A customs provision that says duty is payable, and states no threshold. */
const customs: Evidence = {
  finding: {
    indicatorId: '12.5', measure: 'de-minimis-threshold', quote: 'duty is payable on imported goods',
    dutyBearer: 'an importer', dutyAct: 'must pay', dutyForce: 'requires',
    requirement: 'Duty is payable.', sectorScope: 'all', sector: null, dataScope: 'none',
    dataDescription: null, appliesOnlyToGovernmentData: false, mandatory: true,
    countriesNamed: [], statedPeriod: null, authorisation: 'unstated',
  } as unknown as Evidence['finding'],
  sectionId: 5,
  instrumentId: 3,
  instrumentTitle: 'Customs Act 1901',
  headingPath: 'Part V > 132 Duty payable',
  citation: 'https://legislation.gov.au/C1901A00006#s132',
  amendsAnotherAct: false,
  // Read twice and ruled not to state a threshold. That ruling is what entitles the band to say
  // the threshold is missing, rather than saying it about a question nobody was asked.
  confirmed: false,
};

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 3, instrumentTitle: 'Customs Act 1901', rank: 1 },
];

describe('a band chosen because nothing was there', () => {
  it('is a cell that found no measure, even though it scores the maximum', () => {
    // Australia's de minimis cell. "No De Minimis" scores 1, and the run recorded that as
    // 'restricted' -- a measure found -- so the export went looking for a provision to cite,
    // found none, and left the only cell in 183 with no row at all.
    const d = decide({
      indicator: deMinimis,
      economy: 'AUS',
      evidence: [customs],
      surfaced,
      governing: [3],
      coverage: { sectionsRead: 40, sectionsIndexed: 9000, instrumentsConsidered: 4 },
    });
    expect(d.score).toBe(1);
    expect(d.state).toBe('no-restriction');
    expect(d.basis).toEqual([]);
    // And it names what it was read against, which is what the row will cite.
    expect(d.absence?.instrumentTitle).toBe('Customs Act 1901');
  });
});

describe('a framework indicator', () => {
  it('calls the cell restricted when the framework is there, though it scores zero', () => {
    // 7.1 runs the other way: a comprehensive framework scores 0. The framework is still the
    // measure, and the row cites the Act -- ESCAP's own Singapore row cites the PDPA.
    const framework: FrameworkEvidence = {
      instrumentId: 1, instrumentTitle: 'Personal Data Protection Act 2012',
      citation: 'https://sso.agc.gov.sg/Act/PDPA2012', establishesFramework: true,
      horizontal: true, dedicated: true, dedicatedShown: true, sectoralShown: false,
      sector: null, quote: 'An Act to govern the collection, use and disclosure of personal data',
    };
    const d = decide({
      indicator: dataProtection,
      economy: 'SGP',
      evidence: [],
      frameworkEvidence: [framework],
      surfaced: [],
      coverage: { sectionsRead: 0, sectionsIndexed: 6143, instrumentsConsidered: 5 },
    });
    expect(d.score).toBe(0);
    expect(d.state).toBe('restricted');
    expect(d.frameworkBasis.map((f) => f.instrumentTitle)).toEqual(['Personal Data Protection Act 2012']);
  });

  it('cites one instrument and names the rest in the notes', () => {
    // "better not to compile the links... add one official link for one document." A framework
    // published across an Act and four regulations is one framework, not five rows.
    const db = frameworkStore();
    const built = buildExportRows(db, 'r1');
    expect(built.rows).toBe(1);
    const row = db.prepare('SELECT law_name, source_url, notes FROM export_row').get() as {
      law_name: string; source_url: string; notes: string;
    };
    expect(row.law_name).toBe('Personal Data Protection Act 2012');
    expect(row.notes).toContain('Also carried by: Personal Data Protection Regulations 2021');
    db.close();
  });
});

/** A run whose only cell is 7.1, answered by an Act with one regulation beside it. */
function frameworkStore(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(new URL('../src/db/schema.sql', import.meta.url), 'utf8'));
  const now = new Date().toISOString();
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1', ?, '["SGP"]', '[7]', 'engine-a', 'm', 'cache-only', 'abc', ?, 'complete')`,
  ).run(now, now);
  const instrument = db.prepare(
    `INSERT INTO instrument (id, economy_code, title, kind, status, status_basis, source_url,
                             official_number, commenced_on, last_amended_on, timeframe_basis,
                             language, discovered_via, discovered_at)
     VALUES (?,'SGP',?,'act','in-force','listed',?,?,'2012-10-15','2021-02-01','stated','en','portal',?)`,
  );
  instrument.run(1, 'Personal Data Protection Act 2012', 'https://sso.agc.gov.sg/Act/PDPA2012', 'Act 26 of 2012', now);
  instrument.run(2, 'Personal Data Protection Regulations 2021', 'https://sso.agc.gov.sg/SL/PDPR2021', 'S 63/2021', now);
  db.prepare(
    `INSERT INTO cell (id, run_id, economy_code, indicator_id, state, answered_at, sections_read)
     VALUES (1,'r1','SGP','7.1','restricted',?,0)`,
  ).run(now);
  db.prepare(
    `INSERT INTO cell_answer (cell_id, score, band_ordinal, band_criterion, deciding_fact,
                              controlling_instrument_id, rationale, computed_at)
     VALUES (1, 0, 3, 'Comprehensive data protection framework', 'a framework applying across sectors', 1, 'x', ?)`,
  ).run(now);
  const framework = db.prepare(
    `INSERT INTO framework_reading (cell_id, instrument_id, engine, model, establishes_framework,
                                    horizontal, dedicated, dedicated_shown, sectoral_shown, sector,
                                    quote, quote_verified, read_at)
     VALUES (1, ?, 'engine-a', 'm', 1, 1, 1, 1, 0, NULL, ?, 1, ?)`,
  );
  framework.run(1, 'An Act to govern the collection, use and disclosure of personal data', now);
  framework.run(2, 'Personal Data Protection Regulations 2021', now);
  db.prepare(
    `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure)
     VALUES (1, 1, 1, NULL, NULL)`,
  ).run();
  return db;
}
