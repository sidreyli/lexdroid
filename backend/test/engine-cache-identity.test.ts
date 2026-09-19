/**
 * The cache is keyed on the engine that answers, not only on the model that was asked for.
 *
 * Keyed on the requested model alone, a hosted run replayed whatever the last engine said to the
 * same prompt, and a comparison of two engines compared one engine with itself.
 */
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { closeCache } from '../src/engines/cache.js';
import { generate } from '../src/engines/ollama.js';

const PATH = 'backend/data/engine-cache-identity.test.db';
let server: Server;
let base = '';

beforeAll(async () => {
  // Answers with the name of the model it was asked for, so a replayed answer is visible.
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { model } = JSON.parse(raw) as { model: string };
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          choices: [{ message: { content: `answered by ${model}` }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

afterEach(() => {
  closeCache();
  for (const k of ['LEXDROID_ENGINE_CACHE', 'LEXDROID_ENGINE_CACHE_PATH', 'LEXDROID_HOSTED_BASE_URL', 'LEXDROID_HOSTED_MODEL']) {
    delete process.env[k];
  }
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      rmSync(PATH + suffix);
    } catch {
      // Nothing to remove.
    }
  }
});

it('does not replay one hosted engine’s answer as another’s', async () => {
  process.env['LEXDROID_ENGINE_CACHE'] = '1';
  process.env['LEXDROID_ENGINE_CACHE_PATH'] = PATH;
  process.env['LEXDROID_HOSTED_BASE_URL'] = base;

  process.env['LEXDROID_HOSTED_MODEL'] = 'engine-a';
  const first = await generate('section 26', 'read', { model: 'local-reader' });
  expect(first.text).toBe('answered by engine-a');

  process.env['LEXDROID_HOSTED_MODEL'] = 'engine-b';
  const second = await generate('section 26', 'read', { model: 'local-reader' });
  expect(second.fromCache).toBe(false);
  expect(second.text).toBe('answered by engine-b');

  // The same engine asked the same thing is still a hit: the cache is narrower, not broken.
  const again = await generate('section 26', 'read', { model: 'local-reader' });
  expect(again.fromCache).toBe(true);
  expect(again.text).toBe('answered by engine-b');
});
