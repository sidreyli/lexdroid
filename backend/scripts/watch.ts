/**
 * Watch a run while it runs.
 *
 *   npm run -w backend watch                 the newest run still going
 *   npm run -w backend watch -- <run id>     a particular one, finished or not
 *
 * A second process reading the same store, which WAL allows. Nothing here can change a run; it
 * only reads the ledger the run is writing, so watching a graded run cannot disturb it.
 */
import { openDb } from '../src/db/index.js';
import { runEvents } from '../src/run/index.js';
import { describe } from '../src/run/events.js';

const POLL_MS = 1000;

function newestRun(db: ReturnType<typeof openDb>): { id: string; status: string } | null {
  const row = db
    .prepare(
      `SELECT id, status FROM run ORDER BY (status = 'running') DESC, started_at DESC LIMIT 1`,
    )
    .get() as { id: string; status: string } | undefined;
  return row ?? null;
}

async function main(): Promise<void> {
  const db = openDb();
  const wanted = process.argv[2];
  const run = wanted
    ? (db.prepare('SELECT id, status FROM run WHERE id = ?').get(wanted) as { id: string; status: string } | undefined) ?? null
    : newestRun(db);

  if (!run) {
    console.log('No runs recorded yet.');
    return;
  }
  console.log(`watching run ${run.id} (${run.status})\n`);

  let after = 0;
  for (;;) {
    const events = runEvents(db, run.id, after, 2000);
    for (const e of events) {
      console.log(`${e.at.slice(11, 19)} ${describe(e)}`);
      after = e.id;
    }
    const status = (db.prepare('SELECT status FROM run WHERE id = ?').get(run.id) as { status: string }).status;
    // One more pass after the run closes, so the last events are never cut off.
    if (status !== 'running' && events.length === 0) {
      console.log(`\nrun ${status}.`);
      return;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
