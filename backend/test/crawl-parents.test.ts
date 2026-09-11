import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { withSubsidiary } from '../src/contents/index.js';

/** A register in miniature: a few Acts, and the instruments made under them. */
function register(rows: { title: string; kind: string }[]) {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('AUS','Australia','[\"en\"]')").run();
  const insert = db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES ('AUS', ?, ?, ?, 'test', '2026-09-12')`,
  );
  const ids: number[] = [];
  rows.forEach((r, n) => {
    insert.run(r.title, r.kind, `https://legislation.gov.au/${n}`);
    ids.push(db.prepare('SELECT last_insert_rowid() id').get() as never as number);
  });
  const all = db.prepare("SELECT id, title FROM instrument ORDER BY id").all() as { id: number; title: string }[];
  return { db, idOf: (title: string): number => all.find((r) => r.title === title)!.id };
}

const ROWS = [
  { title: 'Competition and Consumer Act 2010', kind: 'act' },
  { title: 'Customs Act 1901', kind: 'act' },
  { title: 'Competition and Consumer Notice No. 1 of 2016', kind: 'notice' },
  { title: 'Competition and Consumer Notice No. 2 of 2016', kind: 'notice' },
  { title: 'Customs (Prohibited Imports) Regulations 1956', kind: 'regulation' },
  { title: 'Customs Regulation 2015', kind: 'regulation' },
  { title: 'Marine Order 32 (Cargo handling equipment) 2016', kind: 'order' },
];

describe('spending the crawl on the instruments an Act carries', () => {
  it('brings a regulation up behind the Act it is made under', () => {
    const { db, idOf } = register(ROWS);
    // Ranked on title alone, the two customs regulations come last of all.
    const ranked = [
      idOf('Competition and Consumer Act 2010'),
      idOf('Customs Act 1901'),
      idOf('Marine Order 32 (Cargo handling equipment) 2016'),
      idOf('Competition and Consumer Notice No. 1 of 2016'),
      idOf('Competition and Consumer Notice No. 2 of 2016'),
      idOf('Customs (Prohibited Imports) Regulations 1956'),
      idOf('Customs Regulation 2015'),
    ];
    const order = withSubsidiary(db, 'AUS', ranked);
    const at = (title: string): number => order.indexOf(idOf(title));

    expect(at('Customs (Prohibited Imports) Regulations 1956')).toBeLessThan(at('Competition and Consumer Notice No. 2 of 2016'));
    // Round by round, so the second customs regulation still arrives ahead of its own ranking.
    expect(at('Customs Regulation 2015')).toBeLessThan(ranked.indexOf(idOf('Customs Regulation 2015')));
  });

  it('gives every Act its first instrument before any Act gets its second', () => {
    const { db, idOf } = register(ROWS);
    const ranked = [idOf('Competition and Consumer Act 2010'), idOf('Customs Act 1901')];
    const order = withSubsidiary(db, 'AUS', ranked);
    const at = (title: string): number => order.indexOf(idOf(title));

    expect(at('Customs (Prohibited Imports) Regulations 1956')).toBeLessThan(at('Competition and Consumer Notice No. 2 of 2016'));
  });

  it('prefers the instruments that make law to the ones that appoint people', () => {
    const { db, idOf } = register([
      { title: 'Customs Act 1901', kind: 'act' },
      { title: 'Customs (Authorised Officers) Instrument 2022', kind: 'notice' },
      { title: 'Customs (Prohibited Imports) Regulations 1956', kind: 'regulation' },
    ]);
    const order = withSubsidiary(db, 'AUS', [idOf('Customs Act 1901')]);
    const at = (title: string): number => order.indexOf(idOf(title));

    expect(at('Customs (Prohibited Imports) Regulations 1956')).toBeLessThan(at('Customs (Authorised Officers) Instrument 2022'));
  });

  it('keeps everything that was ranked, and adds nothing twice', () => {
    const { db } = register(ROWS);
    const ranked = (db.prepare("SELECT id FROM instrument ORDER BY id").all() as { id: number }[]).map((r) => r.id);
    const order = withSubsidiary(db, 'AUS', ranked);

    expect(new Set(order).size).toBe(order.length);
    expect([...order].sort((a, b) => a - b)).toEqual([...ranked].sort((a, b) => a - b));
  });

  it('leaves an Act whose name is too short to be a stem alone', () => {
    const { db, idOf } = register([
      { title: 'Act 2020', kind: 'act' },
      { title: 'Aviation Transport Security Regulations 2005', kind: 'regulation' },
    ]);
    const order = withSubsidiary(db, 'AUS', [idOf('Act 2020')]);
    expect(order[0]).toBe(idOf('Act 2020'));
  });
});
