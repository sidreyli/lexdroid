/**
 * The development cache, and the one thing it must never be allowed to do.
 *
 * A change is validated by running two economies and seeing whether it moves both toward ESCAP's
 * answers. Replayed readings turn that from a measurement into a replay, so the cache is off unless
 * asked for and every run that touches it is marked.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { cacheEnabled, cacheGet, cacheKey, cachePut, cacheSize, closeCache, cachePath } from '../src/engines/cache.js';

const PATH = 'backend/data/engine-cache.test.db';

beforeEach(() => {
  process.env['LEXDROID_ENGINE_CACHE_PATH'] = PATH;
});

afterEach(() => {
  closeCache();
  delete process.env['LEXDROID_ENGINE_CACHE'];
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(PATH + suffix);
    } catch {
      // Nothing to remove.
    }
  }
});

describe('whether the cache is on', () => {
  it('is off unless something asked for it', () => {
    delete process.env['LEXDROID_ENGINE_CACHE'];
    expect(cacheEnabled()).toBe(false);
  });

  it('takes only an explicit yes', () => {
    process.env['LEXDROID_ENGINE_CACHE'] = '0';
    expect(cacheEnabled()).toBe(false);
    process.env['LEXDROID_ENGINE_CACHE'] = '1';
    expect(cacheEnabled()).toBe(true);
  });
});

describe('the key', () => {
  const request = {
    model: 'gemma4-lex-16k',
    messages: [{ role: 'system', content: 'read' }, { role: 'user', content: 'section 26' }],
    options: { temperature: 0 },
  };

  it('is the same request asked twice', () => {
    expect(cacheKey(request)).toBe(cacheKey({ ...request }));
  });

  it('does not care what order the request was built in', () => {
    const reordered = { options: { temperature: 0 }, messages: request.messages, model: request.model };
    expect(cacheKey(reordered)).toBe(cacheKey(request));
  });

  // The v1 repository versioned its cache by hand and the bump was forgotten. Nothing is bumped here.
  it('misses when the prompt changes', () => {
    const edited = { ...request, messages: [request.messages[0]!, { role: 'user', content: 'section 27' }] };
    expect(cacheKey(edited)).not.toBe(cacheKey(request));
  });

  it('misses when the model changes', () => {
    expect(cacheKey({ ...request, model: 'qwen3-lex-16k' })).not.toBe(cacheKey(request));
  });

  it('misses when an option changes', () => {
    expect(cacheKey({ ...request, options: { temperature: 0, num_predict: 4096 } })).not.toBe(cacheKey(request));
  });
});

describe('what it stores', () => {
  it('gives back exactly what was put in', () => {
    const key = cacheKey({ q: 1 });
    expect(cacheGet(key)).toBeNull();
    cachePut(key, { text: '{"findings":[]}', promptTokens: 900, completionTokens: 20, durationMs: 1100, model: 'gemma4-lex-16k' });
    expect(cacheGet(key)).toEqual({
      text: '{"findings":[]}',
      promptTokens: 900,
      completionTokens: 20,
      durationMs: 1100,
      model: 'gemma4-lex-16k',
    });
    expect(cacheSize()).toBe(1);
  });

  it('lives in its own file, so deleting it cannot touch a run record', () => {
    delete process.env['LEXDROID_ENGINE_CACHE_PATH'];
    expect(cachePath()).not.toContain('lexdroid.db');
  });
});
