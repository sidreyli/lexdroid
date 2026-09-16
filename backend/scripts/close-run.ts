/**
 * Close a run that no single fleet owns.
 *
 *   npm run -w backend close-run -- --run <id> [--status complete|failed]
 *
 * A fleet that joined a run does not close it, because two fleets sharing a run finish at different
 * times and the first one out would lock the second's remaining units away from it. That leaves the
 * closing to whoever knows every fleet has stopped, which is a person, which is this.
 */
import Database from 'better-sqlite3';
import { WORKING_DB_PATH } from '../src/db/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const runId = arg('run');
const status = arg('status') ?? 'complete';
if (!runId) throw new Error('Name the run: --run <id>');
if (status !== 'complete' && status !== 'failed' && status !== 'cancelled') {
  throw new Error(`--status is complete, failed or cancelled, not ${status}`);
}

const db = new Database(WORKING_DB_PATH);
const row = db.prepare('SELECT status FROM run WHERE id = ?').get(runId) as { status: string } | undefined;
if (!row) throw new Error(`No run ${runId}.`);

// A run with a cell still unanswered is one a fleet is probably still working on, and closing it
// under that fleet is the defect this script exists because of. Say so rather than do it.
const open = db
  .prepare(
    `SELECT COUNT(*) n FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
      WHERE c.run_id = ? AND a.cell_id IS NULL`,
  )
  .get(runId) as { n: number };
if (open.n > 0 && !process.argv.includes('--anyway')) {
  throw new Error(`${open.n} cell(s) in ${runId} have no answer. Pass --anyway if every fleet has stopped.`);
}

db.prepare('UPDATE run SET finished_at = ?, status = ? WHERE id = ?').run(new Date().toISOString(), status, runId);
console.log(`run ${runId}: ${row.status} -> ${status}`);
db.close();
