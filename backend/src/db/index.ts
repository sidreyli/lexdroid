/**
 * The working store.
 *
 * One SQLite file holds everything a run produces. ESCAP's completed databases are deliberately
 * NOT reachable from here -- they live in a second file that only src/baseline may open. See
 * src/baseline/README.md for why that boundary exists.
 */
import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalizeThai } from '../util/thai.js';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..', '..');

/**
 * The store every command opens, and the one place it can be pointed elsewhere.
 *
 * Scoring is a pure function of stored readings, so `grade` and `rescore` want to run against a
 * finished corpus at the very moment a run is busy writing to it -- and a run holds the write
 * lock for hours, which is long enough that "wait for it" means "do not do it". Pointing this at
 * a snapshot taken with `VACUUM INTO` (a read lock only, so the run is undisturbed) makes the
 * edit-grade-keep-or-revert loop available during a run instead of only between runs.
 *
 * Unset in normal use. A run writing somewhere unexpected would be worse than not running, so
 * this is opt-in, names the store in the variable, and is never defaulted to a copy.
 */
export const WORKING_DB_PATH =
  process.env['LEXDROID_DB'] ?? join(backendRoot, 'data', 'lexdroid.db');
const SCHEMA_PATH = join(here, 'schema.sql');

export type Db = Database.Database;

let handle: Db | null = null;

export function openDb(path: string = WORKING_DB_PATH): Db {
  if (handle && path === WORKING_DB_PATH) return handle;

  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Stages overlap: crawling one economy waits on the network while another is on the GPU.
  // Without this a second writer fails outright instead of waiting its turn.
  db.pragma('busy_timeout = 30000');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  addMissingColumns(db);
  keyConfirmationsByQuestion(db);

  if (path === WORKING_DB_PATH) handle = db;
  return db;
}

/**
 * Columns added to a table that already exists.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that is already there, so a new column in
 * schema.sql reaches a fresh database and silently misses every existing one. The failure is
 * quiet in the worst way -- the code reads a column the store does not have, and the store in
 * question is the one holding a corpus that took hours to fetch.
 *
 * Deliberately not a migration framework. Each entry is additive and nullable, applied when
 * absent, and a store that has diverged further than this can handle is rebuilt rather than
 * patched.
 */
const ADDED_COLUMNS: readonly { table: string; column: string; type: string }[] = [
  { table: 'section', column: 'anchor', type: 'TEXT' },
  { table: 'section', column: 'repealed', type: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'instrument', column: 'title_provisional', type: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'instrument', column: 'also_at', type: 'TEXT' },
  { table: 'instrument', column: 'made_under_instrument_id', type: 'INTEGER' },
  { table: 'instrument', column: 'made_under_basis', type: 'TEXT' },
  { table: 'instrument', column: 'current_to', type: 'TEXT' },
  { table: 'instrument', column: 'made_under_name', type: 'TEXT' },
  { table: 'cell', column: 'queries', type: 'TEXT' },
  { table: 'cell', column: 'depth', type: 'INTEGER' },
  { table: 'cell', column: 'surfaced', type: 'INTEGER' },
  { table: 'cell', column: 'sections_indexed', type: 'INTEGER' },
  { table: 'cell', column: 'sections_read', type: 'INTEGER' },
  { table: 'cell', column: 'governing', type: 'TEXT' },
  { table: 'cell', column: 'surfaced_instruments', type: 'TEXT' },
  { table: 'cell', column: 'framework_failed', type: 'INTEGER' },
  { table: 'cell_answer', column: 'absence_basis', type: 'TEXT' },
  { table: 'reading', column: 'engine_call', type: 'TEXT' },
  { table: 'cell_answer', column: 'rationale', type: 'TEXT' },
  { table: 'export_row', column: 'quote_char_start', type: 'INTEGER' },
  { table: 'export_row', column: 'quote_char_end', type: 'INTEGER' },
  { table: 'framework_reading', column: 'framework_words', type: 'TEXT' },
  { table: 'framework_reading', column: 'framework_shown', type: 'INTEGER' },
  { table: 'framework_reading', column: 'dedicated_words', type: 'TEXT' },
  { table: 'framework_reading', column: 'dedicated_shown', type: 'INTEGER' },
  { table: 'framework_reading', column: 'sector_words', type: 'TEXT' },
  { table: 'framework_reading', column: 'sectoral_shown', type: 'INTEGER' },
  { table: 'run', column: 'fx_rates', type: 'TEXT' },
  { table: 'cell_answer', column: 'confirmations_asked', type: 'INTEGER' },
  { table: 'cell_answer', column: 'confirmations_applied', type: 'INTEGER' },
  { table: 'answer_basis', column: 'quote', type: 'TEXT' },
  { table: 'reading', column: 'rejected', type: 'INTEGER' },
  { table: 'reading', column: 'unreadable', type: 'INTEGER' },
  { table: 'unread_document', column: 'attempts', type: 'INTEGER NOT NULL DEFAULT 1' },
  { table: 'run_cost', column: 'usd_unknown', type: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'fetch_log', column: 'method', type: "TEXT NOT NULL DEFAULT 'GET'" },
];

function addMissingColumns(db: Db): void {
  for (const { table, column, type } of ADDED_COLUMNS) {
    const exists = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
      (c) => c.name === column,
    );
    if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/**
 * The one change here that is not a new column: measure_confirmation's key.
 *
 * It was unique on the provision and the measure's name, so a verdict could only ever be replaced
 * -- asking again under a changed description overwrote the answer to the old one, and not asking
 * again served the old answer as the new one's. The key now includes the question and the model.
 * SQLite cannot change a table's constraints in place, so the table is rebuilt once, inside a
 * transaction, with every row carried across unchanged and `question` NULL: those verdicts were
 * banked before anyone recorded what they answered, and are never consulted until something that
 * knows says which question they were.
 */
function keyConfirmationsByQuestion(db: Db): void {
  const cols = (db.prepare('PRAGMA table_info(measure_confirmation)').all() as { name: string }[]).map((c) => c.name);
  if (cols.includes('question')) return;
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      const before = (db.prepare('SELECT COUNT(*) AS n FROM measure_confirmation').get() as { n: number }).n;
      db.exec(`
        CREATE TABLE measure_confirmation_keyed (
          id              INTEGER PRIMARY KEY,
          section_id      INTEGER NOT NULL REFERENCES section(id) ON DELETE CASCADE,
          indicator_id    TEXT NOT NULL,
          measure         TEXT NOT NULL,
          question        TEXT,
          words           TEXT,
          failure         TEXT,
          model           TEXT NOT NULL,
          prompt_tokens   INTEGER,
          output_tokens   INTEGER,
          latency_ms      INTEGER,
          asked_at        TEXT NOT NULL,
          UNIQUE (section_id, indicator_id, measure, model, question)
        );
        INSERT INTO measure_confirmation_keyed
          (id, section_id, indicator_id, measure, question, words, failure, model,
           prompt_tokens, output_tokens, latency_ms, asked_at)
        SELECT id, section_id, indicator_id, measure, NULL, words, failure, model,
               prompt_tokens, output_tokens, latency_ms, asked_at
          FROM measure_confirmation;
        DROP TABLE measure_confirmation;
        ALTER TABLE measure_confirmation_keyed RENAME TO measure_confirmation;
        CREATE INDEX IF NOT EXISTS idx_confirmation_measure ON measure_confirmation(indicator_id, measure);
        CREATE INDEX IF NOT EXISTS idx_measure_confirmation_section ON measure_confirmation(section_id);
      `);
      const after = (db.prepare('SELECT COUNT(*) AS n FROM measure_confirmation').get() as { n: number }).n;
      if (after !== before) throw new Error(`measure_confirmation rebuild kept ${after} of ${before} rows`);
    })();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

export function closeDb(): void {
  handle?.close();
  handle = null;
}

/**
 * Put one document's sections into the corpus-wide lexical index.
 *
 * Indexing is an explicit step the parser calls once per document rather than a trigger, so a
 * bulk parse is one transaction instead of one per row. Safe to call again on the same document:
 * each section is deleted from the index before it is re-inserted.
 */
export function indexSections(db: Db, documentId: number): number {
  const rows = db
    .prepare('SELECT id, text, heading_path FROM section WHERE document_id = ?')
    .all(documentId) as { id: number; text: string; heading_path: string }[];

  const del = db.prepare('DELETE FROM section_fts WHERE rowid = ?');
  const ins = db.prepare('INSERT INTO section_fts(rowid, text, heading_path) VALUES (?, ?, ?)');

  // Normalised only in this copy, not in `section` itself: section.text is the citation's ground
  // truth and verifyOffsets (parse/index.ts) depends on it staying byte-identical to the slice
  // char_start/char_end point at in document_text. section_fts has no such offset to preserve, and
  // is exactly where normalization belongs -- a script with combining marks (Thai's SARA AM
  // ambiguity included, see util/thai.ts) can represent the same visible text as different byte
  // sequences depending on the source CMS, PDF extractor or OCR engine, and a trigram index built
  // from one form silently fails to match a query typed in the other unless both sides are
  // canonicalised the same way. The query side is normalised in index/index.ts's
  // ftsQuery/ftsPhrase.
  const normalize = (s: string): string => canonicalizeThai(s.normalize('NFC'));

  db.transaction(() => {
    for (const r of rows) {
      del.run(r.id);
      ins.run(r.id, normalize(r.text), normalize(r.heading_path));
    }
  })();
  return rows.length;
}

/** The trigram index cannot match a term shorter than this. Enforced where queries are built. */
export const MIN_TRIGRAM_TERM = 3;
