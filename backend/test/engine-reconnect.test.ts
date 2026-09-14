/**
 * A tunnel that drops for a few seconds is not an engine that has stopped.
 *
 * The defect: on 11 September both pods' tunnels blinked, reconnected on their own within seconds,
 * and 125 of 140 Australian reads were thrown away because the first failed read killed the pillar.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * A server that drops the socket on its first `refusals` requests, then answers properly.
 * `reset` sends an RST rather than a close, which is what a dropped SSH tunnel actually does.
 */
function flaky(
  refusals: number,
  how: 'close' | 'reset' = 'close',
): Promise<{ server: Server; port: number; seen: () => number }> {
  let seen = 0;
  const server = createServer((req, res) => {
    seen += 1;
    if (seen <= refusals) {
      const socket = res.socket as (typeof res.socket & { resetAndDestroy?: () => void }) | null;
      if (how === 'reset' && socket?.resetAndDestroy) socket.resetAndDestroy();
      else socket?.destroy();
      return;
    }
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: (server.address() as AddressInfo).port, seen: () => seen }),
    );
  });
}

async function engineAt(port: number, waits: string) {
  vi.resetModules();
  process.env['OLLAMA_HOST'] = `http://127.0.0.1:${port}`;
  process.env['LEXDROID_RECONNECT_WAITS_MS'] = waits;
  return import('../src/engines/ollama.js');
}

const open: Server[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.close();
  delete process.env['OLLAMA_HOST'];
  delete process.env['LEXDROID_RECONNECT_WAITS_MS'];
});

describe('an engine that goes away and comes back', () => {
  it('is waited for, and the request that hit the gap still gets its answer', async () => {
    const { server, port } = await flaky(2);
    open.push(server);
    const { embed, engineReconnects } = await engineAt(port, '10,10,10,10');

    const vectors = await embed(['a provision']);

    expect(vectors).toHaveLength(1);
    expect(engineReconnects()).toBe(2);
  });

  it('is not confused with an engine that has stopped: past the budget the caller is told', async () => {
    const { server, port, seen } = await flaky(Number.MAX_SAFE_INTEGER);
    open.push(server);
    const { embed, OllamaUnavailable } = await engineAt(port, '10,10');

    await expect(embed(['a provision'])).rejects.toBeInstanceOf(OllamaUnavailable);
    // The first attempt plus one per wait, and then it stops rather than trying forever.
    expect(seen()).toBe(3);
  });

  // The night of 13 September: the tunnels reset rather than closed, ECONNRESET was not on the
  // list, and the reads that hit the gap took their pillars down instead of waiting.
  it('is waited for when the link is reset rather than closed', async () => {
    const { server, port } = await flaky(2, 'reset');
    open.push(server);
    const { embed, engineReconnects } = await engineAt(port, '10,10,10,10');

    const vectors = await embed(['a provision']);

    expect(vectors).toHaveLength(1);
    expect(engineReconnects()).toBe(2);
  });

  it('does not retry a stall, because the engine took the request and the wait was already spent', async () => {
    vi.resetModules();
    const { EngineTimeout, EngineFailure } = await import('../src/engines/ollama.js');
    expect(new EngineTimeout('m', 'body timeout')).toBeInstanceOf(EngineFailure);
  });
});
