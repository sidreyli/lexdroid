/**
 * A hosted engine's rate limit is a wait, not an engine that has gone.
 *
 * Groq's free tier allows 1,000 output tokens a minute, so a reading run meets a 429 every few
 * provisions. Treated as unavailability, the first one retired the only engine and ended the pillar.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { hostedGenerate } from '../src/engines/hosted.js';

let server: Server | null = null;
const saved = { ...process.env };

afterEach(() => {
  server?.close();
  server = null;
  process.env = { ...saved };
});

async function host(answers: { status: number; body: string; headers?: Record<string, string> }[]): Promise<{ asked: () => number }> {
  let n = 0;
  server = createServer((_req, res) => {
    const a = answers[Math.min(n, answers.length - 1)]!;
    n += 1;
    res.writeHead(a.status, { 'content-type': 'application/json', ...(a.headers ?? {}) });
    res.end(a.body);
  });
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  process.env['LEXDROID_HOSTED_BASE_URL'] = `http://127.0.0.1:${port}/v1`;
  process.env['LEXDROID_HOSTED_MODEL'] = 'm';
  return { asked: () => n };
}

const OK = JSON.stringify({ choices: [{ message: { content: 'ready' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 1 } });

describe('a hosted engine that is rate limited', () => {
  it('waits as long as the body says and asks again', async () => {
    const limited = JSON.stringify({ error: { message: 'Rate limit reached ... Please try again in 0.2s.' } });
    const h = await host([{ status: 429, body: limited }, { status: 200, body: OK }]);
    const answer = await hostedGenerate('hi', 'sys');
    expect(answer.text).toBe('ready');
    expect(h.asked()).toBe(2);
  });

  it('gives up on a wait longer than a run can sit through, such as a daily quota', async () => {
    const h = await host([{ status: 429, body: '{}', headers: { 'retry-after': '3600' } }]);
    await expect(hostedGenerate('hi', 'sys')).rejects.toThrow(/429/);
    expect(h.asked()).toBe(1);
  });
});
