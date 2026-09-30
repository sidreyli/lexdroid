/**
 * Asking a portal a question it will only answer to a POST.
 *
 * Every request this pipeline made until Mongolia was a GET, and the cache is keyed on the URL
 * because for a GET the URL *is* the question. `legalinfo.mn` is not built that way: its register
 * lives behind one path, `/mn/ajaxListBody/`, and the parameters carry the whole question --
 * which category, which page, in force or repealed. Asked as a GET it answers 200 with valid JSON
 * and ignores every parameter, so `filtercategorytypeid=27` and `=33` come back byte-identical
 * and `page=3` returns page one. Measured against the live site on 21 September 2026.
 *
 * So the danger is not that POST fails. It is that POST works and the cache does not know the
 * difference: seventeen categories would be fetched once and then served the first one's answer
 * seventeen times, silently, with the shape of a working crawl. That is what these tests are for.
 *
 * Everything else about a POST is deliberately unchanged, and asserted here rather than assumed:
 * robots is consulted on the same path, the host's queue and crawl delay apply, cache-only still
 * cannot reach the network, and every attempt reaches fetch_log -- which is what C5a is scored on.
 */
import { describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { openDb } from '../src/db/index.js';
import { CacheMiss, Fetcher, encodeForm } from '../src/fetch/index.js';

/** A server that answers according to the posted form, the way a real listing endpoint does. */
async function listingServer(): Promise<{ origin: string; close: () => Promise<void>; hits: string[] }> {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.url === '/robots.txt') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('User-agent: *\nDisallow: /private\n');
        return;
      }
      hits.push(`${req.method} ${req.url} ${body}`);
      const category = /filtercategorytypeid=(\d+)/.exec(body)?.[1] ?? 'none';
      res.writeHead(200, { 'content-type': 'application/json' });
      // The shape that matters: the answer depends on the body, not on the path.
      res.end(JSON.stringify({ Html: `<div>category ${category}</div>` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

describe('a form-encoded POST', () => {
  it('sends the body, and the host answers according to it', async () => {
    const site = await listingServer();
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 1 });

    const a = await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '27' } });
    const b = await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '33' } });

    expect(JSON.parse(a.body.toString('utf8')).Html).toContain('category 27');
    expect(JSON.parse(b.body.toString('utf8')).Html).toContain('category 33');
    expect(site.hits.every((h) => h.startsWith('POST'))).toBe(true);

    db.close();
    await site.close();
  });

  it('does not serve one question\'s answer to another, which is the whole risk', async () => {
    const site = await listingServer();
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 1 });

    await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '27' } });
    await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '33' } });
    await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '27' } });

    // Three asks, two distinct questions: the third is served from the cache and never leaves.
    expect(site.hits).toHaveLength(2);
    expect(fetcher.stats.cached).toBe(1);

    db.close();
    await site.close();
  });

  it('keeps a GET and a POST to one url apart', async () => {
    const site = await listingServer();
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 1 });

    await fetcher.fetch(`${site.origin}/list`);
    await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '27' } });

    expect(site.hits).toHaveLength(2);
    expect(site.hits[0]!.startsWith('GET')).toBe(true);
    expect(site.hits[1]!.startsWith('POST')).toBe(true);
    expect(fetcher.stats.cached).toBe(0);

    db.close();
    await site.close();
  });

  it('is written to fetch_log as a POST, so the run record counts what really left', async () => {
    const site = await listingServer();
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 1 });

    await fetcher.fetch(`${site.origin}/list`);
    await fetcher.fetch(`${site.origin}/list`, { form: { filtercategorytypeid: '27' } });

    // robots.txt is a request too and is logged as one, so it is excluded by path rather than
    // by outcome -- it is a GET and would otherwise sit in front of the two being asserted.
    const rows = db
      .prepare("SELECT method FROM fetch_log WHERE outcome = 'ok' AND url LIKE '%/list' ORDER BY id")
      .all() as { method: string }[];
    expect(rows.map((r) => r.method)).toEqual(['GET', 'POST']);

    const robots = db
      .prepare("SELECT method FROM fetch_log WHERE url LIKE '%/robots.txt'")
      .all() as { method: string }[];
    expect(robots.every((r) => r.method === 'GET')).toBe(true);

    db.close();
    await site.close();
  });

  it('is refused by robots like any other request', async () => {
    const site = await listingServer();
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 1 });

    await expect(fetcher.fetch(`${site.origin}/private/list`, { form: { a: '1' } })).rejects.toThrow();
    // Nothing was posted to a disallowed path.
    expect(site.hits).toHaveLength(0);
    const row = db.prepare("SELECT method FROM fetch_log WHERE outcome = 'robots-disallowed'").get() as
      | { method: string }
      | undefined;
    expect(row?.method).toBe('POST');

    db.close();
    await site.close();
  });

  it('cannot reach the network in cache-only mode', async () => {
    // The live test checks the second engine fetched nothing. A POST must not be a way around it.
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'cache-only' });
    await expect(fetcher.fetch('https://example.gov/list', { form: { a: '1' } })).rejects.toBeInstanceOf(
      CacheMiss,
    );
    expect(fetcher.stats.network).toBe(0);
    db.close();
  });
});

describe('the encoded body', () => {
  it('orders its fields, so the cache key does not depend on how a caller wrote the object', () => {
    expect(encodeForm({ page: '2', filtercategorytypeid: '27' })).toBe(
      encodeForm({ filtercategorytypeid: '27', page: '2' }),
    );
    expect(encodeForm({ b: '2', a: '1' })).toBe('a=1&b=2');
  });

  it('escapes what a form has to escape', () => {
    expect(encodeForm({ q: 'a b&c=d' })).toBe('q=a%20b%26c%3Dd');
  });
});
