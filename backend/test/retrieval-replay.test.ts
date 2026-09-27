/**
 * A replayed retrieval is the one the run recorded.
 *
 * `--retrieval-from` exists so a reader change can be measured on a benchmark pack, which holds a
 * run's provisions and none of the indexes that found them. If the rebuilt record put different
 * provisions in front of the reader, or the same ones in an order that changes which instrument a
 * zero is cited against, the measurement would be of something other than the reader.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { storedFrameworkCandidates, storedRetrieval } from '../src/retrieve/replay.js';

function seeded() {
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
    `INSERT INTO instrument (id, economy_code, title, kind, status, source_url, discovered_via, discovered_at)
     VALUES (?, 'SGP', ?, 'act', 'in-force', ?, 'portal', ?)`,
  );
  instrument.run(1, 'Personal Data Protection Act 2012', 'https://example.test/pdpa', now);
  instrument.run(2, 'Cybersecurity Act 2018', 'https://example.test/csa', now);
  const document = db.prepare(
    `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
     VALUES (?, ?, ?, 'h', 'text/html', 1, 200, ?)`,
  );
  document.run(10, 1, 'https://example.test/pdpa', now);
  document.run(20, 2, 'https://example.test/csa', now);
  const section = db.prepare(
    `INSERT INTO section (id, document_id, ordinal, heading_path, text, char_start, char_end)
     VALUES (?, ?, ?, ?, ?, 0, 1)`,
  );
  section.run(100, 10, 1, 'PDPA > s 26', 'An organisation shall not transfer personal data outside Singapore');
  section.run(101, 10, 2, 'PDPA > s 24', 'An organisation shall protect personal data');
  section.run(200, 20, 1, 'CSA > s 7', 'The owner of a critical information infrastructure shall');
  db.prepare(
    `INSERT INTO cell (id, run_id, economy_code, indicator_id, state, answered_at, queries, depth, surfaced,
                       sections_indexed, governing, surfaced_instruments)
     VALUES (1, 'r1', 'SGP', '7.1', 'restricted', ?, '["q1","q2"]', 24, 90, 5000, '[2]', ?)`,
  ).run(now, JSON.stringify([
    { instrumentId: 2, instrumentTitle: 'Cybersecurity Act 2018', rank: 1 },
    { instrumentId: 1, instrumentTitle: 'Personal Data Protection Act 2012', rank: 2 },
  ]));
  const entry = db.prepare(
    `INSERT INTO shortlist_entry (cell_id, section_id, channel, query, rank, score) VALUES (1, ?, ?, ?, ?, ?)`,
  );
  entry.run(101, 'dense', 'q1', 7, 0.5);
  entry.run(100, 'lexical', 'q1', 3, 9.1);
  entry.run(100, 'dense', 'q2', 1, 0.9);
  entry.run(200, 'lexical', 'q2', 12, 4.0);
  db.prepare(
    `INSERT INTO framework_reading (cell_id, instrument_id, engine, model, establishes_framework, read_at)
     VALUES (1, ?, 'engine-a', 'm', 1, ?)`,
  ).run(1, now);
  return db;
}

describe('a replayed retrieval', () => {
  it('puts the recorded provisions back, once each, with every query that found them', () => {
    const record = storedRetrieval(seeded(), 'r1', 'SGP', '7.1')!;
    expect(record.sections.map((s) => s.sectionId).sort()).toEqual([100, 101, 200]);
    const s100 = record.sections.find((s) => s.sectionId === 100)!;
    expect(s100.found).toHaveLength(2);
    expect(s100.channels.sort()).toEqual(['dense', 'lexical']);
    expect(s100.rank).toBe(1);
    expect(record.queries).toEqual(['q1', 'q2']);
    expect([record.depth, record.surfaced, record.indexedSections]).toEqual([24, 90, 5000]);
  });

  it('orders them by the instruments the cell surfaced, then by best rank', () => {
    const record = storedRetrieval(seeded(), 'r1', 'SGP', '7.1')!;
    expect(record.sections.map((s) => s.sectionId)).toEqual([200, 100, 101]);
  });

  it('keeps the instruments the register named as governing', () => {
    const record = storedRetrieval(seeded(), 'r1', 'SGP', '7.1')!;
    expect(record.governing).toEqual([{ instrumentId: 2, title: 'Cybersecurity Act 2018', rank: 0, seated: 1 }]);
  });

  it('is null for a cell the run never answered', () => {
    expect(storedRetrieval(seeded(), 'r1', 'SGP', '7.2')).toBeNull();
    expect(storedRetrieval(seeded(), 'other', 'SGP', '7.1')).toBeNull();
  });

  it('offers the instruments the run examined as a framework', () => {
    expect(storedFrameworkCandidates(seeded(), 'r1', 'SGP', '7.1')).toEqual([
      { instrumentId: 1, title: 'Personal Data Protection Act 2012', url: 'https://example.test/pdpa', sectionIds: [] },
    ]);
  });
});
