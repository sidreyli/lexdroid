/**
 * Cut a benchmark pack: the named runs, and everything their cells touch, in a database small
 * enough to hand to someone.
 *
 *   LEXDROID_DB=data/lexdroid.india.db npm run -w backend bench-pack -- \
 *     --run 283f457e --run 78642831 --out ../bench/lexdroid.bench-ind.db
 *
 * A working database is ~4 GB, and most of it is what retrieval searches: section vectors, heading
 * vectors, the lexical index and instrument vectors. None of that is needed to re-read a run's
 * cells with a changed reader, because the run recorded what its retrieval returned and
 * `--retrieval-from` replays it (retrieve/replay.ts). What a pack keeps:
 *
 *   - the runs and every row hung on their cells: shortlist, readings, answers, bases, framework
 *     readings, export rows and their gate results
 *   - every provision those rows name, the documents they sit in and those documents' full text
 *     (quote offsets index into it), and the opening provisions of each instrument examined as a
 *     framework, which is what a framework reading is shown
 *   - the banked second-reading verdicts for those provisions, which scoring consults
 *   - the whole register for the runs' economies, because decide asks it about instruments no
 *     provision was read from (currency dates, kinds, the parent Act of a regulation)
 *
 * The pack's lexical index covers the provisions it holds, and it has no vectors, so a pack can
 * replay and rescore but cannot search: a retrieval change still needs the working database.
 */
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDb } from '../src/db/index.js';

const argv = process.argv.slice(2);
const all = (name: string): string[] => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1] ?? ''] : []));
const out = all('out')[0];
const wanted = all('run');
if (!out || wanted.length === 0) {
  console.error('usage: bench-pack --run <id> [--run <id> ...] --out <path>');
  process.exit(2);
}

const src = openDb();
const runs = wanted.map((w) => {
  const row = src.prepare('SELECT id, economies FROM run WHERE id LIKE ?').get(`${w}%`) as
    | { id: string; economies: string }
    | undefined;
  if (!row) {
    console.error(`No run ${w} in ${process.env['LEXDROID_DB'] ?? 'the working database'}.`);
    process.exit(1);
  }
  return row;
});
const economies = [...new Set(runs.flatMap((r) => JSON.parse(r.economies) as string[]))];
const srcPath = src.name;
src.close();

const outPath = resolve(out);
for (const suffix of ['', '-wal', '-shm']) if (existsSync(outPath + suffix)) rmSync(outPath + suffix);
const db = openDb(outPath);
db.pragma('foreign_keys = OFF');
db.pragma('journal_mode = DELETE');
db.exec(`ATTACH DATABASE '${srcPath.replace(/'/g, "''")}' AS src`);

const inList = (xs: readonly string[]) => xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(',');
const RUNS = inList(runs.map((r) => r.id));
const ECONOMIES = inList(economies);

/** Columns both stores have, in the pack's order: an older working store may lack a newer column. */
function columns(table: string): string {
  const mine = (db.prepare(`PRAGMA main.table_info("${table}")`).all() as { name: string }[]).map((c) => c.name);
  const theirs = new Set((db.prepare(`PRAGMA src.table_info("${table}")`).all() as { name: string }[]).map((c) => c.name));
  return mine.filter((c) => theirs.has(c)).map((c) => `"${c}"`).join(', ');
}

function copy(table: string, where: string): void {
  const cols = columns(table);
  // A table the source store predates has nothing to copy.
  if (!cols) {
    console.log(`  ${table.padEnd(22)} (not in the source)`);
    return;
  }
  const n = db.prepare(`INSERT OR IGNORE INTO main."${table}" (${cols}) SELECT ${cols} FROM src."${table}" WHERE ${where}`).run().changes;
  console.log(`  ${table.padEnd(22)} ${n}`);
}

const started = Date.now();
console.log(`Packing ${runs.map((r) => r.id.slice(0, 8)).join(', ')} (${economies.join(', ')}) from ${srcPath}`);

db.transaction(() => {
  // The sets everything else is cut by, built once in temporary tables.
  db.exec(`
    CREATE TEMP TABLE pack_cell AS SELECT id FROM src.cell WHERE run_id IN (${RUNS});
    CREATE TEMP TABLE pack_section (id INTEGER PRIMARY KEY);
    INSERT OR IGNORE INTO pack_section SELECT section_id FROM src.shortlist_entry WHERE cell_id IN (SELECT id FROM pack_cell);
    INSERT OR IGNORE INTO pack_section SELECT section_id FROM src.reading WHERE cell_id IN (SELECT id FROM pack_cell);
    INSERT OR IGNORE INTO pack_section SELECT section_id FROM src.answer_basis WHERE cell_id IN (SELECT id FROM pack_cell) AND section_id IS NOT NULL;
    INSERT OR IGNORE INTO pack_section SELECT section_id FROM src.export_row WHERE cell_id IN (SELECT id FROM pack_cell) AND section_id IS NOT NULL;
    INSERT OR IGNORE INTO pack_section
      SELECT id FROM (
        SELECT s.id, ROW_NUMBER() OVER (PARTITION BY d.instrument_id ORDER BY d.id, s.ordinal) AS n
          FROM src.section s JOIN src.document d ON d.id = s.document_id
         WHERE d.instrument_id IN (SELECT instrument_id FROM src.framework_reading WHERE cell_id IN (SELECT id FROM pack_cell))
      ) WHERE n <= 6;
    CREATE TEMP TABLE pack_document AS
      SELECT DISTINCT document_id AS id FROM src.section WHERE id IN (SELECT id FROM pack_section);
  `);

  copy('economy', '1');
  copy('portal', '1');
  copy('commitment', '1');
  copy('instrument', `economy_code IN (${ECONOMIES})`);
  copy('document', 'id IN (SELECT id FROM pack_document)');
  copy('document_text', 'document_id IN (SELECT id FROM pack_document)');
  copy('section', 'id IN (SELECT id FROM pack_section)');
  copy('run', `id IN (${RUNS})`);
  copy('run_cost', `run_id IN (${RUNS})`);
  copy('run_stage', `run_id IN (${RUNS})`);
  copy('cell', 'id IN (SELECT id FROM pack_cell)');
  copy('cell_answer', 'cell_id IN (SELECT id FROM pack_cell)');
  copy('shortlist_entry', 'cell_id IN (SELECT id FROM pack_cell)');
  copy('reading', 'cell_id IN (SELECT id FROM pack_cell)');
  copy('answer_basis', 'cell_id IN (SELECT id FROM pack_cell)');
  copy('framework_reading', 'cell_id IN (SELECT id FROM pack_cell)');
  copy('export_row', 'cell_id IN (SELECT id FROM pack_cell)');
  copy('gate_result', `export_row_id IN (SELECT id FROM src.export_row WHERE cell_id IN (SELECT id FROM pack_cell))`);
  copy('measure_confirmation', 'section_id IN (SELECT id FROM pack_section)');
  copy('cited_reading', 'section_id IN (SELECT id FROM pack_section) AND from_section_id IN (SELECT id FROM pack_section)');
  copy('headed_reading', 'section_id IN (SELECT id FROM pack_section)');

  const fts = db
    .prepare('INSERT INTO section_fts (rowid, text, heading_path) SELECT id, text, heading_path FROM main.section')
    .run().changes;
  console.log(`  ${'section_fts'.padEnd(22)} ${fts}`);
})();

db.exec('DETACH DATABASE src');
db.pragma('foreign_keys = ON');
const broken = db.prepare('PRAGMA foreign_key_check').all() as { table: string; parent: string }[];
if (broken.length > 0) {
  const tally = new Map<string, number>();
  for (const b of broken) tally.set(`${b.table} -> ${b.parent}`, (tally.get(`${b.table} -> ${b.parent}`) ?? 0) + 1);
  console.log(`  foreign keys left dangling: ${[...tally].map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
db.exec('VACUUM');
db.close();
console.log(`Wrote ${outPath} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
