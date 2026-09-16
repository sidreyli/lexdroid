/**
 * A zero has to be reproducible from the record that evidences it.
 *
 * Three things were missing and each made a cell unable to say how it reached its own answer. The
 * search that surfaced the Act a zero is cited against was kept only as a count, so the record
 * could name no instrument. A framework cell saying "none of the five instruments examined
 * establishes such a framework" wrote no row for any of the five, because only instruments that
 * became a basis were stored and a cell that found nothing has no basis. And whether the absent
 * thing was absent from an instrument that governs the subject, or merely from one the search
 * returned, was never written down -- though it is the difference between a finding and a silence.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { openRun, recordPillarAnswer } from '../src/run/index.js';
import type { PillarAnswer } from '../src/cell/index.js';
import type { SectionReading } from '../src/read/index.js';
import type { Decision, FrameworkEvidence } from '../src/decide/index.js';
import type { RetrievalRecord } from '../src/retrieve/index.js';

function fixture() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  for (const [id, title] of [
    [1, 'Copyright Act 2021'],
    [2, 'Electronic Transactions Act 2010'],
  ] as [number, string][]) {
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, source_url, discovered_via, discovered_at, last_amended_on)
       VALUES (?, 'SGP', ?, ?, 'portal', '2026-09-13', '2024-01-01')`,
    ).run(id, title, `https://sso.agc.gov.sg/Act/${id}`);
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (?, ?, ?, 'hash', 'text/html', 100, 200, '2026-09-13')`,
    ).run(id, id, `https://sso.agc.gov.sg/Act/${id}`);
    db.prepare(
      `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end, anchor)
       VALUES (?, ?, 1, '1 A provision', '1', 'A provision of this Act.', 0, 24, 'p1')`,
    ).run(id * 10, id);
  }
  return db;
}

const examined: FrameworkEvidence[] = [1, 2].map((id) => ({
  instrumentId: id,
  instrumentTitle: id === 1 ? 'Copyright Act 2021' : 'Electronic Transactions Act 2010',
  citation: `https://sso.agc.gov.sg/Act/${id}`,
  establishesFramework: false,
  horizontal: false,
  dedicated: false,
  dedicatedShown: false,
  sectoralShown: false,
  sector: null,
  quote: 'An Act relating to something else.',
}));

function retrieval(): RetrievalRecord {
  return {
    indicatorId: '8.1',
    economy: 'SGP',
    queries: ['a safe harbour for copyright infringement'],
    depth: 24,
    surfaced: 2,
    indexedSections: 2,
    governing: [],
    perQueryDepth: 40,
    sections: [1, 2].map((id) => ({
      sectionId: id * 10,
      documentId: id,
      instrumentId: id,
      instrumentTitle: id === 1 ? 'Copyright Act 2021' : 'Electronic Transactions Act 2010',
      headingPath: '1 A provision',
      text: 'A provision of this Act.',
      anchor: 'p1',
      rank: id,
      channels: ['dense'],
      found: [{ channel: 'dense', query: 'a safe harbour for copyright infringement', rank: id, score: 0.7 }],
    })),
  };
}

/** A framework cell that examined two instruments and established none: the shape that lost its record. */
const decision: Decision = {
  indicatorId: '8.1',
  economy: 'SGP',
  state: 'no-restriction',
  score: 1,
  band: { score: 1, criterion: 'No safe harbour', ordinal: 1 },
  basis: [],
  excluded: [],
  held: [],
  frameworkBasis: [],
  absence: {
    instrumentId: 1,
    instrumentTitle: 'Copyright Act 2021',
    basis: 'governing',
    pillarFindings: 2,
    currentTo: '2024-01-01',
  },
  coverage: { sectionsRead: 2, sectionsIndexed: 2, instrumentsConsidered: 2 },
  decidingFact: 'none of the 2 instrument(s) examined establishes such a framework',
  rationale: 'Scored from the band text and the instruments examined.',
};

function reading(sectionId: number): SectionReading {
  return {
    sectionId,
    pillarId: 8,
    findings: [],
    rejected: [],
    failure: null,
    model: 'gemma4-lex-16k',
    promptTokens: 100,
    completionTokens: 10,
    durationMs: 500,
    fromCache: false,
    fromResume: false,
  };
}

function answer(): PillarAnswer {
  return {
    economy: 'SGP',
    pillarId: 8,
    model: 'gemma4-lex-16k',
    readings: [reading(10), reading(20)],
    frameworkReadings: [],
    frameworkExamined: { '8.1': examined },
    retrieval: [retrieval()],
    decisions: [decision],
    rejectedFindings: 0,
    rejectedQuotes: 0,
    durationMs: 1000,
    engineMs: 500,
    cachedCalls: 0,
    resumedCalls: 0,
  carriedCalls: 0,
    stages: [],
  };
}

describe('the record behind a zero', () => {
  it('names the instruments the search surfaced, not only how many', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [8], model: 'gemma4-lex-16k' });
    recordPillarAnswer(run, answer());

    const cell = db.prepare('SELECT surfaced, surfaced_instruments FROM cell WHERE run_id = ?').get(run.id) as {
      surfaced: number;
      surfaced_instruments: string;
    };
    expect(cell.surfaced).toBe(2);
    expect(JSON.parse(cell.surfaced_instruments)).toEqual([
      { instrumentId: 1, instrumentTitle: 'Copyright Act 2021', rank: 1, currentTo: '2024-01-01' },
      { instrumentId: 2, instrumentTitle: 'Electronic Transactions Act 2010', rank: 2, currentTo: '2024-01-01' },
    ]);
  });

  it('keeps a row for every instrument examined, including the ones that established nothing', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [8], model: 'gemma4-lex-16k' });
    recordPillarAnswer(run, answer());

    const rows = db
      .prepare(
        `SELECT f.instrument_id, f.establishes_framework FROM framework_reading f
           JOIN cell c ON c.id = f.cell_id WHERE c.run_id = ? ORDER BY f.instrument_id`,
      )
      .all(run.id) as { instrument_id: number; establishes_framework: number }[];
    expect(rows).toEqual([
      { instrument_id: 1, establishes_framework: 0 },
      { instrument_id: 2, establishes_framework: 0 },
    ]);
  });

  it('says whether the zero stands on a governing instrument or only a surfaced one', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [8], model: 'gemma4-lex-16k' });
    recordPillarAnswer(run, answer());

    const stored = db
      .prepare('SELECT a.absence_basis FROM cell_answer a JOIN cell c ON c.id = a.cell_id WHERE c.run_id = ?')
      .get(run.id) as { absence_basis: string };
    expect(stored.absence_basis).toBe('governing');
  });
});
