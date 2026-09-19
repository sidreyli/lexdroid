/**
 * Score a finished run again against the banked second-reading verdicts.
 *
 *   npm run -w backend rescore -- --run <id>
 *   npm run -w backend rescore -- --run <id> --dry-run     say what would change, change nothing
 *
 * A run does this itself now, straight after its own confirmation pass. This is for a run recorded
 * before that was true, whose findings have since been ruled on by a pass that ran separately.
 *
 * No engine and no network: the same decision over the same readings, with the verdicts in front
 * of it. What changes is the answer, its basis and the confirmation state recorded beside it.
 */
import { openDb } from '../src/db/index.js';
import { rescoreRun } from '../src/run/rescore.js';
import { loadConfirmations } from '../src/read/confirmations.js';
import { scorecard, tally } from '../src/eval/scorecard.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const db = openDb();
const wanted = arg('run') ?? 'latest';
const dryRun = process.argv.includes('--dry-run');

const run = (
  wanted === 'latest'
    ? db.prepare("SELECT id FROM run WHERE status = 'complete' ORDER BY started_at DESC LIMIT 1").get()
    : db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${wanted}%`)
) as { id: string } | undefined;

if (!run) {
  console.log(wanted === 'latest' ? 'No completed runs recorded yet.' : `No run ${wanted}.`);
  process.exit(0);
}

const before = tally(scorecard(db, run.id));
const banked = loadConfirmations(db).size;
console.log(`\nRe-scoring ${run.id}`);
console.log(`  ${banked} banked verdict(s) in play`);
console.log(`  before: ${before.agree}/${before.cells - before.ungraded} agree with ESCAP`);

if (dryRun) {
  // Everything the real thing does, inside a transaction that is then thrown away, so a dry run
  // reports the true outcome rather than an estimate of it.
  db.exec('BEGIN');
  const result = rescoreRun(db, run.id);
  const after = tally(scorecard(db, run.id));
  db.exec('ROLLBACK');
  console.log(`\n  would change ${result.changed} of ${result.cells} cell(s)`);
  console.log(`  would be: ${after.agree}/${after.cells - after.ungraded} agree`);
  console.log('  nothing was written\n');
  process.exit(0);
}

const result = rescoreRun(db, run.id);
const after = tally(scorecard(db, run.id));

console.log(`\n  ${result.changed} of ${result.cells} cell(s) changed`);
console.log(`    ${result.nowAnswered} cell(s) now answered that were not`);
console.log(`    ${result.nowUnresolved} cell(s) now unresolved that were answered`);
console.log(`\n  after: ${after.agree}/${after.cells - after.ungraded} agree with ESCAP`);
console.log(`    over-claim   ${String(after['over-claim']).padStart(4)}`);
console.log(`    under-claim  ${String(after['under-claim']).padStart(4)}`);
console.log(`    recall-miss  ${String(after['recall-miss']).padStart(4)}`);
console.log(`    abstained    ${String(after.abstained).padStart(4)}`);
console.log(`\n  the export rows still describe the old answers. Rebuild them with:`);
console.log(`    npm run -w backend verify -- --run ${run.id}\n`);
