/**
 * A unit that is killed mid-pillar should not pay twice for what it already read.
 *
 * The defect: a pillar banks nothing until every provision in it is read, so the budget watchdog
 * stopping a 668-provision pillar at provision 600 threw away 600 readings the account had paid
 * for. Distinct from the development cache, which must stay off: these are the run's own readings.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** An engine that answers, and counts how many prompts it was actually asked to run. */
function engine(): Promise<{ server: Server; port: number; asked: () => number }> {
  let asked = 0;
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      asked += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: { content: '{"findings":[]}' }, prompt_eval_count: 11, eval_count: 7 }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port, asked: () => asked }),
    );
  });
}

const open: Server[] = [];
let dir = '';

afterEach(() => {
  for (const s of open.splice(0)) s.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
  delete process.env['OLLAMA_HOST'];
  delete process.env['LEXDROID_ENGINE_RESUME'];
  delete process.env['LEXDROID_ENGINE_CACHE'];
});

async function ask(port: number, resume: string | null, prompt = 'read this provision') {
  vi.resetModules();
  process.env['OLLAMA_HOST'] = `http://127.0.0.1:${port}`;
  if (resume) process.env['LEXDROID_ENGINE_RESUME'] = resume;
  else delete process.env['LEXDROID_ENGINE_RESUME'];
  const mod = await import('../src/engines/ollama.js');
  const answer = await mod.generate(prompt, 'you read law', { model: 'gemma4-lex-16k' });
  const { closeCache } = await import('../src/engines/cache.js');
  closeCache();
  return answer;
}

describe('a unit picked up after it was killed', () => {
  it('replays what it already read instead of asking the engine again', async () => {
    const { server, port, asked } = await engine();
    open.push(server);
    dir = mkdtempSync(join(tmpdir(), 'lex-resume-'));
    const store = join(dir, 'AUS-p12.db');

    const first = await ask(port, store);
    const second = await ask(port, store);

    expect(first.fromResume).toBe(false);
    expect(second.fromResume).toBe(true);
    expect(second.text).toBe(first.text);
    // The engine was paid once for this provision, not twice.
    expect(asked()).toBe(1);
  });

  it('keeps the engine time the first attempt really spent, so the cost sheet stays true', async () => {
    const { server, port } = await engine();
    open.push(server);
    dir = mkdtempSync(join(tmpdir(), 'lex-resume-'));
    const store = join(dir, 'MYS-p9.db');

    const first = await ask(port, store);
    const second = await ask(port, store);

    expect(second.durationMs).toBe(first.durationMs);
    expect(second.promptTokens).toBe(first.promptTokens);
    expect(second.fromCache).toBe(false);
  });

  it('is off unless a store is named, so an ordinary run is never served a replay', async () => {
    const { server, port, asked } = await engine();
    open.push(server);

    const first = await ask(port, null);
    const second = await ask(port, null);

    expect(first.fromResume).toBe(false);
    expect(second.fromResume).toBe(false);
    expect(asked()).toBe(2);
  });

  it('misses when the prompt changed, because the key is the request itself', async () => {
    const { server, port, asked } = await engine();
    open.push(server);
    dir = mkdtempSync(join(tmpdir(), 'lex-resume-'));
    const store = join(dir, 'SGP-p3.db');

    await ask(port, store, 'read section 12');
    const other = await ask(port, store, 'read section 13');

    expect(other.fromResume).toBe(false);
    expect(asked()).toBe(2);
  });
});
