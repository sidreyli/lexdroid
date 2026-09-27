/**
 * What a budgeted crawl spends its budget on.
 *
 * The crawl is the corpus. Australia registered 23,693 regulations and fetched 109, and among the
 * 23,584 left undone were the Customs (Prohibited Imports) Regulations 1956, the Customs
 * (Prohibited Exports) Regulations 1958, the Customs Regulation 2015, the Radiocommunications
 * Regulations 2023 and the Commonwealth Procurement Rules -- the instrument ESCAP itself cites for
 * Australia's procurement indicators. None is obscure. They were late in a list.
 */
import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { buildContents } from '../src/contents/index.js';

const TITLES = [
  'Aged Care Act 1997',
  'Customs (Prohibited Imports) Regulations 1956',
  'Commonwealth Procurement Rules',
];

function store(): Db {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('AUS','Australia','[\"en\"]')").run();
  TITLES.forEach((title, i) => {
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at)
       VALUES (?, 'AUS', ?, ?, ?, 'portal', '2026-09-07')`,
    ).run(i + 1, title, i === 0 ? 'act' : 'regulation', `https://legislation.gov.au/F${i + 1}`);
  });
  return db;
}

/** Records what was asked for, in the order it was asked for, and refuses every request. */
function refusingFetcher(asked: string[]) {
  return {
    fetch: async (url: string) => {
      asked.push(url);
      const { SoftBlocked } = await import('../src/fetch/index.js');
      throw new SoftBlocked(url, 202);
    },
  };
}

describe('a portal nothing can read', () => {
  it('is recorded as a hole in the corpus rather than skipped in silence', async () => {
    const { register } = await import('../src/discover/index.js');
    const db = store();
    db.prepare("INSERT INTO portal (economy_code, name, url, kind) VALUES ('AUS','Australian Border Force','https://www.abf.gov.au','regulator')").run();
    const results = await register(
      db,
      {
        code: 'AUS',
        name: 'Australia',
        officialLanguages: ['en'],
        portals: [{ name: 'Australian Border Force', url: 'https://www.abf.gov.au', kind: 'regulator', adapter: null }],
      } as never,
      { fetch: async () => { throw new Error('should not be asked'); } } as never,
    );
    expect(results[0]?.error).toContain('no adapter');
    const held = db.prepare("SELECT COUNT(*) c FROM discard WHERE reason = 'portal-unread'").get() as { c: number };
    expect(held.c).toBe(1);
  });
});

describe('a portal that was read and published nothing', () => {
  /**
   * The same hole, and for a long time only the first kind was recorded. Singapore's e-Gazette
   * and Malaysia's MyIPO answer 403, the Border Force publishes no index at all, and each of
   * them reported the same "0 instrument(s) listed" that a genuinely empty regulator would.
   */
  async function walk(found: unknown[]) {
    const { register } = await import('../src/discover/index.js');
    const db = store();
    db.prepare("INSERT INTO portal (economy_code, name, url, kind) VALUES ('AUS','e-Gazette','https://www.egazette.gov.sg','gazette')").run();
    const results = await register(
      db,
      {
        code: 'AUS',
        name: 'Australia',
        officialLanguages: ['en'],
        portals: [{
          name: 'e-Gazette', url: 'https://www.egazette.gov.sg', kind: 'gazette',
          adapter: 'sitemap', adapterConfig: {},
        }],
      } as never,
      { fetch: async () => ({
        url: 'https://www.egazette.gov.sg/sitemap.xml',
        finalUrl: 'https://www.egazette.gov.sg/sitemap.xml',
        status: 200, mediaType: 'application/xml',
        body: Buffer.from(found.length ? '<urlset><url><loc>https://www.egazette.gov.sg/cybersecurity-act-2018</loc></url></urlset>' : '<urlset></urlset>'),
        contentHash: 'fixture', fromCache: true, fetchedAt: '2026-09-19T00:00:00.000Z',
      }) } as never,
    );
    return { db, results };
  }

  it('is recorded as a hole, naming the adapter that found nothing there', async () => {
    const { db, results } = await walk([]);
    expect(results[0]?.error).toContain('sitemap');
    const held = db.prepare("SELECT detail FROM discard WHERE reason = 'portal-yielded-nothing'").all() as { detail: string }[];
    expect(held).toHaveLength(1);
    expect(held[0]?.detail).toContain('e-Gazette');
  });

  it('is not recorded against a portal that did publish something', async () => {
    const { db } = await walk([1]);
    const held = db.prepare("SELECT COUNT(*) c FROM discard WHERE reason = 'portal-yielded-nothing'").get() as { c: number };
    expect(held.c).toBe(0);
  });
});

describe('the order a budgeted crawl works in', () => {
  it('reaches subsidiary legislation, which used to be excluded by kind', async () => {
    const asked: string[] = [];
    await buildContents(store(), refusingFetcher(asked) as never, { economy: 'AUS', order: 'register' });
    expect(asked).toHaveLength(3);
  });

  it('crawls in register order when asked to', async () => {
    const asked: string[] = [];
    await buildContents(store(), refusingFetcher(asked) as never, { economy: 'AUS', order: 'register' });
    expect(asked[0]).toContain('F1');
  });

  it('puts an explicit priority first, whatever the register order is', async () => {
    const asked: string[] = [];
    await buildContents(store(), refusingFetcher(asked) as never, { economy: 'AUS', priority: [3, 2] });
    expect(asked[0]).toContain('F3');
    expect(asked[1]).toContain('F2');
  });

  it('leaves the rest undone rather than dropping it, so a later crawl continues', async () => {
    const asked: string[] = [];
    const progress = await buildContents(store(), refusingFetcher(asked) as never, {
      economy: 'AUS',
      order: 'register',
      budgetMs: -1,
    });
    expect(progress.skipped).toBe(3);
    expect(asked).toHaveLength(0);
  });
});
