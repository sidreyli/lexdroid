/**
 * Several workers, one run.
 *
 * What this is for: a fleet that opened one run per worker would leave the answers scattered across
 * run records that nobody can compare, cost or reopen as the single thing they were.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { openRun, joinRun, recordEvent, runEvents, finishRun, recordRent } from '../src/run/index.js';

function fixture() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\"]')").run();
  return db;
}

describe('joining a run somebody else opened', () => {
  it('writes every worker into the one run, not one run each', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP', 'MYS'], pillars: [6, 7], model: 'gemma4-lex-16k' });

    const a = joinRun(db, run.id);
    const b = joinRun(db, run.id);
    recordEvent(a, { stage: 'read', kind: 'finished', economy: 'SGP', pillarId: 6, done: 1, total: 1 });
    recordEvent(b, { stage: 'read', kind: 'finished', economy: 'MYS', pillarId: 7, done: 1, total: 1 });

    expect(a.id).toBe(run.id);
    expect(b.id).toBe(run.id);
    expect((db.prepare('SELECT COUNT(*) AS n FROM run').get() as { n: number }).n).toBe(1);
    expect(runEvents(db, run.id).map((e) => e.economy)).toEqual(['SGP', 'MYS']);
  });

  it('takes the engine already recorded on the run, so workers cannot disagree about it', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [6], model: 'm', engine: 'engine-b' });
    expect(joinRun(db, run.id).engine).toBe('engine-b');
  });

  it('refuses a run that does not exist', () => {
    const db = fixture();
    expect(() => joinRun(db, 'no-such-run')).toThrow(/No run/);
  });

  it('refuses a run already closed, whose totals have been read', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [6], model: 'm' });
    finishRun(run);
    expect(() => joinRun(db, run.id)).toThrow(/not running/);
  });
});

describe('what a rented run cost', () => {
  const usd = (db: ReturnType<typeof fixture>, runId: string) =>
    (db.prepare('SELECT SUM(usd) AS usd FROM run_cost WHERE run_id = ?').get(runId) as { usd: number }).usd;

  it('records the charge against the run', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [6], model: 'gemma4-lex-16k' });
    recordRent(db, run.id, run.engine, 'gemma4-lex-16k', 0.51);
    expect(usd(db, run.id)).toBeCloseTo(0.51);
  });

  it('adds a second charge rather than replacing the first', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [6], model: 'gemma4-lex-16k' });
    recordRent(db, run.id, run.engine, 'gemma4-lex-16k', 0.51);
    recordRent(db, run.id, run.engine, 'gemma4-lex-16k', 0.25);
    expect(usd(db, run.id)).toBeCloseTo(0.76);
  });

  it('leaves a run on this machine costing nothing', () => {
    const db = fixture();
    const run = openRun(db, { economies: ['SGP'], pillars: [6], model: 'gemma4-lex-16k' });
    finishRun(run);
    const row = db.prepare('SELECT SUM(usd) AS usd FROM run_cost WHERE run_id = ?').get(run.id) as { usd: number | null };
    expect(row.usd ?? 0).toBe(0);
  });
});
