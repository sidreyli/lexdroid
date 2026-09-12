/**
 * Grading against ESCAP's answer, not against their highest row.
 *
 * Their database is one row per measure. An indicator whose top band is an absence is answered by
 * the lowest row, so taking the highest scores us wrong on a cell we got right.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { openDb } from '../src/db/index.js';
import { BASELINE_SCHEMA } from '../src/baseline/index.js';
import { scorecard } from '../src/eval/scorecard.js';

const dir = mkdtempSync(join(tmpdir(), 'lexdroid-scorecard-'));
const baselinePath = join(dir, 'baseline.db');

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Malaysia 8.2 as ESCAP recorded it: a row that found nothing and a row that cites the framework. */
function baselineWithTwoRows(): void {
  const db = new Database(baselinePath);
  db.exec(BASELINE_SCHEMA);
  const insert = db.prepare(
    `INSERT INTO baseline_row (source, economy, indicator_id, raw_score) VALUES ('round-1','Malaysia','8.2',?)`,
  );
  insert.run(0);
  insert.run(1);
  db.close();
}

function runWithAnswer(score: number) {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\"]')").run();
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1','2026-09-13T00:00:00Z','["MYS"]','all','engine-a','m','fetch','abc','x','complete')`,
  ).run();
  const cell = db
    .prepare("INSERT INTO cell (run_id, economy_code, indicator_id, state) VALUES ('r1','MYS','8.2','restricted')")
    .run().lastInsertRowid;
  db.prepare('INSERT INTO cell_answer (cell_id, score, computed_at) VALUES (?, ?, ?)')
    .run(cell, score, '2026-09-13T00:00:00Z');
  return db;
}

describe('a cell ESCAP recorded in two rows', () => {
  baselineWithTwoRows();

  it('is graded by the indicator ladder, so the absence-topped cell answers 0', () => {
    const db = runWithAnswer(0);
    const [cell] = scorecard(db, 'r1', baselinePath);
    expect(cell?.theirs).toBe(0);
    expect(cell?.verdict).toBe('agree');
    db.close();
  });

  it('does not read the highest row as their answer', () => {
    const db = runWithAnswer(1);
    const [cell] = scorecard(db, 'r1', baselinePath);
    expect(cell?.verdict).not.toBe('agree');
    db.close();
  });
});
