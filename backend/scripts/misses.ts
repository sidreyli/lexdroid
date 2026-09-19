/**
 * Where a run's wrong answers actually come from.
 *
 *   npm run -w backend misses -- --run <id>
 *   npm run -w backend misses -- --run <id> --cells       every disagreement, with its mechanism
 *   npm run -w backend misses -- --run <id> --ablate      what the second reading is worth
 *
 * `scorecard` says how many cells are wrong and in which direction. That is the right first
 * question and the wrong second one: 65 disagreements listed economy by economy look like 65
 * separate problems, and a week could be spent on any one of them.
 *
 * So ask instead which of them are the same problem. An indicator that is wrong in Australia and
 * right in Malaysia and Singapore is plausibly a retrieval accident in one corpus. An indicator
 * wrong in all three is not an accident -- it is a rule that does not mean what ESCAP means, and
 * one fix moves three cells. On run 82673dbf that split 65 wrong cells into 18 indicators carrying
 * 43 of them and a tail of 22 singletons, which is a fortnight's work ordered rather than a list.
 *
 * Every number here is derived from the stored record. No engine, no network, and no run: the
 * decision is a pure function of the readings and the banked verdicts, so a rule change can be
 * graded against ESCAP before it is committed and before anything is fetched again.
 */
import { openDb } from '../src/db/index.js';
import { scorecard, tally, movement, type CellResult } from '../src/eval/scorecard.js';
import { rescoreRun } from '../src/run/rescore.js';
import { loadConfirmations, noConfirmations } from '../src/read/confirmations.js';
import { loadRubric } from '../src/rubric/index.js';
import { topBandScoresAbsence } from '../src/decide/index.js';

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

const cells = scorecard(db, run.id);
const all = tally(cells);
const graded = all.cells - all.ungraded;
const wrong = cells.filter((c) => c.verdict !== 'agree' && c.verdict !== 'ungraded');
const pad = (s: string | number, n: number) => String(s).padStart(n);

console.log(`\nRun ${run.id}`);
console.log(`  ${all.agree}/${graded} agree, ${wrong.length} to account for\n`);

// ---------------------------------------------------------------------------------------------
// Which disagreements are the same disagreement.
// ---------------------------------------------------------------------------------------------
const byIndicator = new Map<string, CellResult[]>();
for (const c of cells) {
  if (c.verdict === 'ungraded') continue;
  const list = byIndicator.get(c.indicator);
  if (list) list.push(c);
  else byIndicator.set(c.indicator, [c]);
}

type Group = { id: string; economies: number; wrong: CellResult[]; kinds: string };
const groups: Group[] = [];
for (const [id, list] of byIndicator) {
  const bad = list.filter((c) => c.verdict !== 'agree');
  if (bad.length === 0) continue;
  groups.push({
    id,
    economies: list.length,
    wrong: bad,
    kinds: [...new Set(bad.map((c) => c.verdict))].sort().join(' + '),
  });
}

// Wrong everywhere first, then by how many cells the indicator costs.
groups.sort((a, b) => b.wrong.length - a.wrong.length || a.id.localeCompare(b.id));

let systematic = 0;
for (const tier of [3, 2, 1]) {
  const tierGroups = groups.filter((g) => g.wrong.length === tier && g.economies === 3);
  if (tierGroups.length === 0) continue;
  const cost = tierGroups.reduce((n, g) => n + g.wrong.length, 0);
  if (tier > 1) systematic += cost;
  const heading =
    tier === 3
      ? 'wrong in every economy -- the rule, not the corpus'
      : tier === 2
        ? 'wrong in two of three'
        : 'wrong in one of three -- plausibly a retrieval accident';
  console.log(`  ${tierGroups.length} indicator(s) ${heading}  (${cost} cell(s))`);
  for (const g of tierGroups) {
    const spread = g.wrong.map((c) => `${c.economy} ${c.ours ?? '-'}->${c.theirs ?? '-'}`).join('  ');
    console.log(`    ${g.id.padEnd(8)} ${g.kinds.padEnd(26)} ${spread}`);
  }
  console.log('');
}

const share = wrong.length === 0 ? 0 : (100 * systematic) / wrong.length;
console.log(
  `  ${systematic} of ${wrong.length} wrong cells (${share.toFixed(0)}%) sit on an indicator that is\n` +
    `  wrong in more than one economy, so they are one defect each and not ${wrong.length}.\n`,
);

// ---------------------------------------------------------------------------------------------
// What each disagreement had in hand when it was decided.
//
// The kinds need opposite fixes and the record already says which is which: whether the answer
// rested on any provision at all, and whether the indicator's top band scores an absence -- where
// it does, finding nothing and finding a genuine absence are the same output.
// ---------------------------------------------------------------------------------------------
const indicators = new Map(loadRubric().indicators.map((i) => [i.id as string, i]));
const basis = new Map(
  (
    db
      .prepare(
        `SELECT c.economy_code || '/' || c.indicator_id AS key, a.deciding_fact,
                (SELECT COUNT(*) FROM answer_basis b
                  WHERE b.cell_id = c.id AND b.section_id IS NOT NULL) AS provisions,
                (SELECT COUNT(*) FROM answer_basis b
                  WHERE b.cell_id = c.id AND b.section_id IS NULL) AS frameworks
           FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
          WHERE c.run_id = ?`,
      )
      .all(run.id) as { key: string; deciding_fact: string | null; provisions: number; frameworks: number }[]
  ).map((r) => [r.key, r]),
);

const shape = new Map<string, number>();
for (const c of wrong) {
  const b = basis.get(`${c.economy}/${c.indicator}`);
  const absence = topBandScoresAbsence(indicators.get(c.indicator)!);
  const stood =
    (b?.provisions ?? 0) > 0 ? 'on a provision' : (b?.frameworks ?? 0) > 0 ? 'on a framework' : 'on nothing';
  const key = `${c.verdict.padEnd(12)} stood ${stood.padEnd(15)} ${absence ? 'absence-top' : 'presence-top'}`;
  shape.set(key, (shape.get(key) ?? 0) + 1);
}
console.log('  what the wrong answers stood on');
for (const [k, n] of [...shape].sort((a, b) => b[1] - a[1])) console.log(`    ${pad(n, 3)}  ${k}`);

// An indicator whose top band scores an absence cannot tell a retrieval miss from a real finding of
// absence, so it is worth knowing whether those cells fail more often than the rest. On 82673dbf
// they did not: 38% against 35%, which retires a plausible theory of where the errors come from.
const absenceCells = cells.filter(
  (c) => c.verdict !== 'ungraded' && topBandScoresAbsence(indicators.get(c.indicator)!),
);
const absenceWrong = absenceCells.filter((c) => c.verdict !== 'agree').length;
const otherCells = graded - absenceCells.length;
const otherWrong = wrong.length - absenceWrong;
const rate = (n: number, of: number) => (of === 0 ? '  -' : `${((100 * n) / of).toFixed(0)}%`);
console.log(
  `\n  indicators whose top band scores an absence: ${absenceWrong}/${absenceCells.length} wrong (${rate(absenceWrong, absenceCells.length)})\n` +
    `  every other indicator:                      ${otherWrong}/${otherCells} wrong (${rate(otherWrong, otherCells)})`,
);

if (process.argv.includes('--cells')) {
  console.log('\n  every disagreement, worst indicator first');
  console.log('    verdict      eco  indicator  ours  escap  findings  stood on     deciding fact');
  for (const g of groups) {
    for (const c of g.wrong.sort((a, b) => a.economy.localeCompare(b.economy))) {
      const b = basis.get(`${c.economy}/${c.indicator}`);
      const stood = `${b?.provisions ?? 0}p ${b?.frameworks ?? 0}f`;
      console.log(
        `    ${c.verdict.padEnd(12)} ${c.economy}  ${c.indicator.padEnd(9)} ${pad(c.ours ?? '-', 4)}  ${pad(c.theirs ?? '-', 5)}  ` +
          `${pad(c.findings, 8)}  ${stood.padEnd(11)}  ${(b?.deciding_fact ?? '').slice(0, 58)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------------------------
// What the second reading is worth, measured rather than assumed.
//
// Re-scoring is a pure function of the readings and a set of verdicts, so the pass can be graded by
// scoring the same run twice, with the set and without it. Both happen inside a transaction that is
// rolled back: this reports on the store without touching it.
// ---------------------------------------------------------------------------------------------
if (process.argv.includes('--ablate')) {
  console.log('\n  the second reading, ablated');
  for (const [label, set] of [
    ['every banked verdict', loadConfirmations(db)],
    ['no confirmations at all', noConfirmations()],
  ] as const) {
    db.exec('BEGIN');
    const result = rescoreRun(db, run.id, { confirmations: set });
    const after = scorecard(db, run.id);
    const t = tally(after);
    const moves = movement(cells, after);
    db.exec('ROLLBACK');
    console.log(
      `    ${label.padEnd(24)} ${pad(t.agree, 3)}/${graded} agree   ` +
        `over ${pad(t['over-claim'], 2)}  under ${pad(t['under-claim'], 2)}  ` +
        `miss ${pad(t['recall-miss'], 2)}  abstained ${pad(t.abstained, 2)}   ` +
        `${result.changed} cell(s) differ, +${moves.filter((m) => m.to === 'agree').length} fixed ` +
        `-${moves.filter((m) => m.from === 'agree').length} broken`,
    );
  }
  // Scoring against the set that is already banked must reproduce the stored answer exactly. Where
  // it does not, the stored scores are not a function of the record and nothing else here can be
  // trusted -- so it is checked here rather than assumed.
  console.log('    (the first line re-derives the stored scores; 0 differing is the check)');
}

console.log('');
