/**
 * The corpus is built by the run, and a cache-only run builds nothing.
 *
 * Two separate promises live here. The first is that starting a run from the interface discovers
 * and fetches: "Fetch new documents" spawned a fleet that read whatever happened to be on disk, so
 * a cold machine answered every cell out of an empty corpus and said nothing about it.
 *
 * The second is the one checked on the day. The second engine re-runs over documents already
 * downloaded and fetches nothing new, and its document list has to be empty. A cache-only pass that
 * walked a portal "just to check" would fail that in front of the judges, so the refusal to touch
 * the network is asserted here rather than assumed from a flag being passed along.
 */
import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { prepareCorpus, describePrepare } from '../src/run/prepare.js';
import type { RunEvent } from '../src/run/events.js';

describe('preparing the corpus for a cache-only pass', () => {
  it('fetches nothing, registers nothing and says so', async () => {
    const db = openDb(':memory:');
    const events: RunEvent[] = [];

    const result = await prepareCorpus(db, {
      economy: 'SGP',
      pillars: [6, 7],
      sourceMode: 'cache-only',
      emit: (e) => events.push(e),
    });

    expect(result.fetched).toBe(0);
    expect(result.registered).toBe(0);
    expect(result.shortlisted).toBe(0);
    expect(result.parsed).toBe(0);
    expect(result.embedded).toBe(0);
    db.close();
  });

  it('says why it did nothing, so a refusal and a failure are not confused', async () => {
    const db = openDb(':memory:');
    const result = await prepareCorpus(db, {
      economy: 'SGP',
      pillars: [6],
      sourceMode: 'cache-only',
    });
    // A pass that fetched nothing because it was told not to, and one that fetched nothing because
    // discovery is broken, produce identical numbers. Only the note tells them apart.
    expect(result.notes.some((n) => n.startsWith('cache-only'))).toBe(true);
    expect(describePrepare(result)).toContain('0 fetched');
    db.close();
  });

  it('reaches no network at all', async () => {
    const db = openDb(':memory:');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await prepareCorpus(db, { economy: 'SGP', pillars: [6, 7], sourceMode: 'cache-only' });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    db.close();
  });

  it('leaves the corpus exactly as it found it', async () => {
    const db = openDb(':memory:');
    const count = (table: string) =>
      (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
    const before = [count('instrument'), count('document'), count('section'), count('portal')];

    await prepareCorpus(db, { economy: 'MYS', pillars: [6], sourceMode: 'cache-only' });

    expect([count('instrument'), count('document'), count('section'), count('portal')]).toEqual(before);
    db.close();
  });
});
