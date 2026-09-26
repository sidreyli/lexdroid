/**
 * An engine shown the schema rather than held to it by the decoder.
 *
 * Qwen 3.8 held to the reading schema answered `{"findings": []}` on the provision that decides
 * India's 8.3, every time; unconstrained, it named the duty. So Engine B is declared "described":
 * the schema goes in the prompt, the JSON is taken from wherever it sits in the answer, and only an
 * answer with none in it is asked again under the decoder.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonIn, schemaDecoding } from '../src/engines/ollama.js';

describe('the JSON in an answer', () => {
  it('is the answer itself when that is JSON', () => {
    expect(jsonIn(' {"findings": []}\n')).toBe('{"findings": []}');
  });
  it('is found inside a code fence or after a sentence', () => {
    expect(jsonIn('```json\n{"findings": [{"quote": "a}b"}]}\n```')).toBe('{"findings": [{"quote": "a}b"}]}');
    expect(jsonIn('Here is the answer: {"findings": []} Hope that helps.')).toBe('{"findings": []}');
  });
  it('respects braces and escaped quotes inside strings', () => {
    const obj = '{"findings": [{"quote": "the \\"{\\" sign"}]}';
    expect(jsonIn(`x ${obj} y`)).toBe(obj);
  });
  it('is nothing when the answer holds no JSON, rather than a guess at one', () => {
    expect(jsonIn('quote: "identify such user"\ndutyBearer: "An intermediary"')).toBeNull();
    expect(jsonIn('{"findings": [')).toBeNull();
  });
});

describe('which engines are shown the schema', () => {
  it('is Engine B by its declaration, and Engine A keeps the decoder', () => {
    expect(schemaDecoding('qwen3.8-lex-16k')).toBe('described');
    expect(schemaDecoding('gemma4-lex-16k')).toBe('constrained');
    expect(schemaDecoding('some-model-nobody-declared')).toBe('constrained');
  });
});

/** An engine that answers with each of `answers` in turn, and records what it was asked. */
function engine(answers: string[]): Promise<{ server: Server; port: number; asked: any[] }> {
  const asked: any[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      asked.push(JSON.parse(raw));
      const content = answers[Math.min(asked.length - 1, answers.length - 1)];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: { content }, prompt_eval_count: 100, eval_count: 10, done_reason: 'stop' }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port, asked }));
  });
}

async function ollamaAt(port: number) {
  vi.resetModules();
  process.env['OLLAMA_HOST'] = `http://127.0.0.1:${port}`;
  return import('../src/engines/ollama.js');
}

const open: Server[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
  delete process.env['OLLAMA_HOST'];
});

const SCHEMA = { type: 'object', properties: { findings: { type: 'array' } }, required: ['findings'] };

describe('asking an engine that is shown the schema', () => {
  it('sends no format, puts the schema in the system prompt, and returns the JSON alone', async () => {
    const e = await engine(['```json\n{"findings": [{"quote": "verify his identity"}]}\n```']);
    open.push(e.server);
    const { generate } = await ollamaAt(e.port);
    const res = await generate('the provision', 'You read legislation.', { model: 'qwen3.8-lex-16k', schema: SCHEMA });

    expect(e.asked).toHaveLength(1);
    expect(e.asked[0].format).toBeUndefined();
    expect(e.asked[0].messages[0].content).toContain(JSON.stringify(SCHEMA));
    expect(JSON.parse(res.text)).toEqual({ findings: [{ quote: 'verify his identity' }] });
  });

  it('asks once more under the decoder when the answer holds no JSON, and adds up both', async () => {
    const e = await engine(['quote: "verify his identity"', '{"findings": []}']);
    open.push(e.server);
    const { generate, describedSchemaFallbacks } = await ollamaAt(e.port);
    const res = await generate('the provision', 'You read legislation.', { model: 'qwen3.8-lex-16k', schema: SCHEMA });

    expect(e.asked).toHaveLength(2);
    expect(e.asked[1].format).toEqual(SCHEMA);
    expect(e.asked[1].messages[0].content).toBe('You read legislation.');
    expect(res.text).toBe('{"findings": []}');
    expect(res.completionTokens).toBe(20);
    expect(describedSchemaFallbacks()).toBe(1);
  });

  it('leaves Engine A held by the decoder, as it always was', async () => {
    const e = await engine(['{"findings": []}']);
    open.push(e.server);
    const { generate } = await ollamaAt(e.port);
    await generate('the provision', 'You read legislation.', { model: 'gemma4-lex-16k', schema: SCHEMA });

    expect(e.asked[0].format).toEqual(SCHEMA);
    expect(e.asked[0].messages[0].content).toBe('You read legislation.');
  });
});
