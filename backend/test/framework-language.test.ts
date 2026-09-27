/**
 * A framework row states what language its instrument is in.
 *
 * Four paths build export rows, and three of them put the answer through `languageOf`: what the
 * parser recorded for the provision, then what the portal said about the instrument, then the words
 * themselves read against the languages the economy publishes law in. The framework path passed the
 * portal's answer straight out and stopped there.
 *
 * So a framework row whose instrument carried no declared language went to ESCAP blank, while
 * holding a quotation plainly in one -- seven of them in run 82673dbf, all reading "An Act to
 * provide for the protection of consumers" or similar. Language of Source is the column ESCAP added
 * for this round and the evidence for C1c; a blank there is a row that cannot answer it.
 *
 * The same shape as the 300-character rationale cap that two paths bypassed: the ladder was right
 * and one caller did not climb it.
 */
import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { buildExportRows } from '../src/export/index.js';

const LONG_TITLE =
  'An Act to provide for the protection of consumers, the establishment of the National Consumer ' +
  'Advisory Council and the Tribunal for Consumer Claims, and for matters connected therewith.';

const MALAY_TITLE =
  'Suatu Akta untuk mengadakan peruntukan bagi perlindungan pengguna, penubuhan Majlis Penasihat ' +
  'Pengguna Kebangsaan dan Tribunal bagi Tuntutan Pengguna, dan bagi perkara yang berkaitan dengannya.';

/** A cell answered by a framework instrument rather than by any provision of it. */
function frameworkCell(db: Db, opts: { language: string | null; quote: string }): void {
  db.prepare(
    `INSERT INTO instrument (id, economy_code, title, kind, source_url, language,
                             discovered_via, discovered_at)
     VALUES (1, 'MYS', 'Consumer Protection Act 1999', 'act',
             'https://lom.agc.gov.my/act-view.php?language=BI&art_id=599', ?, 'portal',
             '2026-09-16T00:00:00Z')`,
  ).run(opts.language);

  const info = db
    .prepare(
      `INSERT INTO cell (run_id, economy_code, indicator_id, state)
       VALUES ('r1', 'MYS', '12.9', 'restricted')`,
    )
    .run();
  const cellId = Number(info.lastInsertRowid);

  db.prepare(
    `INSERT INTO cell_answer (cell_id, score, rationale, controlling_instrument_id, computed_at)
     VALUES (?, 0, 'a consumer protection framework applies to online transactions', 1,
             '2026-09-16T00:00:00Z')`,
  ).run(cellId);
  // section_id null is what makes it a framework basis: the instrument is the citation.
  db.prepare(
    `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure)
     VALUES (?, 1, 1, NULL, NULL)`,
  ).run(cellId);
  db.prepare(
    `INSERT INTO framework_reading (cell_id, instrument_id, engine, model, establishes_framework,
                                    quote, quote_verified, read_at)
     VALUES (?, 1, 'engine-a', 'm', 1, ?, 1, '2026-09-16T00:00:00Z')`,
  ).run(cellId, opts.quote);
}

function store(): Db {
  const db = openDb(':memory:');
  const now = '2026-09-16T00:00:00Z';
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1', ?, '["MYS"]', '[12]', 'engine-a', 'm', 'fetch', 'abc', ?, 'complete')`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO economy (code, name, official_languages) VALUES ('MYS', 'Malaysia', '["ms","en"]')`,
  ).run();
  return db;
}

function languages(db: Db): (string | null)[] {
  return (
    db.prepare(`SELECT language_of_source FROM export_row`).all() as { language_of_source: string | null }[]
  ).map((r) => r.language_of_source);
}

describe('the language of a framework row', () => {
  it('reads it out of the quotation when the portal declared none', () => {
    const db = store();
    frameworkCell(db, { language: null, quote: LONG_TITLE });
    buildExportRows(db, 'r1');
    expect(languages(db)).toEqual(['en']);
    db.close();
  });

  it('tells a Malay long title from an English one', () => {
    // The pairing that makes this worth doing: the same Act, both languages authoritative, and
    // nothing but the words to separate them.
    const db = store();
    frameworkCell(db, { language: null, quote: MALAY_TITLE });
    buildExportRows(db, 'r1');
    expect(languages(db)).toEqual(['ms']);
    db.close();
  });

  it('still prefers what the portal declared over anything inferred', () => {
    // The portal knows which of its two language editions it served. Detection is the fallback,
    // not the authority -- an English translation of a Malay Act is published as English.
    const db = store();
    frameworkCell(db, { language: 'en', quote: MALAY_TITLE });
    buildExportRows(db, 'r1');
    expect(languages(db)).toEqual(['en']);
    db.close();
  });

  it('leaves it blank rather than guess at a fragment', () => {
    // A wrong statement about a source document is worse than a missing one. Two words cannot
    // settle a language and the column says so by staying empty.
    const db = store();
    frameworkCell(db, { language: null, quote: 'An Act.' });
    buildExportRows(db, 'r1');
    expect(languages(db)).toEqual([null]);
    db.close();
  });
});
