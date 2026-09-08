/**
 * The running commentary.
 *
 * What this is for: a reading that stalls should be visible while it stalls. Thirty-one calls each
 * ran for minutes and returned nothing, and the run said not a word until its pillar finished.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { openRun, recordEvent, runEvents, finishRun } from '../src/run/index.js';
import { describe as describeEvent } from '../src/run/events.js';

function fixture() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  return db;
}

function open(db: ReturnType<typeof openDb>) {
  return openRun(db, { economies: ['SGP'], pillars: [6], model: 'gemma4-lex-16k' });
}

describe('a run saying what it is doing', () => {
  it('keeps every event, in the order they happened', () => {
    const db = fixture();
    const run = open(db);
    recordEvent(run, { stage: 'read', kind: 'started', economy: 'SGP', pillarId: 6, total: 3 });
    recordEvent(run, { stage: 'read', kind: 'finished', economy: 'SGP', pillarId: 6, done: 1, total: 3, seconds: 4.2 });
    recordEvent(run, { stage: 'read', kind: 'refused', economy: 'SGP', pillarId: 6, done: 2, total: 3, detail: 'cut off' });

    const events = runEvents(db, run.id);
    expect(events.map((e) => e.kind)).toEqual(['started', 'finished', 'refused']);
    expect(events[1]?.seconds).toBe(4.2);
    expect(events[2]?.detail).toBe('cut off');
  });

  it('can be followed from where a watcher left off', () => {
    const db = fixture();
    const run = open(db);
    for (let i = 1; i <= 5; i += 1) {
      recordEvent(run, { stage: 'read', kind: 'finished', done: i, total: 5 });
    }
    const first = runEvents(db, run.id, 0, 2);
    expect(first).toHaveLength(2);
    const rest = runEvents(db, run.id, first[1]!.id);
    expect(rest).toHaveLength(3);
    expect(rest[0]?.done).toBe(3);
  });

  it('holds a refusal apart from a failure, because only one of them stops the run', () => {
    const db = fixture();
    const run = open(db);
    recordEvent(run, { stage: 'read', kind: 'refused', detail: 'the engine was cut off' });
    recordEvent(run, { stage: 'run', kind: 'failed', detail: 'the engine is not running' });
    const kinds = runEvents(db, run.id).map((e) => e.kind);
    expect(kinds).toEqual(['refused', 'failed']);
  });

  it('survives the run it belongs to closing', () => {
    const db = fixture();
    const run = open(db);
    recordEvent(run, { stage: 'decide', kind: 'finished', indicatorId: '6.2', detail: 'score 1' });
    finishRun(run);
    expect(runEvents(db, run.id)).toHaveLength(1);
  });

  it('reads back the tokens a call spent, so a runaway is visible in the ledger', () => {
    const db = fixture();
    const run = open(db);
    recordEvent(run, { stage: 'read', kind: 'refused', promptTokens: 2771, outputTokens: 4096, seconds: 92 });
    const e = runEvents(db, run.id)[0]!;
    expect(e.promptTokens).toBe(2771);
    expect(e.outputTokens).toBe(4096);
  });

  it('says the same thing to a person as it stores', () => {
    const line = describeEvent({ stage: 'read', kind: 'finished', indicatorId: '6.2', done: 41, total: 150, seconds: 4.2 });
    expect(line).toContain('6.2');
    expect(line).toContain('41/150');
    expect(line).toContain('4.2s');
  });
});
