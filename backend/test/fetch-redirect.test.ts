/**
 * A redirect is a request to an address the site chose, and a refresh is a refresh of everything.
 *
 * Redirects used to be followed inside undici's dispatcher, which meant a hop went out with no
 * robots check of its own, no entry in the fetch log and no pause: the politeness claim covered
 * the address we asked for and not the one we were sent to. On a portal that answers every
 * document URL with a 302 to a viewer, that was most of the run.
 *
 * `--refresh` used to be a flag on the outermost call, so the listing page, the wrapper and the
 * parts of a compiled Act were all still answered from disk and the "fresh" document was assembled
 * out of last month's bytes.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { Fetcher, RobotsDisallowed } from '../src/fetch/index.js';

const servers: Server[] = [];
afterAll(() => {
  for (const s of servers) s.close();
});

interface Site {
  robots?: string;
  /** Path to what it answers with: a redirect target, or a body. */
  routes: Record<string, { to?: string; body?: string }>;
}

async function serve(site: Site): Promise<{ origin: string; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    hits.push(url);
    if (url === '/robots.txt' && !site.routes[url]) {
      res.writeHead(site.robots === undefined ? 404 : 200, { 'content-type': 'text/plain' });
      res.end(site.robots ?? '');
      return;
    }
    const route = site.routes[url];
    if (route?.to) {
      res.writeHead(302, { location: route.to });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(route?.body ?? '<html><body>a page</body></html>');
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { origin: `http://127.0.0.1:${port}`, hits };
}

describe('following a redirect', () => {
  it('serves the document the site redirected to', async () => {
    const { origin } = await serve({ routes: { '/act/1': { to: '/view/1' }, '/view/1': { body: 'the Act' } } });
    const db = openDb(':memory:');
    const res = await new Fetcher({ db, sourceMode: 'fetch' }).fetch(`${origin}/act/1`);
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('the Act');
    // The citation is the address that actually served the text, not the one we asked for.
    expect(res.finalUrl).toBe(`${origin}/view/1`);
    db.close();
  });

  it('checks the destination against robots, not only the address we asked for', async () => {
    // The hop is a request to a path the site chose. A site that disallows its print view and
    // redirects to it is not giving permission by redirecting.
    const { origin } = await serve({
      robots: 'User-agent: *\nDisallow: /print\n',
      routes: { '/act/1': { to: '/print/1' } },
    });
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch' });
    await expect(fetcher.fetch(`${origin}/act/1`)).rejects.toThrow(RobotsDisallowed);
    db.close();
  });

  it('records the hop in the fetch log, so the crawl is countable', async () => {
    // The politeness claim is evidenced from this table. A hop that never appears in it is a
    // request the record does not account for.
    const { origin } = await serve({ routes: { '/act/1': { to: '/view/1' }, '/view/1': { body: 'x' } } });
    const db = openDb(':memory:');
    await new Fetcher({ db, sourceMode: 'fetch' }).fetch(`${origin}/act/1`);
    const logged = db.prepare('SELECT url, outcome FROM fetch_log ORDER BY id').all() as
      { url: string; outcome: string }[];
    expect(logged.some((r) => r.outcome === 'redirect' && r.url === `${origin}/act/1`)).toBe(true);
    expect(logged.some((r) => r.url === `${origin}/view/1`)).toBe(true);
    db.close();
  });

  it('stops rather than loops where a site redirects to itself', async () => {
    const { origin, hits } = await serve({ routes: { '/loop': { to: '/loop' } } });
    const db = openDb(':memory:');
    const res = await new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 20 }).fetch(`${origin}/loop`);
    // Six requests: the first and five hops. It gives up and reports the redirect it was given.
    expect(res.status).toBe(302);
    expect(hits.filter((h) => h === '/loop').length).toBe(6);
    db.close();
  });

  // The pace is one request per interval, and a hop is a request. A redirect to the same host
  // used to go straight out, so a portal that bounces through itself was asked twice at once.
  it('paces a redirect to the same host like any other request', async () => {
    const { origin } = await serve({ routes: { '/act/1': { to: '/view/1' }, '/view/1': { body: 'the Act' } } });
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 300 });
    await fetcher.fetch(`${origin}/act/1`);
    const at = (db.prepare(`SELECT url, outcome, wait_ms FROM fetch_log ORDER BY id`).all() as {
      url: string; outcome: string; wait_ms: number;
    }[]);
    const hop = at.find((r) => r.outcome === 'redirect-wait');
    expect(hop?.url).toBe(`${origin}/view/1`);
    expect(hop!.wait_ms).toBeGreaterThan(200);
    db.close();
  });

  it('follows a redirect on robots.txt itself without asking robots for permission', async () => {
    // RFC 9309 says to follow them, and checking robots.txt against the rules it is about to
    // supply is a question that cannot terminate.
    const { origin } = await serve({
      routes: { '/robots.txt': { to: '/static/robots.txt' }, '/static/robots.txt': { body: 'User-agent: *\nDisallow: /x\n' }, '/y': { body: 'ok' } },
    });
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'fetch' });
    const res = await fetcher.fetch(`${origin}/y`);
    expect(res.status).toBe(200);
    await expect(fetcher.fetch(`${origin}/x`)).rejects.toThrow(RobotsDisallowed);
    db.close();
  });
});

describe('a fetcher in refresh mode', () => {
  it('asks the network again for a document the cache already holds', async () => {
    const { origin, hits } = await serve({ routes: { '/act/1': { body: 'the Act' } } });
    const db = openDb(':memory:');

    await new Fetcher({ db, sourceMode: 'fetch' }).fetch(`${origin}/act/1`);
    const asked = hits.filter((h) => h === '/act/1').length;
    expect(asked).toBe(1);

    // Ordinary mode answers the second call from disk.
    await new Fetcher({ db, sourceMode: 'fetch' }).fetch(`${origin}/act/1`);
    expect(hits.filter((h) => h === '/act/1').length).toBe(1);

    // Refresh mode does not.
    await new Fetcher({ db, sourceMode: 'refresh' }).fetch(`${origin}/act/1`);
    expect(hits.filter((h) => h === '/act/1').length).toBe(2);
    db.close();
  });

  it('asks for robots.txt again too, so a rule that has changed is the rule we obey', async () => {
    const { origin, hits } = await serve({ robots: 'User-agent: *\n', routes: { '/act/1': { body: 'x' } } });
    const db = openDb(':memory:');
    await new Fetcher({ db, sourceMode: 'fetch' }).fetch(`${origin}/act/1`);
    const before = hits.filter((h) => h === '/robots.txt').length;
    await new Fetcher({ db, sourceMode: 'refresh' }).fetch(`${origin}/act/1`);
    expect(hits.filter((h) => h === '/robots.txt').length).toBe(before + 1);
    db.close();
  });
});
