/**
 * Fill in what a recorded run's answers stood on.
 *
 * Runs recorded before `answer_basis` existed have the findings and the score but not the link
 * between them, so their export cannot tell a measure from a finding Zone 3 set aside. This
 * re-derives the decision from the record and writes the link.
 *
 *   npm run -w backend basis -- --run <id>
 *   npm run -w backend basis -- --run <id> --write
 *
 * Without --write it reports and changes nothing. A cell whose score does not re-derive is left
 * alone and named: its basis would be a different answer's basis.
 */
import { openDb } from '../src/db/index.js';
import { recordedDecider } from '../src/decide/record.js';
import { ratesOfRun } from '../src/run/index.js';

const args = process.argv.slice(2);
const runId = args[args.indexOf('--run') + 1];
const write = args.includes('--write');
if (!runId || runId.startsWith('--')) {
  console.error('usage: basis -- --run <id> [--write]');
  process.exit(1);
}

const db = openDb();
const { cells, rebuild } = recordedDecider(db, runId, ratesOfRun(db, runId));
if (cells.length === 0) {
  console.error(`No cells recorded for run ${runId}.`);
  process.exit(1);
}

const insert = db.prepare(
  `INSERT OR IGNORE INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure)
   VALUES (?, ?, ?, ?, ?)`,
);
const clear = db.prepare('DELETE FROM answer_basis WHERE cell_id = ?');
const setState = db.prepare('UPDATE cell SET state = ? WHERE id = ?');

let entries = 0;
let restated = 0;
const skipped: string[] = [];

db.transaction(() => {
  for (const cell of cells) {
    const again = rebuild(cell);
    if (!again) {
      skipped.push(`${cell.economy_code} ${cell.indicator_id}: no rubric entry`);
      continue;
    }
    if (again.score !== cell.score || (again.band?.ordinal ?? null) !== cell.band_ordinal) {
      skipped.push(
        `${cell.economy_code} ${cell.indicator_id}: recorded ${cell.score ?? 'none'}, re-derives ${again.score ?? 'none'}`,
      );
      continue;
    }
    if (!write) {
      entries += again.basis.length + (again.state === 'restricted' && again.frameworkBasis.length > 0 ? 1 : 0);
      continue;
    }
    clear.run(cell.id);
    let ordinal = 0;
    for (const e of again.basis) {
      insert.run(cell.id, (ordinal += 1), e.instrumentId, e.sectionId, e.finding.measure);
      entries += 1;
    }
    const framework = again.state === 'restricted' ? again.frameworkBasis[0] : undefined;
    if (framework) {
      insert.run(cell.id, (ordinal += 1), framework.instrumentId, null, null);
      entries += 1;
    }
    // The state names what was found, and the rule that decides it has changed under this run.
    const state = db.prepare('SELECT state FROM cell WHERE id = ?').get(cell.id) as { state: string };
    if (state.state !== again.state) {
      setState.run(again.state, cell.id);
      restated += 1;
    }
  }
})();

console.log(`${cells.length} cell(s); ${entries} basis entr(ies)${write ? ' written' : ' (dry run)'}.`);
if (restated > 0) console.log(`${restated} cell(s) restated: the band was chosen on an absence, not a finding.`);
if (skipped.length > 0) {
  console.log(`\n${skipped.length} cell(s) left alone:`);
  for (const s of skipped) console.log(`  ${s}`);
}
