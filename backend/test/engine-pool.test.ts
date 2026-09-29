/**
 * The pool exists to buy width without changing answers.
 *
 * Two concurrent reads inside one Ollama server changed 18 of 40 answers; reads on separate
 * servers changed none. So the one property that matters is that an engine is never handed to
 * two readers at once, however many readers are waiting.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EnginePool, NoEnginesLeft, engineHosts, resetEnginePool } from '../src/engines/pool.js';

const A = 'http://a:11434';
const B = 'http://b:11434';
const C = 'http://c:11434';

afterEach(() => {
  delete process.env['OLLAMA_HOSTS'];
  delete process.env['OLLAMA_HOST'];
  resetEnginePool();
});

const never = () => false;
const always = () => true;
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('handing out engines', () => {
  it('never gives one engine to two readers at once', async () => {
    const pool = new EnginePool([A, B, C]);
    const inFlight = new Map<string, number>();
    let worst = 0;

    await Promise.all(
      Array.from({ length: 30 }, () =>
        pool.run(async (host) => {
          const n = (inFlight.get(host) ?? 0) + 1;
          inFlight.set(host, n);
          worst = Math.max(worst, n);
          await tick(1 + Math.random() * 4);
          inFlight.set(host, n - 1);
        }, never),
      ),
    );

    expect(worst).toBe(1);
  });

  it('uses every engine it was given, or the fleet is paying for idle ones', async () => {
    const pool = new EnginePool([A, B, C]);
    const seen = new Set<string>();
    await Promise.all(
      Array.from({ length: 12 }, () => pool.run(async (host) => { seen.add(host); await tick(3); }, never)),
    );
    expect([...seen].sort()).toEqual([A, B, C]);
  });

  it('reports its width as the number of engines still standing', () => {
    expect(new EnginePool([A, B]).width()).toBe(2);
  });
});

describe('an engine that has gone for good', () => {
  it('costs one engine, not the provision it was holding', async () => {
    const pool = new EnginePool([A, B]);
    const answer = await pool.run(async (host) => {
      if (host === A) throw new Error('tunnel closed');
      return `read on ${host}`;
    }, always);

    expect(answer).toBe(`read on ${B}`);
    expect(pool.retiredHosts()).toEqual([A]);
    expect(pool.width()).toBe(1);
  });

  it('is not handed out again while it rests', async () => {
    const pool = new EnginePool([A, B]);
    await pool.run(async (host) => {
      if (host === A) throw new Error('tunnel closed');
    }, always);

    const seen: string[] = [];
    await Promise.all(Array.from({ length: 6 }, () => pool.run(async (h) => { seen.push(h); }, never)));
    expect(seen.every((h) => h === B)).toBe(true);
  });

  it('wakes the readers queued behind it, once it is given up, instead of leaving them waiting', async () => {
    const pool = new EnginePool([A], { giveUpMs: 0 });
    const runs = Array.from({ length: 4 }, () => pool.run(async () => { await tick(2); throw new Error('gone'); }, always));
    const results = await Promise.allSettled(runs);
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    for (const r of results) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(NoEnginesLeft);
    }
  });

  it('does not retire an engine over an ordinary failure, which is the model, not the tunnel', async () => {
    const pool = new EnginePool([A, B]);
    await expect(pool.run(async () => { throw new Error('overran'); }, never)).rejects.toThrow('overran');
    expect(pool.width()).toBe(2);
  });
});

// 29 September: Mongolia's fleet of six retired each pod on its first bad stretch through the
// proxy, and then lost the pillar with every pod still running and answering a minute later.
describe('an engine that stopped answering for a while', () => {
  it('is tried again after resting, so a pod that blinked is not abandoned', async () => {
    const pool = new EnginePool([A], { restMs: 5, giveUpMs: 60_000 });
    let calls = 0;
    const answer = await pool.run(async (host) => {
      calls += 1;
      if (calls === 1) throw new Error('proxy did not answer');
      return `read on ${host}`;
    }, always);

    expect(answer).toBe(`read on ${A}`);
    expect(pool.width()).toBe(1);
    expect(pool.retiredHosts()).toEqual([]);
  });

  it('keeps the others reading while it rests, and rejoins them after', async () => {
    const pool = new EnginePool([A, B], { restMs: 5, giveUpMs: 60_000 });
    await pool.run(async (host) => {
      if (host === A) throw new Error('proxy did not answer');
    }, always);
    expect(pool.width()).toBe(1);

    await tick(20);
    const seen = new Set<string>();
    await Promise.all(Array.from({ length: 8 }, () => pool.run(async (h) => { seen.add(h); await tick(2); }, never)));
    expect([...seen].sort()).toEqual([A, B]);
  });

  it('is given up once it has been away past the give-up, and the run is told', async () => {
    const pool = new EnginePool([A], { restMs: 5, giveUpMs: 12 });
    let calls = 0;
    await expect(pool.run(async () => { calls += 1; throw new Error('gone'); }, always)).rejects.toBeInstanceOf(NoEnginesLeft);
    // Tried at about 0, 5 and 10 ms; a fourth try would fall past the give-up.
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(calls).toBeLessThanOrEqual(3);
  });
});

describe('which engines a run reads on', () => {
  it('is the fleet when one is named, and the local engine when none is', () => {
    process.env['OLLAMA_HOSTS'] = `${A}, ${B} ,${C}`;
    expect(engineHosts()).toEqual([A, B, C]);
    delete process.env['OLLAMA_HOSTS'];
    expect(engineHosts()).toEqual(['http://127.0.0.1:11434']);
  });

  it('counts one engine named twice once, so width is not overstated', () => {
    process.env['OLLAMA_HOSTS'] = `${A},${A}/,${B}`;
    expect(engineHosts()).toEqual([A, B]);
  });

  it('still honours a single host, so nothing that set one has to change', () => {
    process.env['OLLAMA_HOST'] = B;
    expect(engineHosts()).toEqual([B]);
  });
});
