/**
 * A cell holds one economy's provisions and nobody else's.
 *
 * The defect this exists for: in the twelve-pillar run, units answering different economies ran
 * at once against one database and one unit's readings landed on another's cell -- 5,446
 * provisions of the wrong economy, fourteen cells, and Singapore Acts cited as Australian law.
 * Nothing in the schema or the writer noticed, because a reading names a section and a cell and
 * no rule said the two had to belong together.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { openRun, recordPillarAnswer } from '../src/run/index.js';
import type { PillarAnswer } from '../src/cell/index.js';
import type { SectionReading } from '../src/read/index.js';
import type { Decision } from '../src/decide/index.js';
import type { RetrievalRecord } from '../src/retrieve/index.js';

/** Two economies, one instrument and one provision each. */
function fixture() {
  const db = openDb(':memory:');
  for (const [code, name] of [
    ['SGP', 'Singapore'],
    ['AUS', 'Australia'],
  ]) {
    db.prepare('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)').run(code, name, '["en"]');
  }
  const rows: [number, string, string][] = [
    [1, 'SGP', 'Payment Services Act 2019'],
    [2, 'AUS', 'Competition and Consumer Act 2010'],
  ];
  for (const [id, economy, title] of rows) {
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, source_url, discovered_via, discovered_at)
       VALUES (?, ?, ?, ?, 'portal', '2026-09-13')`,
    ).run(id, economy, title, `https://example.gov/${id}`);
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (?, ?, ?, 'hash', 'text/html', 100, 200, '2026-09-13')`,
    ).run(id, id, `https://example.gov/${id}`);
    db.prepare(
      `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end, anchor)
       VALUES (?, ?, 1, '1 A provision', '1', 'A provision of this Act.', 0, 24, 'p1')`,
    ).run(id * 10, id);
  }
  return db;
}

function reading(sectionId: number): SectionReading {
  return {
    sectionId,
    pillarId: 12,
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

function retrieval(indicatorId: string, economy: string): RetrievalRecord {
  return {
    indicatorId,
    economy,
    queries: ['a licence to sell online'],
    depth: 24,
    surfaced: 2,
    indexedSections: 2,
    governing: [],
    perQueryDepth: 40,
    sections: [],
  };
}

function decision(indicatorId: string, economy: string): Decision {
  return {
    indicatorId,
    economy,
    state: 'no-restriction',
    score: 0,
    band: { score: 0, criterion: 'No license', ordinal: 2 },
    basis: [],
    excluded: [],
    held: [],
    frameworkBasis: [],
    absence: null,
    coverage: { sectionsRead: 2, sectionsIndexed: 2, instrumentsConsidered: 1 },
    decidingFact: 'no licence to sell online was found',
    rationale: 'Scored from the band text and the evidence.',
  };
}

/** An Australian pillar, handed one of its own provisions and one of Singapore's. */
function answer(): PillarAnswer {
  return {
    economy: 'AUS',
    pillarId: 12,
    model: 'gemma4-lex-16k',
    readings: [reading(20), reading(10)],
    frameworkReadings: [],
    frameworkExamined: {},
    retrieval: [retrieval('12.3', 'AUS')],
    decisions: [decision('12.3', 'AUS')],
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

describe('a cell records only its own economy', () => {
  it('refuses a provision from another economy and says why', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['AUS'], pillars: [12], model: 'gemma4-lex-16k' });
    recordPillarAnswer(run, answer());

    const foreign = db
      .prepare(
        `SELECT COUNT(*) AS n FROM reading r
           JOIN cell c ON c.id = r.cell_id
           JOIN section s ON s.id = r.section_id
           JOIN document d ON d.id = s.document_id
           JOIN instrument i ON i.id = d.instrument_id
          WHERE c.run_id = ? AND i.economy_code <> c.economy_code`,
      )
      .get(run.id) as { n: number };
    expect(foreign.n).toBe(0);

    const kept = db.prepare('SELECT COUNT(*) AS n FROM reading').get() as { n: number };
    expect(kept.n).toBe(1);

    // Set aside with a reason, never dropped in silence.
    const discard = db
      .prepare("SELECT reason FROM discard WHERE run_id = ? AND subject LIKE '%section 10'")
      .get(run.id) as { reason: string } | undefined;
    expect(discard?.reason).toBe("the provision is not in AUS's corpus");
  });

  it('cites nothing from another economy, in any of the three child records', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['AUS'], pillars: [12], model: 'gemma4-lex-16k' });
    const withBasis = answer();
    withBasis.retrieval[0]!.sections = [
      {
        sectionId: 10,
        documentId: 1,
        instrumentId: 1,
        instrumentTitle: 'Payment Services Act 2019',
        headingPath: '1 A provision',
        text: 'A provision of this Act.',
        anchor: 'p1',
        rank: 1,
        channels: ['dense'],
        found: [{ channel: 'dense', query: 'a licence to sell online', rank: 1, score: 0.8 }],
      },
    ];
    recordPillarAnswer(run, withBasis);

    for (const table of ['reading', 'shortlist_entry', 'answer_basis']) {
      const foreign = db
        .prepare(
          `SELECT COUNT(*) AS n FROM ${table} t
             JOIN cell c ON c.id = t.cell_id
             JOIN section s ON s.id = t.section_id
             JOIN document d ON d.id = s.document_id
             JOIN instrument i ON i.id = d.instrument_id
            WHERE c.run_id = ? AND i.economy_code <> c.economy_code`,
        )
        .get(run.id) as { n: number };
      expect(`${table}: ${foreign.n}`).toBe(`${table}: 0`);
    }
  });
});
