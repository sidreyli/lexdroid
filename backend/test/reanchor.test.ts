/**
 * What a past run cited, held across a re-parse.
 *
 * `reading` and `shortlist_entry` cascade away when a document is re-parsed, and that is right: a
 * finding about a provision whose text has changed is stale. `answer_basis` and `export_row` do
 * not cascade, on purpose -- what a run cited is a record, not a derived value. SQLite then refuses
 * the delete outright, which is how re-parsing Malaysia stopped at the sixth Act with "FOREIGN KEY
 * constraint failed", with 968 citations live across 146 of its documents.
 *
 * So the pointers are parked, and put back against the provision that now carries the same Part,
 * heading and label -- by name and not by position, because the same re-parse gives a code of
 * practice back the clauses each of its Parts restarts numbering at, moving every ordinal after
 * them. An export row's quote offsets index into the document's text, so removing a page header
 * moves those too; they are re-anchored on the snippet the row exported.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { storeDocument } from '../src/parse/index.js';
import { attachCitations, detachCitations } from '../src/run/reanchor.js';
import type { FetchResult } from '../src/fetch/index.js';
import type { ParsedDocument } from '../src/parse/types.js';

const URL = 'https://lom.agc.gov.my/act-588.pdf';
const HEADER = 'Part X GENERAL';

function fetched(body: string): FetchResult {
  const buf = Buffer.from(body, 'utf8');
  return {
    url: URL, finalUrl: URL, status: 200, mediaType: 'application/pdf', body: buf,
    contentHash: createHash('sha256').update(buf).digest('hex'),
    fromCache: true, fetchedAt: '2026-09-17T00:00:00.000Z',
  };
}

/** A parse as a list of [label, text]; offsets are computed the way the builder computes them. */
function parsed(provisions: [string, string][]): ParsedDocument {
  let at = 0;
  const sections = provisions.map(([label, text], ordinal) => {
    const charStart = at;
    at += text.length + 1;
    return {
      ordinal, headingPath: `${HEADER} > ${label}.`, label, text,
      charStart, charEnd: charStart + text.length,
      page: 1, language: 'en', repealed: false, anchor: null,
    };
  });
  return {
    extraction: 'pdf-text', text: provisions.map(([, t]) => t).join('\n'), sections,
    unread: null, title: 'COMMUNICATIONS AND MULTIMEDIA ACT 1998', meta: {}, parser: 'pdf',
  };
}

const POLLUTED = '264. Any content applications service\n137Communications and Multimedia\nprovider shall not be liable.';
const CLEAN = '264. Any content applications service provider shall not be liable.';

function corpus(provisions: [string, string][]): { db: Db; instrumentId: number; documentId: number; cellId: number } {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\",\"en\"]')").run();
  db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES ('MYS', 'COMMUNICATIONS AND MULTIMEDIA ACT 1998', 'act', ?, 'test', '2026-09-17')`,
  ).run(URL);
  const { id: instrumentId } = db.prepare('SELECT id FROM instrument').get() as { id: number };
  const { documentId } = storeDocument(db, { instrumentId, fetched: fetched('bytes'), parsed: parsed(provisions) });

  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1', '2026-09-17', '["MYS"]', '[8]', 'engine-a', 'gemma4-lex-16k', 'cache-only',
             'abc1234', '2026-09-17', 'complete')`,
  ).run();
  db.prepare(
    `INSERT INTO cell (run_id, economy_code, indicator_id, state) VALUES ('r1', 'MYS', '8.2', 'restricted')`,
  ).run();
  const { id: cellId } = db.prepare('SELECT id FROM cell').get() as { id: number };
  return { db, instrumentId, documentId, cellId };
}

function cite(db: Db, cellId: number, instrumentId: number, sectionId: number, snippet: string): void {
  db.prepare(
    `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure)
     VALUES (?, 0, ?, ?, 'liability of an intermediary')`,
  ).run(cellId, instrumentId, sectionId);
  const text = (db.prepare('SELECT text FROM document_text LIMIT 1').get() as { text: string }).text;
  const at = text.indexOf(snippet);
  db.prepare(
    `INSERT INTO export_row (cell_id, economy, law_name, indicator_id, verbatim_snippet,
                             quote_char_start, quote_char_end, section_id, created_at)
     VALUES (?, 'Malaysia', 'Communications and Multimedia Act 1998', '8.2', ?, ?, ?, ?, '2026-09-17')`,
  ).run(cellId, snippet, at, at + snippet.length, sectionId);
}

const sectionIdOf = (db: Db, label: string): number =>
  (db.prepare('SELECT id FROM section WHERE label = ?').get(label) as { id: number }).id;

describe('a citation held across a re-parse', () => {
  it('is what makes the re-parse possible at all', () => {
    // Not a hypothetical: this is the error that stopped the corpus rebuild, and the reason the
    // two recording tables are the two that do not cascade.
    const { db, instrumentId, cellId } = corpus([['263', 'A duty is imposed.'], ['264', POLLUTED]]);
    cite(db, cellId, instrumentId, sectionIdOf(db, '264'), 'shall not be liable');
    expect(() =>
      storeDocument(db, { instrumentId, fetched: fetched('bytes'), parsed: parsed([['263', 'A duty is imposed.'], ['264', CLEAN]]) }),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('comes back on the provision it cited, not on the position it had', () => {
    const { db, instrumentId, cellId } = corpus([['263', 'A duty is imposed.'], ['264', POLLUTED]]);
    cite(db, cellId, instrumentId, sectionIdOf(db, '264'), 'shall not be liable');

    detachCitations(db, 'MYS');
    // The re-parse takes the page header out of s.264 and gives the Part back a clause the old
    // dedupe had dropped, so what was ordinal 1 is now ordinal 2.
    storeDocument(db, {
      instrumentId, fetched: fetched('bytes'),
      parsed: parsed([['263', 'A duty is imposed.'], ['263A', 'A further duty is imposed.'], ['264', CLEAN]]),
    });
    const result = attachCitations(db);

    expect(result).toMatchObject({ restored: 2, byPosition: 0, retired: 0, held: 0 });
    const now = sectionIdOf(db, '264');
    expect((db.prepare('SELECT section_id FROM answer_basis').get() as { section_id: number }).section_id).toBe(now);
    expect((db.prepare('SELECT section_id FROM export_row').get() as { section_id: number }).section_id).toBe(now);
  });

  it('re-anchors an export row on the words it exported', () => {
    // The offsets index into the whole document's text. Removing a page header from the middle of
    // one provision moves every offset after it, so a row left alone would verify against the
    // wrong characters -- which reads as a fabricated quote, the one thing that must never happen.
    const { db, instrumentId, cellId } = corpus([['263', 'A duty is imposed.'], ['264', POLLUTED]]);
    cite(db, cellId, instrumentId, sectionIdOf(db, '264'), 'shall not be liable');

    detachCitations(db, 'MYS');
    storeDocument(db, {
      instrumentId, fetched: fetched('bytes'),
      parsed: parsed([['263', 'A duty is imposed, at greater length than before.'], ['264', CLEAN]]),
    });
    expect(attachCitations(db)).toMatchObject({ reoffset: 1, offsetLost: 0 });

    const row = db.prepare('SELECT verbatim_snippet, quote_char_start, quote_char_end FROM export_row').get() as
      { verbatim_snippet: string; quote_char_start: number; quote_char_end: number };
    const text = (db.prepare('SELECT text FROM document_text').get() as { text: string }).text;
    expect(text.slice(row.quote_char_start, row.quote_char_end)).toBe(row.verbatim_snippet);
  });

  it('finds a quote the export wrote with its whitespace normalised', () => {
    // An exact search is the wrong search. The snippet is stored as one line and the document keeps
    // the line breaks the page was set with, so `indexOf` misses a quote that is plainly there --
    // it reported 317 of Malaysia's 393 export rows missing, and only one of them really was.
    const { db, instrumentId, cellId } = corpus([['264', POLLUTED]]);
    const sectionId = sectionIdOf(db, '264');
    db.prepare(
      `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure)
       VALUES (?, 0, ?, ?, 'liability of an intermediary')`,
    ).run(cellId, instrumentId, sectionId);
    db.prepare(
      `INSERT INTO export_row (cell_id, economy, law_name, indicator_id, verbatim_snippet, section_id, created_at)
       VALUES (?, 'Malaysia', 'Communications and Multimedia Act 1998', '8.2',
               'Any content applications service provider shall not be liable', ?, '2026-09-17')`,
    ).run(cellId, sectionId);

    detachCitations(db, 'MYS');
    storeDocument(db, {
      instrumentId, fetched: fetched('bytes'),
      parsed: parsed([['264', ['264. Any content applications service', 'provider shall not be liable.'].join('\n')]]),
    });
    expect(attachCitations(db)).toMatchObject({ reoffset: 1, offsetLost: 0 });

    const row = db.prepare('SELECT quote_char_start, quote_char_end FROM export_row').get() as
      { quote_char_start: number; quote_char_end: number };
    const text = (db.prepare('SELECT text FROM document_text').get() as { text: string }).text;
    expect(text.slice(row.quote_char_start, row.quote_char_end).replace(/\s+/g, ' '))
      .toBe('Any content applications service provider shall not be liable');
  });

  it('says so when the quote it exported was the page header', () => {
    // A row that quoted across the splice cannot be re-anchored, because those words are no longer
    // in the document. Nulling the offsets and naming it in the discard ledger is the honest end.
    const { db, instrumentId, cellId } = corpus([['264', POLLUTED]]);
    cite(db, cellId, instrumentId, sectionIdOf(db, '264'), 'service\n137Communications and Multimedia\nprovider');

    detachCitations(db, 'MYS');
    storeDocument(db, { instrumentId, fetched: fetched('bytes'), parsed: parsed([['264', CLEAN]]) });
    expect(attachCitations(db)).toMatchObject({ restored: 2, reoffset: 0, offsetLost: 1 });

    const row = db.prepare('SELECT quote_char_start FROM export_row').get() as { quote_char_start: number | null };
    expect(row.quote_char_start).toBeNull();
    const said = db.prepare("SELECT reason FROM discard WHERE stage = 're-parse'").all() as { reason: string }[];
    expect(said.map((d) => d.reason)).toContain('the quote this row exported is not in the document as it now parses');
  });

  it('retires a citation whose provision the new parse does not produce', () => {
    const { db, instrumentId, cellId } = corpus([['263', 'A duty is imposed.'], ['264', POLLUTED]]);
    cite(db, cellId, instrumentId, sectionIdOf(db, '264'), 'shall not be liable');

    detachCitations(db, 'MYS');
    storeDocument(db, { instrumentId, fetched: fetched('bytes'), parsed: parsed([['263', 'A duty is imposed.']]) });
    const result = attachCitations(db);

    expect(result).toMatchObject({ restored: 0, retired: 2, held: 0 });
    // Nothing is left pointing at a provision the corpus has not got.
    expect((db.prepare('SELECT COUNT(*) c FROM answer_basis WHERE section_id IS NOT NULL').get() as { c: number }).c).toBe(0);
    const said = db.prepare("SELECT reason FROM discard WHERE stage = 're-parse'").all() as { reason: string }[];
    expect(said).toHaveLength(2);
    expect(said[0]?.reason).toBe('the re-parse does not produce the provision this cited');
  });

  it('releases the reading behind an export row, which cannot come back', () => {
    // The second blocker, found the same way as the first: a section's readings cascade away with
    // it, and `export_row.reading_id` does not cascade, so it refuses that cascade in turn. Unlike
    // the section, the reading has nothing to be restored to -- the provision is read again.
    const { db, instrumentId, cellId } = corpus([['264', POLLUTED]]);
    const sectionId = sectionIdOf(db, '264');
    cite(db, cellId, instrumentId, sectionId, 'shall not be liable');
    db.prepare(
      `INSERT INTO reading (cell_id, section_id, engine, model, applies, quote, read_at)
       VALUES (?, ?, 'engine-a', 'gemma4-lex-16k', 1, 'shall not be liable', '2026-09-17')`,
    ).run(cellId, sectionId);
    const { id: readingId } = db.prepare('SELECT id FROM reading').get() as { id: number };
    db.prepare('UPDATE export_row SET reading_id = ?').run(readingId);

    expect(detachCitations(db, 'MYS')).toMatchObject({ readingsReleased: 1 });
    expect(() =>
      storeDocument(db, { instrumentId, fetched: fetched('bytes'), parsed: parsed([['264', CLEAN]]) }),
    ).not.toThrow();
    const said = db.prepare("SELECT reason FROM discard WHERE stage = 're-parse'").all() as { reason: string }[];
    expect(said.map((d) => d.reason))
      .toContain('the reading behind this row is re-read by the re-parse and cannot be pointed at again');
  });

  it('parks only the economy being re-parsed', () => {
    // Malaysia is re-parsed and Australia is not, so Australia's citations never move.
    const { db, instrumentId, cellId } = corpus([['264', POLLUTED]]);
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('AUS','Australia','[\"en\"]')").run();
    cite(db, cellId, instrumentId, sectionIdOf(db, '264'), 'shall not be liable');

    expect(detachCitations(db, 'AUS')).toMatchObject({ parked: { answer_basis: 0, export_row: 0 }, held: 0 });
    expect((db.prepare('SELECT COUNT(*) c FROM answer_basis WHERE section_id IS NOT NULL').get() as { c: number }).c).toBe(1);
  });
});
