/**
 * Splitting one run across engines.
 *
 * What this is for: the speed-up is real only if the answers survive it. Batching inside one engine
 * changed 18 of 40 provisions, so the rule is one worker per engine and it has to be enforced.
 */
import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { openRun, joinRun, recordEvent, runEvents } from '../src/run/index.js';
import { duplicateEngine, engineKey, workUnits } from '../src/run/fleet.js';

describe('what counts as one engine', () => {
  it('sees through the aliases of the same local server', () => {
    expect(engineKey('http://localhost:11434')).toBe(engineKey('http://127.0.0.1:11434'));
    expect(engineKey('http://127.0.0.1:11434/')).toBe(engineKey('127.0.0.1:11434'));
  });

  it('keeps different ports and different machines apart', () => {
    expect(engineKey('http://127.0.0.1:11434')).not.toBe(engineKey('http://127.0.0.1:11435'));
    expect(engineKey('http://127.0.0.1:11434')).not.toBe(engineKey('http://192.168.1.20:11434'));
  });

  it('names the host that would have put two workers on one engine', () => {
    expect(duplicateEngine(['http://127.0.0.1:11434', 'http://localhost:11434'])).toBe(
      'http://localhost:11434',
    );
    expect(duplicateEngine(['http://127.0.0.1:11434', 'http://127.0.0.1:11435'])).toBeNull();
  });
});

describe('splitting the work', () => {
  it('makes one unit per economy and pillar', () => {
    expect(workUnits(['SGP', 'MYS'], [6, 7])).toHaveLength(4);
    expect(workUnits(['SGP'], [6])).toEqual([{ economy: 'SGP', pillar: 6 }]);
  });
});

describe('two workers writing one run', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  it('loses nothing when separate connections interleave, as separate processes do', () => {
    dir = mkdtempSync(join(tmpdir(), 'lexdroid-fleet-'));
    const path = join(dir, 'run.db');

    const opener = openDb(path);
    opener
      .prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')")
      .run();
    const run = openRun(opener, { economies: ['SGP'], pillars: [6, 7], model: 'gemma4-lex-16k' });

    // Two connections, not two handles on one: this is the contention a fleet actually creates.
    const a = joinRun(openDb(path), run.id);
    const b = joinRun(openDb(path), run.id);
    for (let i = 1; i <= 20; i += 1) {
      recordEvent(a, { stage: 'read', kind: 'finished', economy: 'SGP', pillarId: 6, done: i, total: 20 });
      recordEvent(b, { stage: 'read', kind: 'finished', economy: 'SGP', pillarId: 7, done: i, total: 20 });
    }
    a.db.close();
    b.db.close();

    const events = runEvents(opener, run.id, 0, 100);
    expect(events).toHaveLength(40);
    expect(events.filter((e) => e.pillarId === 6)).toHaveLength(20);
    expect(events.filter((e) => e.pillarId === 7)).toHaveLength(20);
    expect(events.map((e) => e.id)).toEqual([...events.map((e) => e.id)].sort((x, y) => x - y));
    opener.close();
  });
});
