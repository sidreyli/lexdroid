/**
 * One set of verdicts, read the same way by everything that scores.
 *
 * The live run, the rebuild verify checks a stored score against, and the replay that grades a rule
 * change each assemble the evidence a decision is made from. Each used to decide for itself whether
 * a confirmation applied and only the replay ever did, so one run was 105 cells stored, 105
 * re-derived and 118 replayed -- three true numbers and nothing written down saying which question
 * each had answered. These tests hold the lookup and the tally to one reading of the table.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import {
  confirmedFlag,
  loadConfirmations,
  noConfirmations,
  tallyConfirmations,
} from '../src/read/confirmations.js';

function storeWith(rows: { section: number; indicator: string; measure: string; words: string | null; failure?: string }[]) {
  const db = openDb(':memory:');
  const insert = db.prepare(
    `INSERT INTO measure_confirmation (section_id, indicator_id, measure, words, failure, model, asked_at)
     VALUES (?, ?, ?, ?, ?, 'test-model', '2026-09-16T00:00:00.000Z')`,
  );
  // section_id has a foreign key; the rows under test are read back by key alone, so the
  // referenced sections do not need to exist for this.
  db.pragma('foreign_keys = OFF');
  for (const r of rows) insert.run(r.section, r.indicator, r.measure, r.words, r.failure ?? null);
  return db;
}

describe('the banked second-reading verdicts', () => {
  it('reads words as yes and a null answer as no', () => {
    const db = storeWith([
      { section: 1, indicator: '12.3', measure: 'ecommerce-licence', words: 'holds a licence' },
      { section: 2, indicator: '12.3', measure: 'ecommerce-licence', words: null },
    ]);
    const set = loadConfirmations(db);
    expect(set.verdict(1, '12.3', 'ecommerce-licence')).toBe(true);
    expect(set.verdict(2, '12.3', 'ecommerce-licence')).toBe(false);
    db.close();
  });

  it('leaves a question nobody answered undecided rather than refused', () => {
    // The distinction the whole pass turns on: a provision the engine could not read is not a
    // provision found wanting, and must not arrive downstream looking like one.
    const db = storeWith([
      { section: 3, indicator: '6.1', measure: 'transfer-ban', words: null, failure: 'engine timed out' },
    ]);
    const set = loadConfirmations(db);
    expect(set.verdict(3, '6.1', 'transfer-ban')).toBeUndefined();
    expect(set.size).toBe(0);
    db.close();
  });

  it('answers nothing for a question it was never asked', () => {
    const db = storeWith([{ section: 1, indicator: '12.3', measure: 'ecommerce-licence', words: null }]);
    const set = loadConfirmations(db);
    expect(set.verdict(99, '12.3', 'ecommerce-licence')).toBeUndefined();
    expect(set.verdict(1, '12.4', 'ecommerce-licence')).toBeUndefined();
    expect(set.verdict(1, '12.3', 'payment-licence')).toBeUndefined();
    expect(set.verdict(1, '12.3', null)).toBeUndefined();
    db.close();
  });

  it('offers an empty set for a caller scoring without the pass', () => {
    const set = noConfirmations();
    expect(set.size).toBe(0);
    expect(set.verdict(1, '12.3', 'ecommerce-licence')).toBeUndefined();
  });
});

describe('the flag spread onto a finding', () => {
  it('carries a verdict and omits the property where there is none', () => {
    expect(confirmedFlag(true)).toEqual({ confirmed: true });
    expect(confirmedFlag(false)).toEqual({ confirmed: false });
    // Absent, not undefined: a reading that predates the pass must not be held on it.
    expect(confirmedFlag(undefined)).toEqual({});
    expect('confirmed' in confirmedFlag(undefined)).toBe(false);
  });
});

describe('the tally written onto an answer', () => {
  it('counts the verdicts a decision saw and the refusals among them', () => {
    const tally = tallyConfirmations([
      { confirmed: true },
      { confirmed: false },
      { confirmed: false },
      {},
      { confirmed: undefined },
    ]);
    expect(tally).toEqual({ asked: 3, applied: 2 });
  });

  it('records nothing consulted where nothing was', () => {
    expect(tallyConfirmations([])).toEqual({ asked: 0, applied: 0 });
    expect(tallyConfirmations([{}, {}])).toEqual({ asked: 0, applied: 0 });
  });
});
