import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { storeDocument } from '../src/parse/index.js';
import type { FetchResult } from '../src/fetch/index.js';
import type { ParsedDocument } from '../src/parse/types.js';

const URL = 'https://sso.agc.gov.sg/SL/GSTA1993-OR3';

function fetched(body: string): FetchResult {
  const buf = Buffer.from(body, 'utf8');
  return {
    url: URL, finalUrl: URL, status: 200, mediaType: 'text/html', body: buf,
    contentHash: createHash('sha256').update(buf).digest('hex'),
    fromCache: false, fetchedAt: '2026-09-12T00:00:00.000Z',
  };
}

function parsed(texts: string[]): ParsedDocument {
  let at = 0;
  const sections = texts.map((text, ordinal) => {
    const charStart = at;
    at += text.length + 1;
    return { ordinal, headingPath: `Order > ${text}`, label: String(ordinal + 1), text,
      charStart, charEnd: charStart + text.length, page: null, language: null, repealed: false, anchor: null };
  });
  return { extraction: 'html', text: texts.join('\n'), sections, unread: null,
    title: 'Goods and Services Tax (Imports Relief) Order 1994', meta: {}, parser: 'sso' };
}

function register() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
  db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES ('SGP', 'Goods and Services Tax (Imports Relief) Order 1994', 'order', ?, 'test', '2026-09-12')`,
  ).run(URL);
  const { id } = db.prepare('SELECT id FROM instrument').get() as { id: number };
  return { db, instrumentId: id };
}

describe('reading the same address again', () => {
  it('supersedes the earlier reading instead of standing beside it', () => {
    const { db, instrumentId } = register();
    const first = storeDocument(db, { instrumentId, fetched: fetched('<p>five</p>'), parsed: parsed(['Citation', 'Definitions']) });
    const second = storeDocument(db, { instrumentId, fetched: fetched('<p>twelve</p>'), parsed: parsed(['Citation', 'Definitions', 'THE SCHEDULE']) });

    expect(second.documentId).not.toBe(first.documentId);
    const docs = db.prepare('SELECT id FROM document WHERE instrument_id = ?').all(instrumentId) as { id: number }[];
    expect(docs.map((d) => d.id)).toEqual([second.documentId]);
  });

  it('leaves no provision behind to be retrieved twice', () => {
    const { db, instrumentId } = register();
    storeDocument(db, { instrumentId, fetched: fetched('<p>five</p>'), parsed: parsed(['Citation', 'Definitions']) });
    storeDocument(db, { instrumentId, fetched: fetched('<p>twelve</p>'), parsed: parsed(['Citation', 'Definitions', 'THE SCHEDULE']) });

    const texts = db.prepare(
      `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id WHERE d.instrument_id = ?`,
    ).all(instrumentId) as { text: string }[];
    expect(texts.map((t) => t.text)).toEqual(['Citation', 'Definitions', 'THE SCHEDULE']);
  });

  it('keeps the other editions the same instrument is published at', () => {
    const { db, instrumentId } = register();
    const english = storeDocument(db, { instrumentId, fetched: fetched('<p>en</p>'), parsed: parsed(['Citation']) });
    const other = { ...fetched('<p>ms</p>'), url: `${URL}?lang=ms`, finalUrl: `${URL}?lang=ms` };
    const malay = storeDocument(db, { instrumentId, fetched: other, parsed: parsed(['Petikan']) });

    const docs = db.prepare('SELECT id FROM document WHERE instrument_id = ? ORDER BY id').all(instrumentId) as { id: number }[];
    expect(docs.map((d) => d.id)).toEqual([english.documentId, malay.documentId]);
  });
});

describe('storing a document that has not changed (F10)', () => {
  it('keeps its sections, and every reading that cites one', () => {
    const { db, instrumentId } = register();
    const first = storeDocument(db, { instrumentId, fetched: fetched('<p>five</p>'), parsed: parsed(['Citation', 'Definitions']) });
    const ids = (db.prepare('SELECT id FROM section ORDER BY ordinal').all() as { id: number }[]).map((r) => r.id);
    db.exec(`INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode, code_revision, rubric_derived_at, status)
               VALUES ('r', 'now', '["SGP"]', '[7]', 'engine-a', 'm', 'fetch', 'x', 'now', 'complete');
             INSERT INTO cell (id, run_id, economy_code, indicator_id) VALUES (1, 'r', 'SGP', '7.3');`);
    db.prepare(`INSERT INTO reading (cell_id, section_id, engine, model, applies, read_at) VALUES (1, ?, 'engine-a', 'm', 0, 'now')`).run(ids[0]);

    const again = storeDocument(db, { instrumentId, fetched: fetched('<p>five</p>'), parsed: parsed(['Citation', 'Definitions']) });
    expect(again.documentId).toBe(first.documentId);
    expect((db.prepare('SELECT id FROM section ORDER BY ordinal').all() as { id: number }[]).map((r) => r.id)).toEqual(ids);
    expect(db.prepare('SELECT count(*) n FROM reading').get()).toEqual({ n: 1 });
    db.close();
  });

  it('still replaces the sections when the parse of the same bytes has changed', () => {
    const { db, instrumentId } = register();
    storeDocument(db, { instrumentId, fetched: fetched('<p>five</p>'), parsed: parsed(['Citation', 'Definitions']) });
    storeDocument(db, { instrumentId, fetched: fetched('<p>five</p>'), parsed: parsed(['Citation', 'Definitions', 'Schedule']) });
    expect(db.prepare('SELECT count(*) n FROM section').get()).toEqual({ n: 3 });
    db.close();
  });
});
