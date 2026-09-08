/**
 * Read a run back.
 *
 *   npm run -w backend runs                    every run, newest first
 *   npm run -w backend runs -- --run <id>      one run's cells and what each rests on
 *   npm run -w backend runs -- --run <id> --cell 7.4
 *
 * The point of this script is small and worth stating: it proves the record is a record. Nothing
 * here recomputes anything, no model is called, and the store is opened read-only -- so what it
 * prints is what a reviewer, an exporter or a second engine's comparison would see.
 */
import Database from 'better-sqlite3';
import { WORKING_DB_PATH } from '../src/db/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const db = new Database(WORKING_DB_PATH, { readonly: true });
const runId = arg('run');
const only = arg('cell');

if (!runId) {
  const runs = db
    .prepare(
      `SELECT r.id, r.started_at, r.finished_at, r.status, r.economies, r.pillars, r.engine_model,
              r.code_revision, r.notes,
              (SELECT COUNT(*) FROM cell c WHERE c.run_id = r.id) cells
         FROM run r ORDER BY r.started_at DESC LIMIT 25`,
    )
    .all() as Record<string, string | number | null>[];

  if (runs.length === 0) {
    console.log('No runs recorded yet.');
  } else {
    for (const r of runs) {
      const when = String(r['started_at']).slice(0, 16).replace('T', ' ');
      console.log(
        `${r['id']}  ${when}  ${String(r['status']).padEnd(9)} ${String(r['cells']).padStart(3)} cells  ` +
          `${JSON.parse(String(r['economies'])).join(',')} pillars ${String(r['pillars'])}  ` +
          `${r['engine_model']}  code ${r['code_revision']}${r['notes'] ? `  (${r['notes']})` : ''}`,
      );
    }
    console.log('\nRead one with: npm run -w backend runs -- --run <id>');
  }
  db.close();
  process.exit(0);
}

const run = db.prepare('SELECT * FROM run WHERE id = ?').get(runId) as Record<string, string> | undefined;
if (!run) {
  console.error(`No run ${runId}`);
  process.exit(1);
}

console.log(`run ${run['id']}`);
console.log(`  ${run['started_at']} -> ${run['finished_at'] ?? '(unfinished)'}  ${run['status']}`);
console.log(`  engine ${run['engine']} / ${run['engine_model']}, source ${run['source_mode']}, code ${run['code_revision']}`);
console.log(`  rubric derived ${run['rubric_derived_at']}`);

const cost = db.prepare('SELECT * FROM run_cost WHERE run_id = ?').all(runId) as Record<string, number | string>[];
for (const c of cost) {
  console.log(
    `  cost: ${c['calls']} call(s), ${c['prompt_tokens']} prompt + ${c['output_tokens']} output tokens, ` +
      `${Number(c['wall_seconds']).toFixed(0)}s, $${Number(c['usd']).toFixed(2)}`,
  );
}

const cells = db
  .prepare(
    `SELECT c.id, c.indicator_id, c.state, c.depth, c.surfaced, c.sections_indexed, c.sections_read,
            a.score, a.band_criterion, a.deciding_fact, a.rationale, i.title AS controlling
       FROM cell c
       LEFT JOIN cell_answer a ON a.cell_id = c.id
       LEFT JOIN instrument i ON i.id = a.controlling_instrument_id
      WHERE c.run_id = ? ${only ? 'AND c.indicator_id = ?' : ''}
      ORDER BY c.indicator_id`,
  )
  .all(...(only ? [runId, only] : [runId])) as Record<string, string | number | null>[];

for (const cell of cells) {
  console.log(`\n  ${cell['indicator_id']}  score ${cell['score'] ?? 'unresolved'}  [${cell['state']}]`);
  console.log(`    band: ${cell['band_criterion'] ?? '-'}`);
  console.log(`    decided by: ${cell['deciding_fact'] ?? '-'}`);
  if (cell['controlling']) console.log(`    controlling instrument: ${cell['controlling']}`);
  console.log(
    `    searched ${cell['surfaced']} provision(s) of ${cell['sections_indexed']}, ` +
      `cut to ${cell['depth']}, read ${cell['sections_read']}`,
  );

  const applied = db
    .prepare(
      `SELECT r.quote, r.subclause, r.attributes, s.heading_path, i.title, i.source_url, s.anchor
         FROM reading r
         JOIN section s ON s.id = r.section_id
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE r.cell_id = ? AND r.applies = 1`,
    )
    .all(cell['id']) as Record<string, string | null>[];

  for (const a of applied) {
    const measures = (JSON.parse(a['attributes'] ?? '[]') as { measure: string | null }[])
      .map((m) => m.measure ?? 'unnamed')
      .join(', ');
    console.log(`    - ${a['title']} :: ${a['heading_path']}  [${measures}]`);
    console.log(`      "${(a['quote'] ?? '').slice(0, 140)}"`);
    console.log(`      ${a['source_url']}${a['anchor'] ? `#${a['anchor']}` : ''}`);
  }

  if (only) {
    const row = db.prepare('SELECT queries FROM cell WHERE id = ?').get(cell['id']) as
      | { queries: string | null }
      | undefined;
    const queries = JSON.parse(row?.queries ?? '[]') as string[];
    console.log('    asked:');
    for (const q of queries) console.log(`      - ${q}`);

    const discards = db
      .prepare("SELECT stage, subject, reason FROM discard WHERE run_id = ? AND subject LIKE ?")
      .all(runId, `${cell['indicator_id']} ::%`) as Record<string, string>[];
    for (const d of discards) console.log(`    (not counted, ${d['stage']}) ${d['subject']} -- ${d['reason']}`);
  }
}

console.log(`\n  ${cells.length} cell(s).`);
db.close();
