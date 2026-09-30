/**
 * Find, and on request remove, provisions of one economy recorded against another economy's cell.
 *
 *   npm run -w backend repair-economy -- --run <id> [--apply]
 *
 * Units answering different economies run at once against one database, and in the twelve-pillar
 * run one unit's readings landed on another's cell. A Singapore Act cited as Australian law is
 * not a reading that went wrong, which would be kept and counted; it is a row about a different
 * question, and it cannot be evidence here whatever it says. Every row removed is written to the
 * run's own discard ledger first, so the record says what left and why.
 */
import { openDb } from '../src/db/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const db = openDb();
const apply = process.argv.includes('--apply');
const runId =
  arg('run') ?? (db.prepare('SELECT id FROM run ORDER BY started_at DESC LIMIT 1').get() as { id: string }).id;

const TABLES = ['reading', 'shortlist_entry', 'answer_basis'] as const;

const foreignIn = (table: string) =>
  `SELECT t.rowid AS rid, t.cell_id, c.economy_code AS cell_economy, c.indicator_id,
          t.section_id, i.economy_code AS section_economy, i.title
     FROM ${table} t
     JOIN cell c ON c.id = t.cell_id
     JOIN section s ON s.id = t.section_id
     JOIN document d ON d.id = s.document_id
     JOIN instrument i ON i.id = d.instrument_id
    WHERE c.run_id = ? AND i.economy_code <> c.economy_code`;

console.log(`\nEconomy isolation, run ${runId}\n`);

let total = 0;
const cells = new Set<number>();
const found: Record<string, Record<string, any>[]> = {};

for (const table of TABLES) {
  const rows = db.prepare(foreignIn(table)).all(runId) as Record<string, any>[];
  found[table] = rows;
  total += rows.length;
  for (const r of rows) cells.add(r['cell_id']);
  console.log(`  ${String(rows.length).padStart(6)}  ${table} row(s) citing another economy`);
}

console.log(`\n  ${total} row(s) across ${cells.size} cell(s)`);

if (total > 0) {
  const byInstrument = new Map<string, number>();
  for (const rows of Object.values(found)) {
    for (const r of rows) byInstrument.set(r['title'], (byInstrument.get(r['title']) ?? 0) + 1);
  }
  console.log(`\n  the instruments most often misfiled`);
  for (const [title, n] of [...byInstrument].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`    ${String(n).padStart(5)}  ${title}`);
  }
}

if (!apply) {
  console.log(total > 0 ? '\n  nothing changed; pass --apply to remove them\n' : '\n  clean\n');
  process.exit(0);
}

const discard = db.prepare(
  'INSERT INTO discard (run_id, stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
);
const now = new Date().toISOString();
let removed = 0;

db.transaction(() => {
  for (const table of TABLES) {
    const del = db.prepare(`DELETE FROM ${table} WHERE rowid = ?`);
    for (const r of found[table] ?? []) {
      discard.run(
        runId,
        'repair',
        `${r['cell_economy']} ${r['indicator_id']} :: ${r['title']} :: section ${r['section_id']}`,
        `recorded against ${r['cell_economy']} but the provision is ${r['section_economy']}'s`,
        table,
        now,
      );
      del.run(r['rid']);
      removed += 1;
    }
  }
}).immediate();

console.log(`\n  removed ${removed} row(s), each written to the discard ledger with its reason`);
console.log('  re-score with: npm run -w backend rescore -- --run ' + runId + '\n');
