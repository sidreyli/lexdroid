/**
 * One run, all four views of it, side by side.
 *
 *   npm run -w backend benchmark -- --run <id>
 *   npm run -w backend benchmark -- --run latest
 *
 * A run can be read four ways and until now each was a separate command with its own defaults, so
 * the same work had several true agreement figures and no way to tell which one anybody meant:
 *
 *   stored      what the run wrote when it scored
 *   re-derived  the same decision rebuilt from the record, which is what verify checks
 *   exported    what survives the gates and the reviewer, which is what ESCAP actually receives
 *   baseline    how any of those compare with ESCAP's own answers
 *
 * They should agree. Where they do not, the difference is the finding, and this prints it rather
 * than leaving it to be discovered by running two commands and noticing.
 *
 * No model and no network: everything here is answerable from the store.
 */
import { openDb } from '../src/db/index.js';
import { scoredWithConfirmations } from '../src/decide/record.js';
import { recomputeScores } from '../src/verify/index.js';
import { scorecard, tally } from '../src/eval/scorecard.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const db = openDb();
const wanted = arg('run') ?? 'latest';

interface RunRow {
  id: string;
  started_at: string;
  status: string;
  engine: string;
  engine_model: string;
  source_mode: string;
  code_revision: string;
  economies: string;
  pillars: string;
}

const run = (
  wanted === 'latest'
    ? db.prepare('SELECT * FROM run WHERE status = \'complete\' ORDER BY started_at DESC LIMIT 1').get()
    : db.prepare('SELECT * FROM run WHERE id LIKE ?').get(`${wanted}%`)
) as RunRow | undefined;

if (!run) {
  console.log(wanted === 'latest' ? 'No completed runs recorded yet.' : `No run ${wanted}.`);
  process.exit(0);
}

const pct = (n: number, of: number) => (of === 0 ? '   -  ' : `${((100 * n) / of).toFixed(1)}%`);
const pad = (s: string | number, n: number) => String(s).padStart(n);

console.log(`\nRun ${run.id}`);
console.log(`  ${run.started_at}  ${run.status}  ${run.source_mode}`);
console.log(`  ${run.engine} / ${run.engine_model} @ ${run.code_revision}`);
console.log(`  ${JSON.parse(run.economies).join(', ')}  pillars ${JSON.parse(run.pillars).join(',')}`);

// --- What the score was computed against -------------------------------------------------------
// The first thing to establish, because every number below means something different depending on
// it, and a run that recorded no confirmation state was scored before the pass was consulted.
const state = db
  .prepare(
    `SELECT COUNT(a.confirmations_asked) AS recorded,
            COALESCE(SUM(a.confirmations_asked), 0) AS asked,
            COALESCE(SUM(a.confirmations_applied), 0) AS applied
       FROM cell c JOIN cell_answer a ON a.cell_id = c.id WHERE c.run_id = ?`,
  )
  .get(run.id) as { recorded: number; asked: number; applied: number };

// Verdicts banked for *this run's* questions, not every run's. The table is keyed by the question
// rather than the run, so its grand total says nothing about whether this run's answers are current.
const answerable = (
  db
    .prepare(
      `SELECT COUNT(*) AS n
         FROM (SELECT DISTINCT r.section_id AS sid,
                      json_extract(j.value, '$.indicatorId') AS ind,
                      json_extract(j.value, '$.measure') AS m
                 FROM reading r JOIN cell c ON c.id = r.cell_id, json_each(r.attributes) j
                WHERE c.run_id = ? AND json_extract(j.value, '$.measure') IS NOT NULL) q
         JOIN measure_confirmation mc
           ON mc.section_id = q.sid AND mc.indicator_id = q.ind AND mc.measure = q.m
        WHERE mc.failure IS NULL`,
    )
    .get(run.id) as { n: number }
).n;

console.log('\n  confirmation state');
if (!scoredWithConfirmations(db, run.id)) {
  console.log(`    the stored scores were computed without the second reading's verdicts`);
  console.log(`    ${answerable} verdict(s) apply to this run and would change it if it were re-scored`);
} else {
  console.log(`    ${pad(state.asked, 6)} finding(s) carried a verdict when this run scored`);
  console.log(`    ${pad(state.applied, 6)} of them were ruled out, which is what moved the scores`);
  console.log(
    `    ${pad(answerable, 6)} apply to it now` +
      (answerable === state.asked ? '  (unchanged since)' : '  -- RE-SCORE: more have been banked'),
  );
}

// --- Stored, re-derived, exported ---------------------------------------------------------------
const cells = db.prepare('SELECT COUNT(*) AS n FROM cell WHERE run_id = ?').get(run.id) as { n: number };
const answered = db
  .prepare('SELECT COUNT(*) AS n FROM cell c JOIN cell_answer a ON a.cell_id = c.id WHERE c.run_id = ?')
  .get(run.id) as { n: number };

const rebuilt = recomputeScores(db, run.id);

const exported = db
  .prepare('SELECT COUNT(*) AS n FROM export_row e JOIN cell c ON c.id = e.cell_id WHERE c.run_id = ?')
  .get(run.id) as { n: number };
const held = db
  .prepare(
    `SELECT COUNT(DISTINCT g.export_row_id) AS n
       FROM gate_result g JOIN export_row e ON e.id = g.export_row_id JOIN cell c ON c.id = e.cell_id
      WHERE c.run_id = ? AND g.passed = 0`,
  )
  .get(run.id) as { n: number };
const rejected = db
  .prepare(
    `SELECT COUNT(DISTINCT r.export_row_id) AS n
       FROM review_action r JOIN export_row e ON e.id = r.export_row_id JOIN cell c ON c.id = e.cell_id
      WHERE c.run_id = ? AND r.action = 'reject'`,
  )
  .get(run.id) as { n: number };

console.log('\n  the run, four ways');
console.log(`    cells requested       ${pad(cells.n, 6)}`);
console.log(`    cells answered        ${pad(answered.n, 6)}  ${pct(answered.n, cells.n)}`);
console.log(
  `    scores re-derived     ${pad(rebuilt.agreed, 6)}  ${pct(rebuilt.agreed, rebuilt.cells)} of ${rebuilt.cells}` +
    (rebuilt.agreed === rebuilt.cells ? '  (exact)' : `  -- ${rebuilt.disagreed.length} differ`),
);
console.log(`    export rows built     ${pad(exported.n, 6)}${exported.n === 0 ? '  -- nothing to submit' : ''}`);
console.log(`    rows held by a gate   ${pad(held.n, 6)}  ${pct(held.n, exported.n)} need a reviewer`);
console.log(`    rows a reviewer cut   ${pad(rejected.n, 6)}`);

for (const d of rebuilt.disagreed.slice(0, 10)) {
  console.log(`      ${d.indicatorId}: recorded ${d.stored}, re-derived ${d.recomputed} -- ${d.why}`);
}

// --- Against ESCAP ------------------------------------------------------------------------------
// Last, and deliberately so: agreement is evidence about the answers, not the definition of them.
const graded = scorecard(db, run.id);
const t = tally(graded);
const gradedCells = t.cells - t.ungraded;
console.log('\n  against ESCAP round 1');
console.log(`    ${t.agree}/${gradedCells} agree  ${pct(t.agree, gradedCells)}`);
console.log(`      over-claim   ${pad(t['over-claim'], 4)}   read an instrument and claimed more than it says`);
console.log(`      under-claim  ${pad(t['under-claim'], 4)}   read the right instrument and credited none of it`);
console.log(`      recall-miss  ${pad(t['recall-miss'], 4)}   found nothing where ESCAP found a measure`);
console.log(`      abstained    ${pad(t.abstained, 4)}   no answer offered`);

// --- What this run would fail on, if submitted as it stands -------------------------------------
// The submission contract, checked against the run rather than remembered. Each line is a thing
// ESCAP asked for by name.
const untagged = db
  .prepare(
    `SELECT COUNT(*) AS n FROM export_row e JOIN cell c ON c.id = e.cell_id
      WHERE c.run_id = ? AND e.discovery_tag IS NULL`,
  )
  .get(run.id) as { n: number };
const noLanguage = db
  .prepare(
    `SELECT COUNT(*) AS n FROM export_row e JOIN cell c ON c.id = e.cell_id
      WHERE c.run_id = ? AND (e.language_of_source IS NULL OR e.language_of_source = '')`,
  )
  .get(run.id) as { n: number };

const blockers: string[] = [];
if (exported.n === 0) blockers.push('no export rows: run verify to build them');
if (untagged.n > 0) blockers.push(`${untagged.n} row(s) carry no NEW/KNOWN tag`);
if (noLanguage.n > 0) blockers.push(`${noLanguage.n} row(s) carry no Language of Source`);
if (rebuilt.agreed !== rebuilt.cells) blockers.push(`${rebuilt.disagreed.length} score(s) do not re-derive`);

console.log('\n  before this could be submitted');
if (blockers.length === 0) console.log('    nothing outstanding on this run');
else for (const b of blockers) console.log(`    - ${b}`);
console.log('');
