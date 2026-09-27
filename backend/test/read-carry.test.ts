/**
 * What a carried reading has to be, and what it must never hide.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { carriedReadings } from '../src/read/carry.js';
import type { Db } from '../src/db/index.js';

const PRIOR = 'prior-run';

function seed(): Db {
  const db = new Database(':memory:') as Db;
  db.exec(`
    CREATE TABLE cell (id INTEGER PRIMARY KEY, run_id TEXT, economy_code TEXT, indicator_id TEXT);
    CREATE TABLE reading (
      id INTEGER PRIMARY KEY, cell_id INTEGER, section_id INTEGER, engine TEXT, model TEXT,
      applies INTEGER, quote TEXT, attributes TEXT, unreadable INTEGER
    );
  `);
  const cell = db.prepare('INSERT INTO cell (id, run_id, economy_code, indicator_id) VALUES (?, ?, ?, ?)');
  cell.run(1, PRIOR, 'AUS', '6.1');
  cell.run(2, PRIOR, 'AUS', '6.2');
  cell.run(3, 'other-run', 'AUS', '6.1');
  return db;
}

const finding = (indicatorId: string, measure: string, quote: string) =>
  JSON.stringify([{ indicatorId, measure, quote }]);

function put(db: Db, cellId: number, sectionId: number, attributes: string, model = 'gemma4-lex-16k'): void {
  db.prepare(
    'INSERT INTO reading (cell_id, section_id, engine, model, applies, quote, attributes) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(cellId, sectionId, 'ollama', model, 1, null, attributes);
}

describe('readings carried from an earlier run', () => {
  let db: Db;
  beforeEach(() => {
    db = seed();
  });

  it('gathers one call back up from the rows the pillar filed it under', () => {
    // One call reads a provision against the whole pillar and is stored once per cell, each row
    // holding only that cell's findings. The call's own answer is their union.
    put(db, 1, 500, finding('6.1', 'ban on transfer', 'shall not transfer'));
    put(db, 2, 500, finding('6.2', 'local storage', 'kept in Australia'));
    const carried = carriedReadings(db, PRIOR, 6, ['6.1', '6.2'], 'gemma4-lex-16k');
    expect(carried.size).toBe(1);
    expect(carried.get(500)!.findings.map((f) => f.indicatorId).sort()).toEqual(['6.1', '6.2']);
  });

  it('counts a provision both cells reported identically once', () => {
    put(db, 1, 500, finding('6.1', 'ban on transfer', 'shall not transfer'));
    put(db, 2, 500, finding('6.1', 'ban on transfer', 'shall not transfer'));
    expect(carriedReadings(db, PRIOR, 6, ['6.1', '6.2'], 'gemma4-lex-16k').get(500)!.findings).toHaveLength(1);
  });

  it('carries a provision that said nothing, because that is the commonest answer and a real one', () => {
    put(db, 1, 501, '[]');
    const carried = carriedReadings(db, PRIOR, 6, ['6.1', '6.2'], 'gemma4-lex-16k');
    expect(carried.has(501)).toBe(true);
    expect(carried.get(501)!.findings).toEqual([]);
  });

  it('never carries a reading a different model produced', () => {
    put(db, 1, 502, finding('6.1', 'ban on transfer', 'x'), 'some-other-model');
    expect(carriedReadings(db, PRIOR, 6, ['6.1', '6.2'], 'gemma4-lex-16k').has(502)).toBe(false);
  });

  it('never reaches into a run that was not named', () => {
    put(db, 3, 503, finding('6.1', 'ban on transfer', 'x'));
    expect(carriedReadings(db, PRIOR, 6, ['6.1', '6.2'], 'gemma4-lex-16k').has(503)).toBe(false);
  });

  it('names the run that made the call, so the record never credits it to this one', () => {
    put(db, 1, 500, '[]');
    expect(carriedReadings(db, PRIOR, 6, ['6.1'], 'gemma4-lex-16k').get(500)!.carriedFrom).toBe(PRIOR);
  });

  it('charges this run nothing for a call it did not make', () => {
    put(db, 1, 500, '[]');
    const r = carriedReadings(db, PRIOR, 6, ['6.1'], 'gemma4-lex-16k').get(500)!;
    expect([r.promptTokens, r.completionTokens, r.durationMs]).toEqual([0, 0, 0]);
  });
});
