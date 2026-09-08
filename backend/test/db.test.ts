/**
 * The working store: the shape the whole run is recorded in.
 */
import { describe, expect, it } from 'vitest';
import { openDb, indexSections } from '../src/db/index.js';

function tmpDb() {
  return openDb(':memory:');
}

describe('schema', () => {
  it('creates every table a run writes to', () => {
    const db = tmpDb();
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[])
      .map((t) => t.name);
    for (const t of [
      'run', 'run_cost', 'economy', 'portal', 'commitment', 'instrument', 'document',
      'unread_document', 'section', 'section_embedding', 'fetch_log', 'cell', 'shortlist_entry',
      'instrument_contents', 'heading_embedding',
      'reading', 'framework_reading', 'cell_answer', 'export_row', 'gate_result', 'discard',
      'review_action',
    ]) {
      expect(tables, `missing table ${t}`).toContain(t);
    }
    db.close();
  });

  it('refuses a cell state outside the three we allow', () => {
    const db = tmpDb();
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
    db.prepare(
      `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                        code_revision, rubric_derived_at, status)
       VALUES ('r1','2026-09-06T00:00:00Z','["SGP"]','all','engine-a','m','fetch','abc','x','running')`,
    ).run();
    const insert = db.prepare(
      "INSERT INTO cell (run_id, economy_code, indicator_id, state) VALUES ('r1','SGP','6.2',?)",
    );
    expect(() => insert.run('probably')).toThrow();
    expect(() => insert.run('no-restriction')).not.toThrow();
    db.close();
  });

  it('refuses a source mode outside fetch and cache-only', () => {
    const db = tmpDb();
    const insert = db.prepare(
      `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                        code_revision, rubric_derived_at, status)
       VALUES (?, '2026-09-06T00:00:00Z','[]','all','e','m',?,'abc','x','running')`,
    );
    expect(() => insert.run('r-bad', 'offline')).toThrow();
    expect(() => insert.run('r-ok', 'cache-only')).not.toThrow();
    db.close();
  });

  it('keeps indicator ids as text', () => {
    const db = tmpDb();
    const col = (db.prepare('PRAGMA table_info(cell)').all() as { name: string; type: string }[])
      .find((c) => c.name === 'indicator_id');
    expect(col?.type).toBe('TEXT');
    db.close();
  });
});

describe('the corpus-wide lexical index', () => {
  function seed(db: ReturnType<typeof openDb>, texts: string[]) {
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('XXX','Test','[\"en\"]')").run();
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, source_url, discovered_via, discovered_at)
       VALUES (1,'XXX','Test Act','http://example.gov/a','portal','2026-09-06T00:00:00Z')`,
    ).run();
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (1,1,'http://example.gov/a','h','text/html',1,200,'2026-09-06T00:00:00Z')`,
    ).run();
    const ins = db.prepare(
      `INSERT INTO section (document_id, ordinal, heading_path, text, char_start, char_end)
       VALUES (1, ?, ?, ?, 0, 0)`,
    );
    texts.forEach((t, i) => ins.run(i, `Part I > s. ${i + 1}`, t));
    return indexSections(db, 1);
  }

  it('searches non-Latin text, which a word tokenizer silently cannot', () => {
    // v1 tokenized [a-z0-9]+, so Thai, Chinese and Cyrillic documents produced an empty token
    // list and search switched itself off for them without saying so.
    const db = tmpDb();
    seed(db, [
      'ผู้ควบคุมข้อมูลส่วนบุคคลต้องเก็บรักษาข้อมูล',
      '个人信息处理者应当在中华人民共和国境内存储',
      'Оператор обязан обеспечить запись персональных данных',
      'The data controller must store personal data within Singapore.',
    ]);
    const hits = (q: string) =>
      (db.prepare('SELECT rowid FROM section_fts WHERE section_fts MATCH ?').all(q) as unknown[]).length;

    expect(hits('"ข้อมูลส่วนบุคคล"')).toBeGreaterThan(0);
    expect(hits('"个人信息"')).toBeGreaterThan(0);
    expect(hits('"персональных"')).toBeGreaterThan(0);
    expect(hits('"personal data"')).toBeGreaterThan(0);
    db.close();
  });

  it('reindexes a document without duplicating its sections', () => {
    const db = tmpDb();
    seed(db, ['storage requirement', 'another section']);
    indexSections(db, 1);
    indexSections(db, 1);
    const hits = db.prepare("SELECT rowid FROM section_fts WHERE section_fts MATCH '\"storage\"'").all();
    expect(hits).toHaveLength(1);
    db.close();
  });
});
