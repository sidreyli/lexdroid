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

describe('the schema a hosted engine is sent', () => {
  it('closes every object in it, not only the outermost', async () => {
    let sent: unknown = null;
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c)).on('end', () => {
        sent = JSON.parse(body);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(OK);
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    process.env['LEXDROID_HOSTED_BASE_URL'] = `http://127.0.0.1:${port}/v1`;
    process.env['LEXDROID_HOSTED_MODEL'] = 'm';
    const schema = {
      type: 'object',
      properties: {
        findings: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' } } } },
      },
    };
    await hostedGenerate('hi', 'sys', { schema });
    const s = (sent as { response_format: { json_schema: { schema: any } } }).response_format.json_schema.schema;
    expect(s.additionalProperties).toBe(false);
    expect(s.properties.findings.items.additionalProperties).toBe(false);
    // A property named "type" is a name, not a schema: closed as a string, not as an object.
    expect(s.properties.findings.items.properties.type).toEqual({ type: ['string', 'null'] });
    // Strict mode wants every property required; one the schema left optional may be null instead.
    expect(s.required).toEqual(['findings']);
    expect(s.properties.findings.items.required).toEqual(['type']);
  });
});

describe('a reading refused for a field it left out', () => {
  it('is kept, because the answer is whole and an absent field reads as null', async () => {
    const generation = JSON.stringify({ findings: [{ quote: 'хувь хүний мэдээлэл' }] });
    const refusal = JSON.stringify({ error: { code: 'json_validate_failed', message: 'missing properties', failed_generation: generation } });
    await host([{ status: 400, body: refusal }]);
    expect((await hostedGenerate('hi', 'sys')).text).toBe(generation);
  });

  it('is still an error when what was generated is not JSON', async () => {
    const refusal = JSON.stringify({ error: { code: 'json_validate_failed', failed_generation: 'max completion tokens reached' } });
    await host([{ status: 400, body: refusal }]);
    await expect(hostedGenerate('hi', 'sys')).rejects.toThrow(/400/);
  });
});
