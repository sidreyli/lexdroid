/**
 * Grade the rules as they stand now against ESCAP, without touching the store.
 *
 *   npm run -w backend grade                    the latest complete run
 *   npm run -w backend grade -- --run <id>
 *
 * A rule change is a guess until it is scored. `misses` says which cells are wrong and which of
 * them are the same defect; this says what a change to the rules did about it -- how many cells it
 * moved, which ones it fixed, and, the number that decides whether to keep it, which ones it broke.
 *
 * It can do that because scoring is a pure function of the stored readings and the banked verdicts:
 * no engine, no network and no run. So the loop is edit, grade, keep or revert, and a change that
 * wins three cells and loses three is visible before it is committed rather than after the next
 * fetch. Narrowing the online-payment domain looked obviously right and measured +0 -3; the gate on
 * opaque standard-setting measured +3 -0. Nothing distinguished them beforehand.
 *
 * Four changes have now been graded, and the two that lost say something the two that won do not.
 * A name gate pays when the measure is defined by a *modality* -- a period, a licence, an identity,
 * an absence -- because a provision imposing one has to utter it in the sentence that imposes it.
 * It loses when the measure is defined by a *topic*. Gating pillar 4's enforcement measures on the
 * word "patent", and the copyright ones on "copyright", is what each measure's own `defines`
 * sentence asks for and what its gloss warns about twice ("a design, a copyright work or property
 * at large is not a patent"). It measured +0 -3 across the two halves, separately: a section of the
 * Patents Act headed "Infringement proceedings" says "the court may grant an injunction restraining
 * the infringement" and never says "patent", because the instrument's title already did. A topic is
 * carried by the document; only a modality has to appear in the words. That is what SUBJECT_DOMAIN
 * is for, and asking the name side to do the subject side's job costs cells both times it is tried.
 *
 * Gating 3.1's two equity caps on a proportion -- which is a modality, and which their `defines`
 * asks for in those words -- measured +0 -0: every reading already stated one, so whatever is wrong
 * with 3.1 in all three economies is not that the cap was never named. Reverted too. A change that
 * moves nothing is not free; it is a rule to maintain that buys no accuracy.
 *
 * The rescore runs inside a transaction that is rolled back, so the stored answers are unchanged
 * and running this never needs to be undone. With the rules untouched it must print 0 cells moved:
 * that is the check that the stored scores really are a function of the record, and if it ever
 * prints anything else, no other number here means what it says.
 */
import { openDb } from '../src/db/index.js';
import { scorecard, tally, movement } from '../src/eval/scorecard.js';
import { rescoreRun } from '../src/run/rescore.js';
import { loadConfirmations } from '../src/read/confirmations.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const db = openDb();
const wanted = arg('run') ?? 'latest';
const run = (
  wanted === 'latest'
    ? db.prepare("SELECT id FROM run WHERE status = 'complete' ORDER BY started_at DESC LIMIT 1").get()
    : db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${wanted}%`)
) as { id: string } | undefined;

if (!run) {
  console.log(wanted === 'latest' ? 'No completed runs recorded yet.' : `No run ${wanted}.`);
  process.exit(0);
}

const before = scorecard(db, run.id);
const b = tally(before);

db.exec('BEGIN');
rescoreRun(db, run.id, { confirmations: loadConfirmations(db) });
const after = scorecard(db, run.id);
const a = tally(after);
const moves = movement(before, after);
db.exec('ROLLBACK');

const graded = a.cells - a.ungraded;
const fixed = moves.filter((m) => m.to === 'agree');
const broke = moves.filter((m) => m.from === 'agree');

console.log(`\nRun ${run.id}`);
console.log(`  as answered      ${b.agree}/${graded} agree`);
console.log(
  `  as the rules now ${a.agree}/${graded} agree   over ${a['over-claim']}  under ${a['under-claim']}  ` +
    `miss ${a['recall-miss']}  abstained ${a.abstained}`,
);
console.log(`  +${fixed.length} fixed  -${broke.length} broken  (${moves.length} cell(s) moved)\n`);
for (const m of fixed) console.log(`    fixed   ${m.economy} ${m.indicator.padEnd(8)} ${m.from} -> agree`);
for (const m of broke) console.log(`    broke   ${m.economy} ${m.indicator.padEnd(8)} agree -> ${m.to}`);
const sideways = moves.filter((m) => m.to !== 'agree' && m.from !== 'agree');
for (const m of sideways)
  console.log(`    still wrong ${m.economy} ${m.indicator.padEnd(8)} ${m.from} -> ${m.to}`);
if (moves.length === 0) console.log('    nothing moved: the rules reproduce the stored answers exactly.');
console.log('');
