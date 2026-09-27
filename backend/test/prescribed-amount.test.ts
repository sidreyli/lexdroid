/**
 * A provision that leaves its amount to be prescribed brings in the provision that prescribes it,
 * and a sum written out in words is a sum.
 */
import { describe, expect, it } from 'vitest';
import { indexSections, openDb } from '../src/db/index.js';
import { moneyIn, wordedSums } from '../src/decide/currency.js';
import { prescribingSections } from '../src/retrieve/index.js';

function corpus() {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)').run('XXX', 'X', '["en"]');
  const add = (id: number, title: string, kind: string) =>
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at, status)
       VALUES (?, 'XXX', ?, ?, ?, 'portal', '2026-09-27', 'in-force')`,
    ).run(id, title, kind, `https://example.gov/${id}`);
  const section = (doc: number, label: string, text: string): number => {
    db.prepare(
      `INSERT OR IGNORE INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (?, ?, ?, 'h', 'text/html', 1, 200, '2026-09-27')`,
    ).run(doc, doc, `https://example.gov/${doc}`);
    const id = Number(
      db.prepare(`INSERT INTO section (document_id, ordinal, heading_path, label, text, char_start, char_end) VALUES (?, (SELECT COUNT(*) FROM section WHERE document_id = ?), ?, ?, ?, 0, 1)`)
        .run(doc, doc, label, label, text).lastInsertRowid,
    );
    indexSections(db, doc);
    return id;
  };
  add(1, 'Goods Entry Act 1901', 'act');
  add(2, 'Goods Entry Regulation 2015', 'regulation');
  add(3, 'Unrelated Fees Regulation 2015', 'regulation');
  const pointer = section(1, '68', '68 Entry of imported goods (f) goods that are included in a consignment consigned otherwise than by post and that have a value not exceeding $250 or such other amount as is prescribed');
  section(2, '3', 'This instrument is made under the Goods Entry Act 1901.');
  const prescribing = section(2, '26', 'Value of goods consigned otherwise than by post. For subparagraph 68(1)(f)(iii) of the Act, the amount is $1 000.');
  const another = section(2, '29', 'Goods with a value not exceeding $250 or such other amount as is prescribed for subparagraph 68(1)(f)(iii) of the Act.');
  const elsewhere = section(3, '4', 'The fee for goods consigned otherwise than by post is $1 000.');
  return { db, pointer, prescribing, another, elsewhere };
}

describe('a prescribed amount is followed to where it is prescribed', () => {
  it('brings in the provision that states the amount, from an instrument naming the Act', () => {
    const { db, pointer, prescribing, another, elsewhere } = corpus();
    const row = { sectionId: pointer, instrumentId: 1, instrumentTitle: 'Goods Entry Act 1901', text: '' };
    row.text = (db.prepare('SELECT text FROM section WHERE id = ?').get(pointer) as { text: string }).text;
    const got = prescribingSections(db, 'XXX', [row]).get(pointer) ?? [];
    expect(got[0]).toBe(prescribing);
    // Another default is not the amount, and an instrument that never names the Act is not under it.
    expect(got).not.toContain(another);
    expect(got).not.toContain(elsewhere);
  });

  it('follows nothing from a provision that states its own amount', () => {
    const { db, prescribing } = corpus();
    const text = (db.prepare('SELECT text FROM section WHERE id = ?').get(prescribing) as { text: string }).text;
    expect(prescribingSections(db, 'XXX', [{ sectionId: prescribing, instrumentId: 2, instrumentTitle: 'Goods Entry Regulation 2015', text }]).size).toBe(0);
  });
});

describe('a sum written in words', () => {
  it('is read as the digits it is where a currency follows it', () => {
    expect(moneyIn('sold at a price not exceeding five hundred ringgit and brought into Malaysia', 'MYS')).toEqual({
      amount: 500,
      currency: 'MYR',
      assumedCurrency: false,
    });
    expect(wordedSums('one hundred and fifty Singapore dollars')).toBe('150 Singapore dollars');
    expect(wordedSums('two thousand five hundred dollars')).toBe('2500 dollars');
  });

  it('leaves number words alone where no currency follows', () => {
    expect(wordedSums('consigned by one person to another')).toBe('consigned by one person to another');
  });
});
