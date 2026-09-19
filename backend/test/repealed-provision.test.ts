/**
 * A provision the Act itself has repealed.
 *
 * Every parser works out whether a section is spent -- SSO marks it with a `prov1Rep` cell, the
 * Federal Register prints "[Repealed]" in the heading, Malaysia's PDFs print "(Deleted)" -- and
 * `storeDocument` dropped the flag on the floor. The column existed and was always zero, so the
 * reader was asked about the words of repealed sections as though they stated current law, and a
 * decision could be based on one.
 *
 * The instrument's own status does not cover this: the Act is in force. It is one section of it
 * that is gone.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { storeDocument } from '../src/parse/index.js';
import type { FetchResult } from '../src/fetch/index.js';
import type { ParsedDocument, ParsedSection } from '../src/parse/types.js';

const URL = 'https://sso.agc.gov.sg/Act/PDPA2012';

function fetched(): FetchResult {
  const buf = Buffer.from('<p>text</p>', 'utf8');
  return {
    url: URL, finalUrl: URL, status: 200, mediaType: 'text/html', body: buf,
    contentHash: createHash('sha256').update(buf).digest('hex'),
    fromCache: false, fetchedAt: '2026-09-19T00:00:00.000Z',
  };
}

function section(ordinal: number, text: string, repealed: boolean): ParsedSection {
  return {
    ordinal, headingPath: `Personal Data Protection Act 2012 > ${ordinal + 1}`,
    label: String(ordinal + 1), text, charStart: 0, charEnd: text.length,
    page: null, language: 'en', repealed, anchor: null,
  };
}

function register() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES ('SGP', 'Personal Data Protection Act 2012', 'act', ?, 'test', '2026-09-19')`,
  ).run(URL);
  const { id } = db.prepare('SELECT id FROM instrument').get() as { id: number };
  return { db, instrumentId: id };
}

describe('storing a document that contains a repealed provision', () => {
  it('keeps the flag the parser worked out, instead of recording every section as live', () => {
    const { db, instrumentId } = register();
    const parsed: ParsedDocument = {
      extraction: 'html', text: 'x', unread: null, meta: {}, parser: 'sso',
      title: 'Personal Data Protection Act 2012',
      sections: [
        section(0, 'An organisation must not transfer personal data outside Singapore.', false),
        section(1, '[Repealed by Act 40 of 2020]', true),
      ],
    };
    storeDocument(db, { instrumentId, fetched: fetched(), parsed });

    const rows = db.prepare('SELECT ordinal, repealed FROM section ORDER BY ordinal').all() as
      { ordinal: number; repealed: number }[];
    expect(rows.map((r) => r.repealed)).toEqual([0, 1]);
    db.close();
  });

  it('records a corpus stored before the column existed as not repealed', () => {
    // The default is zero, which is what every section stored up to now says. That is a claim of
    // ignorance, not of currency, and it is the only safe default: a false 1 would silently drop
    // real law out of the corpus.
    const { db, instrumentId } = register();
    const parsed: ParsedDocument = {
      extraction: 'html', text: 'x', unread: null, meta: {}, parser: 'sso',
      title: 'Personal Data Protection Act 2012',
      sections: [section(0, 'A live provision.', false)],
    };
    storeDocument(db, { instrumentId, fetched: fetched(), parsed });
    expect((db.prepare('SELECT repealed FROM section').get() as { repealed: number }).repealed).toBe(0);
    db.close();
  });
});
