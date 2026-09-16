/**
 * A generation the engine abandons is one provision's failure, not the pillar's.
 *
 * The defect: Ollama aborts a prediction that repeats itself and reports it as HTTP 500. That was
 * not classified, so it left the client as a plain error, and the read stage -- which steps over an
 * EngineFailure and records it -- let it through. Australia's pillar 6 died twice at the same
 * provision, 43 reads in, losing the 42 already done with it.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ABORT_BODY = JSON.stringify({ error: 'prediction aborted, token repeat limit reached' });

/** An engine that answers every request the way Ollama answers a runaway generation. */
function aborting(status = 500, body = ABORT_BODY): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(body);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

async function engineAt(port: number) {
  vi.resetModules();
  process.env['OLLAMA_HOST'] = `http://127.0.0.1:${port}`;
  process.env['LEXDROID_RECONNECT_WAITS_MS'] = '10,10';
  return import('../src/engines/ollama.js');
}

const open: Server[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
  delete process.env['OLLAMA_HOST'];
  delete process.env['LEXDROID_RECONNECT_WAITS_MS'];
});

describe('a prediction the engine gave up on', () => {
  it('reaches the caller as a failed call, which is what the read stage steps over', async () => {
    const { server, port } = await aborting();
    open.push(server);
    const { embed, EngineFailure } = await engineAt(port);

    await expect(embed(['a provision'])).rejects.toBeInstanceOf(EngineFailure);
  });

  it('is named, so the ledger can tell it from a stall or a lost link', async () => {
    const { server, port } = await aborting();
    open.push(server);
    const { embed } = await engineAt(port);

    await expect(embed(['a provision'])).rejects.toMatchObject({ name: 'EngineAborted' });
  });

  it('is not treated as an engine that has stopped, which would end the job', async () => {
    const { server, port } = await aborting();
    open.push(server);
    const { embed, OllamaUnavailable } = await engineAt(port);

    await expect(embed(['a provision'])).rejects.not.toBeInstanceOf(OllamaUnavailable);
  });

  // The classification is on what the engine said, not on the status code: a 500 that is not an
  // abandoned generation is still an unexplained failure and must not be quietly recorded as one.
  it('does not swallow every 500 the engine returns', async () => {
    const { server, port } = await aborting(500, JSON.stringify({ error: 'model not found' }));
    open.push(server);
    const { embed, EngineFailure } = await engineAt(port);

    await expect(embed(['a provision'])).rejects.not.toBeInstanceOf(EngineFailure);
  });
});
