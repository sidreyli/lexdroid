/**
 * A single run's ledger, read straight through without the caching the pages use.
 * A run in flight is watched a second at a time, so a stale answer would be the wrong answer.
 */
import "server-only";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { DB_PATH } from "./paths";
import type { RunEvent, RunStatus } from "./types";

let handle: Database.Database | null = null;

function db(): Database.Database | null {
  if (handle) return handle;
  if (!existsSync(DB_PATH)) return null;
  try {
    handle = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    handle.pragma("busy_timeout = 4000");
    return handle;
  } catch {
    return null;
  }
}

export function runStatus(runId: string): RunStatus | null {
  const row = db()?.prepare("SELECT status FROM run WHERE id = ?").get(runId) as
    | { status: RunStatus }
    | undefined;
  return row?.status ?? null;
}

export function liveRunLedger(runId: string, after: number): RunEvent[] {
  const d = db();
  if (!d) return [];
  return d
    .prepare(
      `SELECT id, run_id AS runId, at, economy_code AS economy, pillar_id AS pillarId,
              indicator_id AS indicatorId, stage, kind, subject, detail, seconds, done, total
         FROM run_event
        WHERE run_id = ? AND id > ?
        ORDER BY id
        LIMIT 500`,
    )
    .all(runId, after) as RunEvent[];
}

export interface RunningRun {
  id: string;
  startedAt: string;
  economies: string[];
  pillars: number[];
  indicators: string[];
  engine: string;
}

/** What a run was started on, for saying which run is holding the Start button. */
export function runningRun(runId: string): RunningRun | null {
  const row = db()
    ?.prepare(
      "SELECT id, started_at, economies, pillars, indicators, engine FROM run WHERE id = ? AND status = 'running'",
    )
    .get(runId) as
    | { id: string; started_at: string; economies: string; pillars: string; indicators: string | null; engine: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    startedAt: row.started_at,
    economies: JSON.parse(row.economies) as string[],
    pillars: JSON.parse(row.pillars) as number[],
    indicators: row.indicators ? (JSON.parse(row.indicators) as string[]) : [],
    engine: row.engine,
  };
}
