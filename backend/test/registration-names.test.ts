/**
 * What an instrument is registered as: the name it gives itself, and whether it is an instrument.
 *
 * Answers cited a data protection standard as "No. Descriptions" -- the header of a table the PDF
 * parser took for a title -- and an online safety regulation as "provider or licensed content
 * applications service". They cited a consultation paper as guidance, and a news item about a
 * review of an Act as the Act.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { publishedAbout } from '../src/discover/titles.js';
import type { FetchResult } from '../src/fetch/index.js';
import { namesAnInstrument, ownName } from '../src/parse/identity.js';
import { storeDocument } from '../src/parse/index.js';
import type { ParsedDocument } from '../src/parse/types.js';

const s = (...texts: string[]) => texts.map((text) => ({ text }));

describe('the name a document is registered under', () => {
  it('is its citation clause, in Malay where that is the only one', () => {
    expect(ownName(s('1.1 Standard ini bolehlah dinamakan Standard Perlindungan Data Peribadi 2015.'), 'No. Descriptions'))
      .toBe('Standard Perlindungan Data Peribadi 2015');
    expect(ownName(s('1. (1) Peraturan-peraturan ini bolehlah dinamakan Peraturan-Peraturan Keselamatan dalam Talian (Tempoh) 2025.'),
      'provider or licensed content applications service'))
      .toBe('Peraturan-Peraturan Keselamatan dalam Talian (Tempoh) 2025');
  });

  it('is the English citation clause where the document gives both', () => {
    expect(ownName(s('1. Akta ini bolehlah dinamakan Akta Perlindungan Data Peribadi 2010.',
      '1. This Act may be cited as the Personal Data Protection Act 2010.'), null))
      .toBe('Personal Data Protection Act 2010');
  });

  it("takes the parser's guess only where the guess names an instrument", () => {
    expect(ownName(s('Nothing here names itself.'), 'No. Descriptions')).toBeNull();
    expect(ownName(s('Nothing here names itself.'), 'Guidelines on Data Breach Notification')).toBe('Guidelines on Data Breach Notification');
  });

  it('recognises the kinds of instrument a register files as naming one', () => {
    expect(namesAnInstrument('Customs (Prohibition of Imports) Notification')).toBe(true);
    expect(namesAnInstrument('Legal Profession (General Meetings) By-laws')).toBe(true);
    expect(namesAnInstrument('Garis Panduan Pemberitahuan Pelanggaran Data')).toBe(true);
    expect(namesAnInstrument('No. Descriptions')).toBe(false);
  });
});

describe('a thing published about an instrument', () => {
  it('is known by its title or its opening words', () => {
    expect(publishedAbout('MITI reviewing Countervailing and Anti-Dumping Duties Act 1993')).toBe(true);
    expect(publishedAbout('PUBLIC CONSULTATION PAPER NO. 01/2020 REVIEW OF PERSONAL DATA PROTECTION ACT 2010')).toBe(true);
    expect(publishedAbout('FOR IMMEDIATE RELEASE JOINT PRESS RELEASE PDP Commissioner')).toBe(true);
  });

  it('is not an instrument named for what it does', () => {
    expect(publishedAbout('Personal Data Protection Code of Practice for the Banking Sector')).toBe(false);
    expect(publishedAbout('A Quick Guide To Privacy Notice')).toBe(false);
  });
});

const URL = 'https://regulator.example/uploads/pc-01-2020.pdf';

function stored(portalKind: string, title: string, text: string) {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\",\"en\"]')").run();
  db.prepare("INSERT INTO portal (economy_code, name, url, kind) VALUES ('MYS', 'A portal', 'https://regulator.example', ?)").run(portalKind);
  const { id: portalId } = db.prepare('SELECT id FROM portal').get() as { id: number };
  db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES ('MYS', ?, 'guideline', ?, ?, '2026-09-19')`,
  ).run(title, URL, `portal:${portalId}`);
  const { id: instrumentId } = db.prepare('SELECT id FROM instrument').get() as { id: number };
  const body = Buffer.from(text, 'utf8');
  const fetched: FetchResult = {
    url: URL, finalUrl: URL, status: 200, mediaType: 'application/pdf', body,
    contentHash: createHash('sha256').update(body).digest('hex'), fromCache: false, fetchedAt: '2026-09-19T00:00:00.000Z',
  };
  const parsed: ParsedDocument = {
    extraction: 'pdf-text', text, unread: null, title: null, meta: {}, parser: 'pdf',
    sections: [{ ordinal: 0, headingPath: 'Opening', label: null, text, charStart: 0, charEnd: text.length,
      page: 1, language: 'en', repealed: false, anchor: null }],
  };
  return storeDocument(db, { instrumentId, fetched, parsed });
}

describe('storing a document a regulator filed under a neutral name', () => {
  const paper = 'PUBLIC CONSULTATION PAPER NO. 01/2020 REVIEW OF PERSONAL DATA PROTECTION ACT 2010 (ACT 709) Start Date : 14 February 2020';

  it('refuses a consultation paper, however the page named it', () => {
    const r = stored('regulator', 'PC 01/2020 - Review of Personal Data Protection Act 2010', paper);
    expect(r.unread).toBe(true);
    expect(r.unreadReason?.reason).toBe('not-an-instrument');
  });

  it('does not ask a legislation database, whose titles use these words as names of law', () => {
    const r = stored('legislation-database', 'Freedom of Information (Annual Report) Regulations 2019', 'Annual Report Regulations text');
    expect(r.unread).toBe(false);
  });

  it("reads a regulator's own guidance", () => {
    const r = stored('regulator', 'Guidelines on Data Breach Notification', '1.1 These Guidelines set out the notification a data controller makes.');
    expect(r.unread).toBe(false);
  });
});
