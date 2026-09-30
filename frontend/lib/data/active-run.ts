/**
 * The run a fleet is working on right now, if any.
 *
 * A run's status says 'running' for runs whose fleet was killed outright, so it cannot answer this
 * alone. Each fleet leaves a file naming its process in data/fleet/<run>/ while it lives; a run is
 * under way when its status says so and a process named there still exists.
 */
import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BACKEND } from "./paths";
import { runningRun, type RunningRun } from "./ledger";

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM is a process that exists and belongs to somebody else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function activeRun(): RunningRun | null {
  const fleets = join(BACKEND, "data", "fleet");
  if (!existsSync(fleets)) return null;
  for (const runId of readdirSync(fleets)) {
    if (!/^[0-9a-f-]{36}$/.test(runId)) continue;
    const pids = readdirSync(join(fleets, runId)).filter((f) => /^fleet-\d+\.pid$/.test(f));
    const live = pids.some((f) => alive(Number(readFileSync(join(fleets, runId, f), "utf8").trim())));
    if (!live) continue;
    const run = runningRun(runId);
    if (run) return run;
  }
  return null;
}
