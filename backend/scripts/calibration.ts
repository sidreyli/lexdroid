/**
 * What a confidence rung is actually worth.
 *
 * The README template asks a direct question -- "are your scores calibrated probabilities, or
 * relative? Below what score should a human check?" -- and the only honest way to answer it is to
 * measure. This groups a run's export rows by the rung `confidenceOf` gave them and reports, for
 * each rung, the share of rows sitting in cells that matched ESCAP's published answer.
 *
 * Two things to hold on to when reading the output.
 *
 * The agreement is **cell-level**, not row-level. ESCAP publishes a score per cell, not a verdict
 * per provision, so a row in an agreeing cell is not thereby a correct row -- a cell can land on
 * the right band while standing on the wrong provision. It is the best proxy available and it is a
 * proxy.
 *
 * And it is measured on three economies ESCAP has already published. A rung's share here is not a
 * probability to carry into a sealed live-test economy, which is exactly why the exporter treats
 * the ladder as ordinal and says so.
 *
 * Reads the baseline, so it lives in scripts/ rather than src/: see test/baseline-isolation.test.ts.
 *
 *   npm run -w backend calibration [-- <run id>]
 */
import { openDb } from '../src/db/index.js';
import { scorecard } from '../src/eval/scorecard.js';

interface Bucket {
  rows: number;
  graded: number;
  agreed: number;
}

function latestRun(db: ReturnType<typeof openDb>): string | undefined {
  const row = db
    .prepare(`SELECT id FROM run WHERE status = 'complete' ORDER BY started_at DESC LIMIT 1`)
    .get() as { id: string } | undefined;
  return row?.id;
}

function main(): void {
  const db = openDb();
  const runId = process.argv[2] ?? latestRun(db);
  if (!runId) {
    console.log('No completed run to measure.');
    process.exitCode = 1;
    return;
  }

  const verdicts = new Map<string, string>();
  for (const c of scorecard(db, runId)) verdicts.set(`${c.economy}::${c.indicator}`, c.verdict);

  const rows = db
    .prepare(
      `SELECT e.economy AS economy, e.indicator_id AS indicator, e.confidence AS confidence
         FROM export_row e JOIN cell c ON c.id = e.cell_id
        WHERE c.run_id = ?`,
    )
    .all(runId) as { economy: string; indicator: string; confidence: string | null }[];

  if (rows.length === 0) {
    console.log(`Run ${runId.slice(0, 8)} has no export rows to measure.`);
    process.exitCode = 1;
    return;
  }

  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const verdict = verdicts.get(`${r.economy}::${r.indicator}`) ?? 'ungraded';
    const key = r.confidence ?? 'not stated';
    const b = buckets.get(key) ?? { rows: 0, graded: 0, agreed: 0 };
    b.rows += 1;
    // An abstention is not a wrong answer and an ungraded cell has nothing to be wrong about.
    // Counting either as a miss would make every rung look worse than it is.
    if (verdict !== 'ungraded' && verdict !== 'abstained') {
      b.graded += 1;
      if (verdict === 'agree') b.agreed += 1;
    }
    buckets.set(key, b);
  }

  console.log(`Confidence calibration for run ${runId.slice(0, 8)}, ${rows.length} rows.`);
  console.log('Agreement is cell-level, on economies ESCAP has already published.');
  console.log();
  console.log(
    'confidence'.padEnd(12) + 'rows'.padStart(7) + 'graded'.padStart(8) +
      'agreed'.padStart(8) + 'share'.padStart(8),
  );

  const ordered = [...buckets].sort((a, b) => Number(b[0]) - Number(a[0]) || b[1].rows - a[1].rows);
  for (const [key, b] of ordered) {
    const share = b.graded > 0 ? (b.agreed / b.graded).toFixed(3) : '-';
    console.log(
      key.padEnd(12) + String(b.rows).padStart(7) + String(b.graded).padStart(8) +
        String(b.agreed).padStart(8) + share.padStart(8),
    );
  }

  console.log();
  const spread = ordered.filter(([, b]) => b.graded >= 20).map(([, b]) => b.agreed / b.graded);
  if (spread.length >= 2) {
    const width = Math.max(...spread) - Math.min(...spread);
    console.log(
      `Rungs carrying 20 or more graded rows span ${width.toFixed(3)} in agreement. ` +
        (width < 0.1
          ? 'That is slight: the ladder orders rows, it does not price them.'
          : 'That is a real separation.'),
    );
  }
  const biggest = ordered.reduce((a, b) => (b[1].rows > a[1].rows ? b : a));
  console.log(
    `Largest rung holds ${((biggest[1].rows / rows.length) * 100).toFixed(1)}% of rows` +
      ` at confidence ${biggest[0]}.`,
  );
}

main();
