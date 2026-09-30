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
 *
 * It refuses a run whose readings are no longer there: re-scoring then would overwrite the banked
 * answer with one decided on evidence a re-parse removed, and the old answer, which was the record
 * of what the run actually found, would be gone. `--anyway` says that is wanted; `--dry-run` never
 * needed it.
 */
import { openDb } from '../src/db/index.js';
import { rescoreRun } from '../src/run/rescore.js';
import { confirmationsForRun } from '../src/read/confirmations.js';
import { evidenceIsLost, evidenceLines, runEvidence } from '../src/run/evidence.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const db = openDb();
const wanted = arg('run') ?? 'latest';
const dryRun = process.argv.includes('--dry-run');
const anyway = process.argv.includes('--anyway');

const run = (
  wanted === 'latest'
    ? db.prepare("SELECT id FROM run WHERE status = 'complete' ORDER BY started_at DESC LIMIT 1").get()
    : db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${wanted}%`)
) as { id: string } | undefined;

if (!run) {
  console.log(wanted === 'latest' ? 'No completed runs recorded yet.' : `No run ${wanted}.`);
  process.exit(0);
}

const evidence = runEvidence(db, run.id);
if (!dryRun && !anyway && evidenceIsLost(evidence)) {
  console.log(`\nRefusing to re-score ${run.id}: it no longer holds the readings it was decided on.`);
  for (const line of evidenceLines(evidence)) console.log(`  ${line}`);
  console.log('\n  Re-scoring would replace what the run found with what is left of it.');
  console.log('  Run the cells again, or pass --anyway to overwrite the banked answers.\n');
  process.exit(1);
}

const banked = confirmationsForRun(db, run.id).size;
console.log(`\nRe-scoring ${run.id}`);
console.log(`  ${banked} banked verdict(s) in play`);

if (dryRun) {
  // Everything the real thing does, inside a transaction that is then thrown away, so a dry run
  // reports the true outcome rather than an estimate of it.
  db.exec('BEGIN');
  const result = rescoreRun(db, run.id);
  db.exec('ROLLBACK');
  console.log(`\n  would change ${result.changed} of ${result.cells} cell(s)`);
  console.log('  nothing was written\n');
  process.exit(0);
}

const result = rescoreRun(db, run.id);

console.log(`\n  ${result.changed} of ${result.cells} cell(s) changed`);
console.log(`    ${result.nowAnswered} cell(s) now answered that were not`);
console.log(`    ${result.nowUnresolved} cell(s) now unresolved that were answered`);
console.log(`\n  the export rows still describe the old answers. Rebuild them with:`);
console.log(`    npm run -w backend verify -- --run ${run.id}\n`);
