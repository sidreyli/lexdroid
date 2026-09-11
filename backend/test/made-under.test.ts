import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { withSubsidiary } from '../src/contents/index.js';
import { linkParents } from '../src/contents/parentage.js';
import { registerIdOf } from '../src/discover/frl.js';
import type { Fetcher, FetchResult } from '../src/fetch/index.js';

interface Row { title: string; kind: string; url: string }

function register(rows: Row[]) {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('AUS','Australia','[\"en\"]')").run();
  const insert = db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES ('AUS', ?, ?, ?, 'test', '2026-09-12')`,
  );
  for (const r of rows) insert.run(r.title, r.kind, r.url);
  const all = db.prepare('SELECT id, title FROM instrument ORDER BY id').all() as { id: number; title: string }[];
  return { db, idOf: (title: string): number => all.find((r) => r.title === title)!.id };
}

const AU = (id: string): string => `https://www.legislation.gov.au/${id}/latest/text`;

const ROWS: Row[] = [
  { title: 'Public Governance, Performance and Accountability Act 2013', kind: 'act', url: AU('C2013A00123') },
  { title: 'Customs Act 1901', kind: 'act', url: AU('C1901A00006') },
  { title: 'Commonwealth Procurement Rules 17 November 2025', kind: 'regulation', url: AU('F2025L01263') },
  { title: 'Customs (Prohibited Imports) Regulations 1956', kind: 'regulation', url: AU('F1996B03651') },
  { title: 'Public Governance, Performance and Accountability Rules 2014', kind: 'regulation', url: AU('F2014L00911') },
];

/** A register that answers one question: what does this Act authorise. */
function stubFetcher(answers: Record<string, { id: string; name: string }[]>): Fetcher {
  return {
    async fetch(url: string): Promise<FetchResult> {
      const actId = /authorises\("([^"]+)"\)/.exec(decodeURIComponent(url))?.[1] ?? '';
      const value = answers[actId] ?? [];
      const body = Buffer.from(JSON.stringify({ value, '@odata.count': value.length }), 'utf8');
      return {
        url, finalUrl: url, status: 200, mediaType: 'application/json',
        body, contentHash: 'x', fromCache: false, fetchedAt: '2026-09-12T00:00:00Z',
      };
    },
  } as unknown as Fetcher;
}

describe('the Act an instrument says it is made under', () => {
  it('reads the register id out of a title URL', () => {
    expect(registerIdOf(AU('F2025L01263'))).toBe('F2025L01263');
    expect(registerIdOf('https://www.legislation.gov.au/C2013A00123/latest/text')).toBe('C2013A00123');
    expect(registerIdOf('https://sso.agc.gov.sg/Act/CA1967')).toBeNull();
  });

  it('records what the register says each Act carries', async () => {
    const { db, idOf } = register(ROWS);
    const pgpa = idOf('Public Governance, Performance and Accountability Act 2013');
    const progress = await linkParents(
      db,
      stubFetcher({
        C2013A00123: [
          { id: 'F2025L01263', name: 'Commonwealth Procurement Rules 17 November 2025' },
          { id: 'F2014L00911', name: 'Public Governance, Performance and Accountability Rules 2014' },
          { id: 'F1900L00001', name: 'An instrument we never registered' },
        ],
      }),
      [pgpa],
    );

    expect(progress.linked).toBe(2);
    const parent = db
      .prepare('SELECT made_under_instrument_id p FROM instrument WHERE id = ?')
      .get(idOf('Commonwealth Procurement Rules 17 November 2025')) as { p: number | null };
    expect(parent.p).toBe(pgpa);
  });

  it('carries an instrument whose title shares nothing with its Act', async () => {
    const { db, idOf } = register(ROWS);
    const pgpa = idOf('Public Governance, Performance and Accountability Act 2013');
    const cpr = idOf('Commonwealth Procurement Rules 17 November 2025');

    // Ranked on title alone the rules come last, and no Act's name is a stem of theirs.
    const ranked = [pgpa, idOf('Customs Act 1901'), idOf('Customs (Prohibited Imports) Regulations 1956'), cpr];
    const before = withSubsidiary(db, 'AUS', ranked).indexOf(cpr);
    expect(before).toBe(ranked.length);

    await linkParents(
      db,
      stubFetcher({ C2013A00123: [{ id: 'F2025L01263', name: 'Commonwealth Procurement Rules 17 November 2025' }] }),
      [pgpa],
    );
    expect(withSubsidiary(db, 'AUS', ranked).indexOf(cpr)).toBeLessThan(before);
  });

  it('puts what the register states ahead of what a name suggests', async () => {
    const { db, idOf } = register(ROWS);
    const pgpa = idOf('Public Governance, Performance and Accountability Act 2013');
    await linkParents(
      db,
      stubFetcher({ C2013A00123: [{ id: 'F2025L01263', name: 'Commonwealth Procurement Rules 17 November 2025' }] }),
      [pgpa],
    );
    const order = withSubsidiary(db, 'AUS', [pgpa]);
    // The Rules 2014 match the Act's name; the Procurement Rules are what the register named.
    expect(order.indexOf(idOf('Commonwealth Procurement Rules 17 November 2025'))).toBeLessThan(
      order.indexOf(idOf('Public Governance, Performance and Accountability Rules 2014')),
    );
  });

  it('carries the instruments of an Act whose name is too short to be a stem', async () => {
    const { db, idOf } = register([
      { title: 'Act 2020', kind: 'act', url: AU('C2020A00001') },
      { title: 'Aviation Transport Security Regulations 2005', kind: 'regulation', url: AU('F2005L01426') },
    ]);
    const act = idOf('Act 2020');
    expect(withSubsidiary(db, 'AUS', [act])).toEqual([act]);

    await linkParents(
      db,
      stubFetcher({ C2020A00001: [{ id: 'F2005L01426', name: 'Aviation Transport Security Regulations 2005' }] }),
      [act],
    );
    expect(withSubsidiary(db, 'AUS', [act])).toEqual([act, idOf('Aviation Transport Security Regulations 2005')]);
  });

  it('reports the Acts a budget did not reach', async () => {
    const { db, idOf } = register(ROWS);
    const slow = stubFetcher({});
    const fetch = slow.fetch.bind(slow);
    const fetcher = {
      async fetch(url: string) {
        await new Promise((r) => setTimeout(r, 5));
        return fetch(url);
      },
    } as unknown as Fetcher;

    const p = await linkParents(
      db,
      fetcher,
      [idOf('Public Governance, Performance and Accountability Act 2013'), idOf('Customs Act 1901')],
      { budgetMs: 1 },
    );
    expect(p.asked).toBe(1);
    expect(p.unasked).toBe(1);
  });

  it('asks nothing a second time', async () => {
    const { db, idOf } = register(ROWS);
    const pgpa = idOf('Public Governance, Performance and Accountability Act 2013');
    const answers = { C2013A00123: [{ id: 'F2025L01263', name: 'Commonwealth Procurement Rules 17 November 2025' }] };
    await linkParents(db, stubFetcher(answers), [pgpa]);
    const again = await linkParents(db, stubFetcher(answers), [pgpa]);
    expect(again.asked).toBe(0);
  });
});
