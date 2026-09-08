/**
 * Build a run's export rows and put every one of them through the gates.
 *
 *   npm run -w backend verify -- --run <run id>
 *   npm run -w backend verify -- --run latest --held        (list what was held, and why)
 *
 * No model, no network. Everything here is answerable from what the run already stored, which is
 * the point: it can be re-run months later against the same store and give the same answer.
 */
import { openDb } from '../src/db/index.js';
import { buildExportRows } from '../src/export/index.js';
import { verifyRun, recomputeScores } from '../src/verify/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const db = openDb();
const wanted = arg('run') ?? 'latest';
const showHeld = process.argv.includes('--held');

const run =
  wanted === 'latest'
    ? (db.prepare('SELECT id, started_at, engine_model, code_revision FROM run ORDER BY started_at DESC LIMIT 1').get() as
        | { id: string; started_at: string; engine_model: string; code_revision: string }
        | undefined)
    : (db.prepare('SELECT id, started_at, engine_model, code_revision FROM run WHERE id = ?').get(wanted) as
        | { id: string; started_at: string; engine_model: string; code_revision: string }
        | undefined);

if (!run) {
  console.log(wanted === 'latest' ? 'No runs recorded yet.' : `No run ${wanted}.`);
  process.exit(0);
}

console.log(`\nRun ${run.id}  --  ${run.started_at}  --  ${run.engine_model} @ ${run.code_revision}`);

const built = buildExportRows(db, run.id);
console.log(`\nExport: ${built.rows} row(s) from ${built.cells} cell(s)`);
if (built.cellsWithoutRow > 0) {
  // Should be impossible. Printed loudly rather than swallowed, because a cell with no row is a
  // question we were asked and did not answer, which is the one thing the design forbids.
  console.log(`  WARNING: ${built.cellsWithoutRow} cell(s) produced no row at all`);
}

const scores = recomputeScores(db, run.id);
console.log(`\nScores derived again from the record: ${scores.agreed}/${scores.cells} agree`);
for (const d of scores.disagreed) {
  console.log(`  ${d.indicatorId}: recorded ${d.stored}, re-derived ${d.recomputed} -- ${d.why}`);
}

const result = verifyRun(db, run.id);
console.log(`\nGates over ${result.rows} row(s)\n`);
const width = Math.max(...Object.keys(result.byGate).map((g) => g.length), 10);
for (const [gate, t] of Object.entries(result.byGate).sort()) {
  const total = t.passed + t.failed;
  const bar = t.failed === 0 ? 'pass' : `${t.failed} held`;
  console.log(`  ${gate.padEnd(width)}  ${String(t.passed).padStart(4)}/${String(total).padEnd(4)}  ${bar}`);
}
console.log(`\n  ${result.held} of ${result.rows} row(s) held for review.`);

if (showHeld) {
  console.log('\n=== Held, and why ===\n');
  for (const v of result.verdicts.filter((x) => x.held)) {
    console.log(`  row ${v.exportRowId}  ${v.indicatorId}`);
    for (const o of v.outcomes.filter((x) => !x.passed)) {
      console.log(`    ${o.gate}: ${o.detail ?? 'failed'}`);
    }
  }
}
