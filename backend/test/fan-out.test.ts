/**
 * Reading a pillar across the whole fleet, rather than one pillar per engine.
 *
 * Measured on the run of 12 September: 32.0 engine-hours of reading in total, and one pillar --
 * Australia's twelfth, 603 provisions -- worth 4.2 hours of it. One engine per pillar, twelve
 * engines: the eleven others finished and idled while that one pillar ran the run out.
 */
import { describe, expect, it } from 'vitest';
import { childEngineEnv, makespan } from '../src/run/fleet.js';

const A = 'http://a:11434';
const B = 'http://b:11434';

describe('what a child gate is told about engines', () => {
  it('names every engine, so one pillar can be read across all of them', () => {
    expect(childEngineEnv([A, B])['OLLAMA_HOSTS']).toBe(`${A},${B}`);
  });

  it('still names a single engine the old way, for anything that reads only that', () => {
    expect(childEngineEnv([A, B])['OLLAMA_HOST']).toBe(A);
  });

  it('holds one request per engine however wide the run is', () => {
    expect(childEngineEnv([A, B])['LEXDROID_READ_CONCURRENCY']).toBe('1');
  });

  it('refuses to describe a run with no engine at all', () => {
    expect(() => childEngineEnv([])).toThrow(/at least one engine/);
  });

  it('unsets the hosted engine the parent may have inherited', () => {
    // The child is spawned with the parent's whole environment plus this. A shell that ran a
    // hosted fleet earlier still holds LEXDROID_HOSTED_BASE_URL and _MODEL, and the child reads
    // those before it reads OLLAMA_HOST: every provision went to the hosted engine while the
    // laptop's GPU sat idle, and the run recorded the wrong engine against every answer.
    const env = childEngineEnv([A]);
    expect(env['LEXDROID_HOSTED_BASE_URL']).toBe('');
    expect(env['LEXDROID_HOSTED_MODEL']).toBe('');
    expect(env['LEXDROID_HOSTED_API_KEY']).toBe('');
  });

  it('still points a hosted child at its hosted engine', () => {
    const env = childEngineEnv([A], { hosted: true, baseUrl: 'https://api.example/v1', model: 'm', provider: 'p' });
    expect(env['LEXDROID_HOSTED_BASE_URL']).toBe('https://api.example/v1');
    expect(env['LEXDROID_HOSTED_MODEL']).toBe('m');
  });

  // A hosted engine speaks chat completions; the pool the child is given is for embeddings, which
  // only an Ollama answers. Handing it the hosted URL retired the host on the first query.
  it('gives a hosted child an embedding engine, not the hosted URL', () => {
    const before = process.env['LEXDROID_EMBED_HOSTS'];
    delete process.env['LEXDROID_EMBED_HOSTS'];
    const env = childEngineEnv(['https://api.example/v1'], { hosted: true, baseUrl: 'https://api.example/v1', model: 'm', provider: 'p' });
    expect(env['OLLAMA_HOSTS']).toBe('http://127.0.0.1:11434');
    process.env['LEXDROID_EMBED_HOSTS'] = 'http://10.0.0.5:11434';
    expect(childEngineEnv(['https://api.example/v1'], { hosted: true, baseUrl: 'https://api.example/v1', model: 'm', provider: 'p' })['OLLAMA_HOST']).toBe('http://10.0.0.5:11434');
    if (before === undefined) delete process.env['LEXDROID_EMBED_HOSTS'];
    else process.env['LEXDROID_EMBED_HOSTS'] = before;
  });

  it('never carries a key it was handed rather than one the environment holds', () => {
    // The registry file records which engines exist; it never records a key, and a key must not
    // reach a child through an argument either.
    const before = process.env['LEXDROID_HOSTED_API_KEY'];
    delete process.env['LEXDROID_HOSTED_API_KEY'];
    const env = childEngineEnv([A], { hosted: true, baseUrl: 'https://api.example/v1', model: 'm', provider: 'p' });
    expect('LEXDROID_HOSTED_API_KEY' in env).toBe(false);
    if (before !== undefined) process.env['LEXDROID_HOSTED_API_KEY'] = before;
  });
});

describe('how long a run takes', () => {
  /** Every pillar of the 12 September run, in hours of reading, largest first. */
  const units = [4.19, 2.83, 2.41, 1.45, 1.31, 1.18, 1.05, 1.04, 1.03, 0.93, 0.92, 0.9,
    0.89, 0.83, 0.82, 0.75, 0.74, 0.68, 0.64, 0.63, 0.61, 0.58, 0.57, 0.55,
    0.54, 0.51, 0.49, 0.45, 0.44, 0.4, 0.35, 0.31, 0.27, 0.21, 0.18, 0.15];

  it('is set by the largest single pillar when an engine takes a whole one', () => {
    expect(makespan(units, 12, 'unit-at-a-time')).toBe(4.19);
  });

  it('is set by the work itself when every engine reads each pillar together', () => {
    const total = units.reduce((a, b) => a + b, 0);
    expect(makespan(units, 12, 'pillar-at-a-time')).toBeCloseTo(total / 12, 6);
  });

  it('is shorter pillar-at-a-time on exactly the fleet we ran', () => {
    const wide = makespan(units, 12, 'pillar-at-a-time');
    const narrow = makespan(units, 12, 'unit-at-a-time');
    expect(wide).toBeLessThan(narrow);
    expect(narrow / wide).toBeGreaterThan(1.5);
  });

  it('is why paying for more engines is worth it only once a pillar can be divided', () => {
    // Twice the engines halves the reading, where before it bought nothing at all.
    expect(makespan(units, 24, 'unit-at-a-time')).toBe(makespan(units, 12, 'unit-at-a-time'));
    expect(makespan(units, 24, 'pillar-at-a-time')).toBeCloseTo(makespan(units, 12, 'pillar-at-a-time') / 2, 6);
  });

  it('gains nothing from more engines than the biggest pillar needs, the other way round', () => {
    // Twenty engines cannot shorten one 603-provision pillar if one engine has to read all of it.
    expect(makespan(units, 20, 'unit-at-a-time')).toBe(4.19);
    expect(makespan(units, 20, 'pillar-at-a-time')).toBeLessThan(2);
  });

  it('is the same either way on a single engine, because there is nothing to divide', () => {
    expect(makespan(units, 1, 'pillar-at-a-time')).toBe(makespan(units, 1, 'unit-at-a-time'));
  });

  it('refuses a run with no engine rather than dividing by zero', () => {
    expect(() => makespan(units, 0, 'pillar-at-a-time')).toThrow(/at least one engine/);
  });
});
