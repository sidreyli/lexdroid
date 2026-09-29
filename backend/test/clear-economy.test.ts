/**
 * Clearing an economy before the live hour takes it out of the store whole, and nothing else.
 *
 * A warm corpus is never downloaded again, so a live run over one lists no documents and scores
 * zero on discovery. The clear has to leave the economy as if it had never been fetched -- register,
 * documents, provisions, the lexical index, every run over it -- and leave the other economies and
 * the runs that covered them as they were.
 */
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { indexSections, openDb } from '../src/db/index.js';
import { clearEconomies, clearPlan } from '../src/run/clear.js';

function fixture() {
  const db = openDb(':memory:');
  const ins = (sql: string, ...args: unknown[]) => db.prepare(sql).run(...args);
  for (const [code, name] of [
    ['LAO', 'Lao PDR'],
    ['SGP', 'Singapore'],
  ]) {
    ins('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)', code, name, '["en"]');
  }
  for (const [id, code] of [
    [1, 'LAO'],
    [2, 'SGP'],
  ] as const) {
    ins(
      `INSERT INTO instrument (id, economy_code, title, source_url, discovered_via, discovered_at)
       VALUES (?, ?, 'An Act', ?, 'portal', '2026-09-29')`,
      id,
      code,
      `https://example.gov/${id}`,
    );
    ins(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (?, ?, ?, 'hash', 'text/html', 100, 200, '2026-09-29')`,
      id,
      id,
      `https://example.gov/${id}`,
    );
    ins(
      `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end, anchor)
       VALUES (?, ?, 1, 'Article 1', '1', 'An intermediary is not liable.', 0, 30, 'a1')`,
      id * 10,
      id,
    );
    indexSections(db, id);
  }
  for (const [run, economies] of [
    ['r-lao', '["LAO"]'],
    ['r-both', '["LAO","SGP"]'],
    ['r-sgp', '["SGP"]'],
  ]) {
    ins(
      `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode, code_revision, rubric_derived_at, status)
       VALUES (?, '2026-09-29', ?, '[8]', 'engine-a', 'm', 'fetch', 'x', 'x', 'complete')`,
      run,
      economies,
    );
  }
  let cell = 0;
  for (const [run, code, instrument] of [
    ['r-lao', 'LAO', 1],
    ['r-both', 'LAO', 1],
    ['r-both', 'SGP', 2],
    ['r-sgp', 'SGP', 2],
  ] as const) {
    cell += 1;
    ins("INSERT INTO cell (id, run_id, economy_code, indicator_id, state) VALUES (?, ?, ?, '8.2', 'restricted')", cell, run, code);
    ins("INSERT INTO cell_answer (cell_id, score, controlling_instrument_id, computed_at) VALUES (?, 1, ?, 'x')", cell, instrument);
    ins('INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id) VALUES (?, 0, ?, ?)', cell, instrument, instrument * 10);
    ins(
      `INSERT INTO reading (id, cell_id, section_id, engine, model, applies, read_at) VALUES (?, ?, ?, 'engine-a', 'm', 1, 'x')`,
      cell,
      cell,
      instrument * 10,
    );
    ins(
      `INSERT INTO export_row (id, cell_id, economy, law_name, indicator_id, section_id, reading_id, created_at)
       VALUES (?, ?, ?, 'An Act', '8.2', ?, ?, 'x')`,
      cell,
      cell,
      code,
      instrument * 10,
      cell,
    );
  }
  return db;
}

function cacheWithFiles(): string {
  const dir = mkdtempSync(join(tmpdir(), 'lexdroid-clear-'));
  mkdirSync(join(dir, 'blob'), { recursive: true });
  mkdirSync(join(dir, 'url'), { recursive: true });
  writeFileSync(join(dir, 'blob', 'a'), 'bytes');
  writeFileSync(join(dir, 'url', 'b'), '{}');
  return dir;
}

const count = (db: ReturnType<typeof openDb>, sql: string) => (db.prepare(sql).get() as { n: number }).n;

describe('clearing an economy before the live hour', () => {
  it('takes the economy out whole and empties the download cache', () => {
    const db = fixture();
    const cache = cacheWithFiles();

    const done = clearEconomies(db, ['lao'], cache);

    expect(done).toMatchObject({ economies: ['LAO'], runs: 1, cells: 2, instruments: 1, documents: 1, sections: 1, cacheFiles: 2 });
    expect(count(db, "SELECT COUNT(*) AS n FROM instrument WHERE economy_code = 'LAO'")).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS n FROM section WHERE id = 10')).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM section_fts WHERE section_fts MATCH 'intermediary'")).toBe(1);
    expect(count(db, "SELECT COUNT(*) AS n FROM cell WHERE economy_code = 'LAO'")).toBe(0);
    expect(count(db, "SELECT COUNT(*) AS n FROM run WHERE id = 'r-lao'")).toBe(0);
    expect(readdirSync(join(cache, 'blob'))).toEqual([]);
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('leaves the other economies, and the runs that covered them, as they were', () => {
    const db = fixture();
    clearEconomies(db, ['LAO'], cacheWithFiles());

    expect(count(db, "SELECT COUNT(*) AS n FROM run WHERE id IN ('r-both', 'r-sgp')")).toBe(2);
    expect(count(db, "SELECT COUNT(*) AS n FROM cell WHERE economy_code = 'SGP'")).toBe(2);
    expect(count(db, 'SELECT COUNT(*) AS n FROM export_row WHERE section_id = 20')).toBe(2);
    expect(count(db, 'SELECT COUNT(*) AS n FROM section WHERE id = 20')).toBe(1);
  });

  it('says what it would take without taking it', () => {
    const db = fixture();
    const cache = cacheWithFiles();
    expect(clearPlan(db, ['LAO'], cache)).toMatchObject({ runs: 1, cells: 2, documents: 1, cacheFiles: 2 });
    expect(count(db, "SELECT COUNT(*) AS n FROM instrument WHERE economy_code = 'LAO'")).toBe(1);
    expect(readdirSync(join(cache, 'blob'))).toEqual(['a']);
  });
});
