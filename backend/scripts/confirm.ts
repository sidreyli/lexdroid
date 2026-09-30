/**
 * Ask, for every provision a run filed under a measure, whether it states that measure.
 *
 *   npm run -w backend confirm -- --run <id> [--hosts a,b,c] [--limit 500]
 *
 * The run does this itself now; this is for asking it again over an older run, or for measuring
 * the pass on its own. The work is in src/read/confirm-pass.ts so that both callers ask the same
 * question the same way.
 *
 * No fetching, parsing, indexing or searching: the provisions and the findings are already in the
 * store. Keyed by the question rather than the run, so a second run over the same corpus reads the
 * answer instead of paying for it, and an interrupted pass resumes where it stopped.
 */
import { openDb } from '../src/db/index.js';
import { confirmPass } from '../src/read/confirm-pass.js';
import { READING_MODEL } from '../src/engines/ollama.js';
import { engineHosts, resetEnginePool } from '../src/engines/pool.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

// Rented engines, named here rather than in the environment. One question per engine at a time,
// which the pool already enforces, so the worker count defaults to the number of engines.
const hostsArg = arg('hosts');
if (hostsArg) {
  process.env['OLLAMA_HOSTS'] = hostsArg;
  resetEnginePool();
}
const hosts = engineHosts();

const db = openDb();
// A run is named by a prefix here as everywhere else. Taken literally, a short id matched no cell,
// the pass found nothing to ask, and it reported a clean zero -- the shape of a pass that ran.
const wanted = arg('run');
const found = (
  wanted
    ? db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${wanted}%`)
    : db.prepare('SELECT id FROM run ORDER BY started_at DESC LIMIT 1').get()
) as { id: string } | undefined;
if (!found) {
  console.log(`\nNo run ${wanted}.\n`);
  process.exit(1);
}
const runId = found.id;
const workers = Number(arg('workers') ?? String(hosts.length));
const model = arg('model') ?? READING_MODEL;

console.log(`\nConfirming measures for ${runId}`);
console.log(`  ${workers} worker(s), model ${model}\n`);

const result = await confirmPass(db, {
  runId,
  model,
  workers,
  limit: Number(arg('limit') ?? '0'),
  log: (l) => console.log(l),
});

console.log(`\n  asked ${result.asked} in ${(result.seconds / 60).toFixed(1)} min`);
console.log(`    confirmed  ${String(result.confirmed).padStart(6)}`);
console.log(`    ruled out  ${String(result.ruledOut).padStart(6)}`);
console.log(`    failed     ${String(result.failed).padStart(6)}`);
console.log(`\n  re-score with: npm run -w backend rescore -- --run ${runId}\n`);
