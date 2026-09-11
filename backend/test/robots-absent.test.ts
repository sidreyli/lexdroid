/** What a host means by each answer to robots.txt, and how fast we go afterwards. */
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { Fetcher } from '../src/fetch/index.js';

interface Reply { status: number; body: string }

const servers: Server[] = [];

/** A host that answers robots.txt one way and serves a page either way. */
async function host(robots: Reply): Promise<string> {
  const server = createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(robots.status, { 'content-type': 'text/plain' });
      res.end(robots.body);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html><body>a page</body></html>');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return `http://127.0.0.1:${port}`;
}

async function delayFor(robots: Reply): Promise<number> {
  const db = openDb(':memory:');
  const lines: string[] = [];
  const fetcher = new Fetcher({ db, sourceMode: 'fetch', onLog: (l) => lines.push(l) });
  await fetcher.fetch(`${await host(robots)}/a-page`);
  db.close();
  const said = lines.find((l) => l.includes('between requests')) ?? '';
  return Number(/(\d+)ms between requests/.exec(said)?.[1] ?? -1);
}

afterAll(() => {
  for (const s of servers) s.close();
});

describe('a host with no robots.txt', () => {
  it('is a host that has said it has no rules', async () => {
    // 404 is an answer. Treating it as silence cost a tenfold delay on a register that answers
    // every request in milliseconds, and the standard says plainly that it means no rules.
    expect(await delayFor({ status: 404, body: 'Not Found' })).toBe(1000);
    expect(await delayFor({ status: 410, body: 'Gone' })).toBe(1000);
  });

  it('is not a host pushing back', async () => {
    // 403 and 429 are 4xx and mean the opposite of "help yourself".
    expect(await delayFor({ status: 403, body: 'Forbidden' })).toBe(10_000);
    expect(await delayFor({ status: 429, body: 'Slow down' })).toBe(10_000);
  });

  it('still obeys a file that is there', async () => {
    expect(await delayFor({ status: 200, body: 'user-agent: *\ncrawl-delay: 6\n' })).toBe(6000);
  });

  it('says which of the two happened', async () => {
    const db = openDb(':memory:');
    const lines: string[] = [];
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', onLog: (l) => lines.push(l) });
    await fetcher.fetch(`${await host({ status: 404, body: 'Not Found' })}/a-page`);
    db.close();
    expect(lines.join('\n')).toContain('no robots.txt');
    expect(lines.join('\n')).not.toContain('could not be read');
  });
});
