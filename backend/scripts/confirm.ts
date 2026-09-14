/**
 * Ask, for every provision a run filed under a measure, whether it states that measure.
 *
 *   npm run -w backend confirm -- --run <id> [--indicator 12.3] [--economy AUS] [--hosts a,b,c]
 *
 * This is the reader fix measured without a fleet. The provisions are already in the store and so
 * are the findings, so the pass needs no fetching, parsing, indexing or searching -- only the one
 * question per provision and measure, banked in measure_confirmation and read back by replay.
 *
 * Keyed by the question rather than the run, so a second run over the same corpus reads the answer
 * instead of paying for it, and an interrupted pass resumes where it stopped.
 */
import { openDb } from '../src/db/index.js';
import { confirmMeasure, measureOf } from '../src/read/confirm.js';
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
const runId =
  arg('run') ?? (db.prepare('SELECT id FROM run ORDER BY started_at DESC LIMIT 1').get() as { id: string }).id;
const onlyIndicator = arg('indicator');
const onlyEconomy = arg('economy');
const workers = Number(arg('workers') ?? String(hosts.length));
const limit = Number(arg('limit') ?? '0');
const model = arg('model') ?? READING_MODEL;

type Question = {
  sectionId: number;
  indicatorId: string;
  measure: string;
  instrumentTitle: string;
  headingPath: string;
  text: string;
};

// One row per distinct question, not per finding: the same provision filed under the same measure
// in three cells is one question with one answer.
const rows = db
  .prepare(
    `SELECT DISTINCT r.section_id AS sectionId,
            json_extract(j.value, '$.indicatorId') AS indicatorId,
            json_extract(j.value, '$.measure') AS measure,
            i.title AS instrumentTitle, s.heading_path AS headingPath, s.text AS text
       FROM reading r
       JOIN cell c ON c.id = r.cell_id
       JOIN section s ON s.id = r.section_id
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id,
            json_each(r.attributes) j
      WHERE c.run_id = ?
        AND (? IS NULL OR c.indicator_id = ?)
        AND (? IS NULL OR c.economy_code = ?)
        AND json_extract(j.value, '$.measure') IS NOT NULL`,
  )
  .all(runId, onlyIndicator, onlyIndicator, onlyEconomy, onlyEconomy) as Question[];

const already = db.prepare(
  'SELECT 1 FROM measure_confirmation WHERE section_id = ? AND indicator_id = ? AND measure = ?',
);
const insert = db.prepare(
  `INSERT OR REPLACE INTO measure_confirmation
     (section_id, indicator_id, measure, words, failure, model, prompt_tokens, output_tokens, latency_ms, asked_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const pending = rows.filter(
  (q) => measureOf(q.indicatorId, q.measure) && !already.get(q.sectionId, q.indicatorId, q.measure),
);
const todo = limit > 0 ? pending.slice(0, limit) : pending;

console.log(`\nConfirming measures for ${runId}`);
console.log(`  ${rows.length} question(s), ${rows.length - pending.length} already answered, ${todo.length} to ask`);
console.log(`  ${workers} worker(s), model ${model}\n`);

let done = 0;
let confirmed = 0;
let refused = 0;
let failed = 0;
const started = Date.now();

// A shared queue rather than a slice each: rented engines are not the same speed, and a fixed
// slice makes the whole pass wait for the slowest card.
let next = 0;

async function worker(): Promise<void> {
  for (;;) {
    const q = todo[next++];
    if (!q) return;
    const measure = measureOf(q.indicatorId, q.measure)!;
    const c = await confirmMeasure(
      { instrumentTitle: q.instrumentTitle, headingPath: q.headingPath, text: q.text },
      measure,
      { model },
    );
    insert.run(
      q.sectionId,
      q.indicatorId,
      q.measure,
      c.words,
      c.failure,
      c.model,
      c.promptTokens,
      c.completionTokens,
      c.durationMs,
      new Date().toISOString(),
    );
    done += 1;
    if (c.failure) failed += 1;
    else if (c.words) confirmed += 1;
    else refused += 1;
    if (done % 50 === 0) {
      const per = (Date.now() - started) / done / 1000;
      const left = ((todo.length - done) * per) / 60;
      console.log(
        `  ${done}/${todo.length}  confirmed ${confirmed}  ruled out ${refused}  failed ${failed}` +
          `  ${per.toFixed(1)}s each, ~${left.toFixed(0)} min left`,
      );
    }
  }
}

await Promise.all(Array.from({ length: Math.max(1, workers) }, () => worker()));

const mins = (Date.now() - started) / 60000;
console.log(`\n  asked ${done} in ${mins.toFixed(1)} min`);
console.log(`    confirmed  ${String(confirmed).padStart(6)}`);
console.log(`    ruled out  ${String(refused).padStart(6)}`);
console.log(`    failed     ${String(failed).padStart(6)}`);
console.log(`\n  re-score with: npm run -w backend replay -- --run ${runId} --confirmed\n`);
