/**
 * Stop a run that is under way: every fleet working on it, and every worker they started.
 *
 *   npm run -w backend stop-run -- --run <id>
 *
 * The fleets are found by the files they leave in data/fleet/<run>/ while alive. The run is then
 * recorded as cancelled, since what it answered is part of a run nobody finished. Rented GPUs are
 * not touched: they are held from the engine panel, and a stopped run is often restarted on them.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { WORKING_DB_PATH } from '../src/db/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const runId = arg('run');
if (!runId || !/^[0-9a-f-]{36}$/.test(runId)) throw new Error('Name the run: --run <full id>');

const dir = join('data', 'fleet', runId);
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^fleet-\d+\.pid$/.test(f)) : [];
let stopped = 0;
for (const f of files) {
  const pid = Number(readFileSync(join(dir, f), 'utf8').trim());
  if (Number.isInteger(pid) && pid > 0 && alive(pid)) {
    // Windows has no process groups to signal, so the tree is taken down by the system's own tool.
    // Elsewhere the fleet's signal handler stops its workers before it exits.
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        // It exited between the check and the kill.
      }
    } else {
      process.kill(pid, 'SIGTERM');
    }
    stopped += 1;
  }
  rmSync(join(dir, f), { force: true });
}

const db = new Database(WORKING_DB_PATH);
db.pragma('busy_timeout = 30000');
const row = db.prepare('SELECT status FROM run WHERE id = ?').get(runId) as { status: string } | undefined;
if (!row) throw new Error(`No run ${runId}.`);
if (row.status === 'running') {
  const at = new Date().toISOString();
  db.prepare("UPDATE run SET finished_at = ?, status = 'cancelled' WHERE id = ?").run(at, runId);
  db.prepare(
    `INSERT INTO run_event (run_id, at, stage, kind, detail) VALUES (?, ?, 'run', 'failed', ?)`,
  ).run(runId, at, 'stopped by hand');
}
console.log(`run ${runId}: ${stopped} fleet(s) stopped, ${row.status} -> ${row.status === 'running' ? 'cancelled' : row.status}`);
db.close();
