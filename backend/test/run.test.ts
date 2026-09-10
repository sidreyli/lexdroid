/**
 * The run record.
 *
 * These are balancing tests rather than behaviour tests: they assert that what the pipeline
 * produced and what the store holds are the same thing. Every decision becomes one cell, every
 * provision read becomes a row whether or not it said anything, and every finding the reader threw
 * out becomes a discard with a reason. A run that quietly recorded less than it answered would
 * still look like a finished run, which is the failure worth testing for.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { openRun, recordPillarAnswer, finishRun } from '../src/run/index.js';
import type { PillarAnswer } from '../src/cell/index.js';
import type { Finding, SectionReading } from '../src/read/index.js';
import type { Decision, Evidence } from '../src/decide/index.js';
import type { RetrievalRecord } from '../src/retrieve/index.js';

const PRELUDE = 'COMPANIES ACT 1967\n\n';
const SECTION_TEXT =
  'Every company shall cause to be kept such accounting and other records as will sufficiently ' +
  'explain the transactions and financial position of the company, and shall retain the records ' +
  'for a period of not less than 5 years.';
const QUOTE = 'shall retain the records for a period of not less than 5 years';

/** An economy, one instrument, one document and two provisions of it. */
function fixture() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  db.prepare(
    `INSERT INTO instrument (id, economy_code, title, source_url, discovered_via, discovered_at)
     VALUES (1, 'SGP', 'Companies Act 1967', 'https://sso.agc.gov.sg/Act/CoA1967', 'portal', '2026-09-07')`,
  ).run();
  db.prepare(
    `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
     VALUES (1, 1, 'https://sso.agc.gov.sg/Act/CoA1967', 'hash', 'text/html', 100, 200, '2026-09-07')`,
  ).run();
  db.prepare(
    "INSERT INTO document_text (document_id, text, parser, parsed_at) VALUES (1, ?, 'sso', '2026-09-07')",
  ).run(PRELUDE + SECTION_TEXT);
  db.prepare(
    `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end, anchor)
     VALUES (10, 1, 1, 'Part VI > 199 Accounting records', '199', ?, ?, ?, 'pr199-')`,
  ).run(SECTION_TEXT, PRELUDE.length, PRELUDE.length + SECTION_TEXT.length);
  db.prepare(
    `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end, anchor)
     VALUES (11, 1, 2, 'Part I > 1 Citation', '1', 'This Act is the Companies Act 1967.', 0, 34, 'pr1-')`,
  ).run();
  return db;
}

const finding: Finding = {
  indicatorId: '7.3',
  measure: 'minimum-retention',
  dutyBearer: 'Every company',
  dutyAct: 'shall retain the records',
  dutyForce: 'requires',
  roleWords: null,
  definingWords: 'a period of not less than 5 years',
  borderWords: null,
  imposingWords: 'shall retain the records',
  prescribingWords: null,
  dutyBearerKind: 'organisation',
  scopeUnstated: false,
  placeWords: null,
  exceptionWords: null,
  locatedData: null,
  informationWords: null,
  keepingWords: null,
  authorisingWords: null,
  quote: QUOTE,
  requirement: 'Companies must keep accounting records for at least five years.',
  sectorScope: 'all',
  sector: null,
  dataScope: 'non-personal',
  dataDescription: 'accounting records',
  appliesOnlyToGovernmentData: false,
  mandatory: true,
  countriesNamed: [],
  statedPeriod: '5 years',
  authorisation: 'unstated',
};

const fabricated: Finding = { ...finding, indicatorId: '7.4', measure: 'data-protection-officer', quote: 'a sentence that is not in the provision' };

const evidence: Evidence = {
  finding,
  sectionId: 10,
  instrumentId: 1,
  instrumentTitle: 'Companies Act 1967',
  amendsAnotherAct: false,
  headingPath: 'Part VI > 199 Accounting records',
  citation: 'https://sso.agc.gov.sg/Act/CoA1967#pr199-',
};

const readings: SectionReading[] = [
  {
    sectionId: 10,
    pillarId: 7,
    findings: [finding],
    rejected: [{ finding: fabricated, reason: 'the quoted words are not in the provision' }],
    failure: null,
    model: 'gemma4-lex-16k',
    promptTokens: 900,
    completionTokens: 120,
    durationMs: 5200,
    fromCache: false,
  },
  {
    // Read, and it said nothing. This row is the whole evidence base for a cell scoring zero.
    sectionId: 11,
    pillarId: 7,
    findings: [],
    rejected: [],
    failure: null,
    model: 'gemma4-lex-16k',
    promptTokens: 700,
    completionTokens: 20,
    durationMs: 1100,
    fromCache: false,
  },
];

function retrieval(indicatorId: string): RetrievalRecord {
  return {
    indicatorId,
    economy: 'SGP',
    queries: ['a duty to keep records or data for at least some period'],
    depth: 24,
    surfaced: 412,
    indexedSections: 6143,
    governing: [],
    perQueryDepth: 40,
    sections: [
      {
        sectionId: 10,
        documentId: 1,
        instrumentId: 1,
        instrumentTitle: 'Companies Act 1967',
        headingPath: 'Part VI > 199 Accounting records',
        text: SECTION_TEXT,
        anchor: 'pr199-',
        rank: 1,
        channels: ['dense', 'lexical'],
        found: [
          { channel: 'dense', query: 'a duty to keep records or data for at least some period', rank: 9, score: 0.71 },
          { channel: 'lexical', query: 'a duty to keep records or data for at least some period', rank: 22, score: 3.4 },
        ],
      },
    ],
  };
}

function decision(indicatorId: string, score: number, basis: Evidence[]): Decision {
  return {
    indicatorId,
    economy: 'SGP',
    state: score > 0 ? 'restricted' : 'no-restriction',
    score,
    band: { score, criterion: score > 0 ? 'Minimum period requirement' : 'No requirement', ordinal: score > 0 ? 1 : 2 },
    basis,
    excluded: [],
    held: [{ evidence, reason: 'the provision does not state a period' }],
    frameworkBasis: [],
    absence:
      score > 0
        ? null
        : { instrumentId: 1, instrumentTitle: 'Companies Act 1967', basis: 'governing', pillarFindings: 1 },
    coverage: { sectionsRead: 2, sectionsIndexed: 6143, instrumentsConsidered: 1 },
    decidingFact: score > 0 ? 'a floor on how long records must be kept' : 'no such requirement was found',
    rationale: 'Scored from the band text and the evidence.',
  };
}

function answer(): PillarAnswer {
  return {
    economy: 'SGP',
    pillarId: 7,
    decisions: [decision('7.3', 1, [evidence]), decision('7.5', 0, [])],
    retrieval: [retrieval('7.3'), retrieval('7.5')],
    readings,
    frameworkReadings: [],
    rejectedFindings: 1,
    rejectedQuotes: 1,
    model: 'gemma4-lex-16k',
    durationMs: 9000,
    engineMs: 6300,
    cachedCalls: 0,
    stages: [
      { stage: 'retrieve', seconds: 1.5, items: 2 },
      { stage: 'read', seconds: 6.3, items: 2 },
      { stage: 'framework', seconds: 0, items: 0 },
      { stage: 'decide', seconds: 0.2, items: 2 },
    ],
  };
}

function record() {
  const db = fixture();
  const run = openRun(db, { economies: ['SGP'], pillars: [7], model: 'gemma4-lex-16k' });
  recordPillarAnswer(run, answer());
  finishRun(run);
  return { db, run };
}

describe('a recorded run', () => {
  it('writes one cell and one answer for every decision', () => {
    const { db } = record();
    expect((db.prepare('SELECT COUNT(*) c FROM cell').get() as { c: number }).c).toBe(2);
    expect((db.prepare('SELECT COUNT(*) c FROM cell_answer').get() as { c: number }).c).toBe(2);

    const row = db
      .prepare(
        `SELECT c.indicator_id, c.state, c.depth, c.surfaced, c.sections_indexed, c.sections_read,
                a.score, a.band_ordinal, a.deciding_fact, a.controlling_instrument_id
           FROM cell c JOIN cell_answer a ON a.cell_id = c.id WHERE c.indicator_id = '7.3'`,
      )
      .get() as Record<string, unknown>;
    expect(row['state']).toBe('restricted');
    expect(row['score']).toBe(1);
    expect(row['sections_indexed']).toBe(6143);
    expect(row['sections_read']).toBe(2);
    expect(row['controlling_instrument_id']).toBe(1);
    expect(String(row['deciding_fact'])).toContain('floor');
    db.close();
  });

  it('records the provision that said nothing, because that is what a zero rests on', () => {
    const { db } = record();
    const rows = db
      .prepare(
        `SELECT r.section_id, r.applies FROM reading r JOIN cell c ON c.id = r.cell_id
          WHERE c.indicator_id = '7.3' ORDER BY r.section_id`,
      )
      .all() as { section_id: number; applies: number }[];
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.section_id === 11)?.applies).toBe(0);
    expect(rows.find((r) => r.section_id === 10)?.applies).toBe(1);
    db.close();
  });

  it('keeps the question that found each provision, not just its place in the list', () => {
    const { db } = record();
    const rows = db
      .prepare(
        `SELECT s.channel, s.query, s.rank FROM shortlist_entry s JOIN cell c ON c.id = s.cell_id
          WHERE c.indicator_id = '7.3' ORDER BY s.rank`,
      )
      .all() as { channel: string; query: string; rank: number }[];
    expect(rows.map((r) => r.channel)).toEqual(['dense', 'lexical']);
    expect(rows[0]?.rank).toBe(9);
    expect(rows[0]?.query).toContain('at least some period');
    db.close();
  });

  it('turns a fabricated quote into a discard rather than an absence', () => {
    const { db } = record();
    const rows = db.prepare("SELECT stage, reason FROM discard WHERE stage = 'read'").all() as {
      stage: string;
      reason: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toContain('not in the provision');

    // Held evidence is a discard too, once per cell that held it.
    const held = db.prepare("SELECT COUNT(*) c FROM discard WHERE stage = 'decide'").get() as { c: number };
    expect(held.c).toBe(2);
    db.close();
  });

  it('records the quote where the verifier can read it back out of the document', () => {
    const { db } = record();
    const row = db
      .prepare(
        `SELECT r.quote, r.quote_char_start, r.quote_char_end FROM reading r
           JOIN cell c ON c.id = r.cell_id WHERE c.indicator_id = '7.3' AND r.section_id = 10`,
      )
      .get() as { quote: string; quote_char_start: number; quote_char_end: number };
    const text = (db.prepare('SELECT text FROM document_text WHERE document_id = 1').get() as { text: string }).text;
    expect(text.slice(row.quote_char_start, row.quote_char_end)).toBe(row.quote);
    expect(row.quote).toBe(QUOTE);
    db.close();
  });

  it('counts each engine call once, though its answer lands in several cells', () => {
    const { db } = record();
    // Two provisions read against a two-indicator pillar: four reading rows, two calls.
    expect((db.prepare('SELECT COUNT(*) c FROM reading').get() as { c: number }).c).toBe(4);
    const distinct = db.prepare('SELECT COUNT(DISTINCT engine_call) c FROM reading').get() as { c: number };
    expect(distinct.c).toBe(2);

    const cost = db.prepare('SELECT calls, prompt_tokens, wall_seconds FROM run_cost').get() as {
      calls: number;
      prompt_tokens: number;
      wall_seconds: number;
    };
    expect(cost.calls).toBe(2);
    expect(cost.prompt_tokens).toBe(1600);
    expect(cost.wall_seconds).toBeCloseTo(6.3);
    db.close();
  });

  it('says which code answered, and closes the run', () => {
    const { db, run } = record();
    const row = db.prepare('SELECT status, finished_at, code_revision, pillars FROM run WHERE id = ?').get(run.id) as {
      status: string;
      finished_at: string | null;
      code_revision: string;
      pillars: string;
    };
    expect(row.status).toBe('complete');
    expect(row.finished_at).toBeTruthy();
    expect(row.code_revision.length).toBeGreaterThan(0);
    expect(JSON.parse(row.pillars)).toEqual([7]);
    db.close();
  });

  // A run that cannot say where its time went cannot be used to decide whether a wider run is
  // affordable, which is the only question the number is for.
  it('says where the time went, stage by stage, and what each stage bought', () => {
    const { db, run } = record();
    const rows = db
      .prepare('SELECT stage, seconds, items, economy_code, pillar_id FROM run_stage WHERE run_id = ? ORDER BY stage')
      .all(run.id) as { stage: string; seconds: number; items: number | null; economy_code: string; pillar_id: number }[];

    expect(rows.map((r) => r.stage)).toEqual(['decide', 'framework', 'read', 'retrieve']);
    const read = rows.find((r) => r.stage === 'read')!;
    expect(read.seconds).toBeCloseTo(6.3);
    expect(read.items).toBe(2);
    expect(read.economy_code).toBe('SGP');
    expect(read.pillar_id).toBe(7);
    db.close();
  });
});
