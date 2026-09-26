/**
 * The Act a question needs, reached through the law that names it.
 *
 * The defect this exists for: from an empty store, India's shortlist for intermediary safe harbour
 * was maritime and civil-aviation "Suppression of Unlawful Acts against Safety" Acts, and not the
 * information technology Act whose s.79 is the safe harbour. Its title shares no word with the
 * question. Eight rules made under it were read, and nine documents cited it.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { followCitations, normaliseTitle, titlesCitedIn } from '../src/discover/follow.js';

function fixture() {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)').run('XXX', 'X', '["en"]');
  const add = (id: number, title: string, kind: string, parent: number | null = null) =>
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at, made_under_instrument_id)
       VALUES (?, 'XXX', ?, ?, ?, 'portal', '2026-09-26', ?)`,
    ).run(id, title, kind, `https://example.gov/${id}`, parent);
  const text = (id: number, body: string) => {
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (?, ?, ?, 'h', 'text/html', 1, 200, '2026-09-26')`,
    ).run(id, id, `https://example.gov/${id}`);
    db.prepare(`INSERT INTO document_text (document_id, text, parser, parsed_at) VALUES (?, ?, 'test', '2026-09-26')`)
      .run(id, body);
  };
  add(1, 'The Information Technology Act, 2000', 'act');
  add(2, 'The General Clauses Act, 1897', 'act');
  add(3, 'The Suppression of Unlawful Acts against Safety of Civil Aviation Act, 1982', 'act');
  add(10, 'Digital Locker Rules, 2016', 'rule', 1);
  add(11, 'Interception Rules, 2009', 'rule', 1);
  text(10, 'In exercise of the powers conferred by section 87 of the Information Technology Act, 2000 (21 of 2000), and the General Clauses Act, 1897, the Government makes these rules.');
  text(11, 'Made under the Information Technology Act, 2000.');
  text(3, 'Nothing here.');
  return db;
}

describe('following what was read', () => {
  it('finds a title in running text by the year that ends it', () => {
    const titles = new Map([[normaliseTitle('The Information Technology Act, 2000'), 1]]);
    expect([...titlesCitedIn('by section 87 of the Information Technology Act, 2000 (21 of 2000)', titles)]).toEqual([1]);
    expect([...titlesCitedIn('an information technology policy for 2000', titles)]).toEqual([]);
  });

  it('puts the parent Act of what was read first', () => {
    const got = followCitations(fixture(), { economy: 'XXX', from: [10, 11, 3] });
    expect(got[0]).toMatchObject({ instrumentId: 1, children: 2, citedBy: 2, score: 8 });
  });

  it('drops a single mention, and never returns what was read', () => {
    const got = followCitations(fixture(), { economy: 'XXX', from: [10, 11, 3] });
    expect(got.map((c) => c.instrumentId)).toEqual([1]);
    expect(followCitations(fixture(), { economy: 'XXX', from: [10, 11], exclude: [1] })).toEqual([]);
  });
});
