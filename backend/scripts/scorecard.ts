/**
 * How does this run compare with ESCAP's answers?
 *
 *   npm run -w backend scorecard -- --run <id>
 *   npm run -w backend scorecard -- --run <id> --against <id>     what moved between two runs
 *   npm run -w backend scorecard -- --run <id> --cells over-claim listing, worst pillar first
 */
import { openDb } from '../src/db/index.js';
import { scorecard, tally, groupBy, movement, type Verdict, type CellResult } from '../src/eval/scorecard.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const db = openDb();
const latest = () =>
  (db.prepare('SELECT id FROM run ORDER BY started_at DESC LIMIT 1').get() as { id: string } | undefined)?.id ?? '';
const runId = arg('run') === 'latest' || arg('run') === null ? latest() : arg('run')!;
const cells = scorecard(db, runId);
if (cells.length === 0) {
  console.log(`No cells for run ${runId}.`);
  process.exit(0);
}

const pct = (n: number, of: number) => (of === 0 ? '  -  ' : `${((100 * n) / of).toFixed(1)}%`);
const pad = (s: string | number, n: number) => String(s).padStart(n);

const all = tally(cells);
const graded = all.cells - all.ungraded;
console.log(`\nRun ${runId}`);
console.log(`\n  ${graded} graded cell(s): ${all.agree} agree (${pct(all.agree, graded)})`);
console.log(`    over-claim   ${pad(all['over-claim'], 4)}   read an instrument and claimed more than it says`);
console.log(`    recall-miss  ${pad(all['recall-miss'], 4)}   found nothing where ESCAP found a measure`);
console.log(`    abstained    ${pad(all.abstained, 4)}   no answer offered`);
console.log(`    findings     ${pad(all.findings, 4)}   ESCAP writes about 250 rows for these three economies`);

console.log('\n  by economy');
console.log('    economy  cells  agree         over  miss  abst  findings');
for (const [economy, group] of groupBy(cells, (c) => c.economy)) {
  const t = tally(group);
  const g = t.cells - t.ungraded;
  console.log(
    `    ${economy.padEnd(7)}  ${pad(g, 5)}  ${pad(t.agree, 5)} ${pct(t.agree, g).padStart(6)}  ${pad(t['over-claim'], 4)}  ${pad(t['recall-miss'], 4)}  ${pad(t.abstained, 4)}  ${pad(t.findings, 8)}`,
  );
}

console.log('\n  by pillar, worst first');
const byPillar = [...groupBy(cells, (c) => c.pillar)]
  .map(([pillar, group]) => ({ pillar, t: tally(group) }))
  .sort((a, b) => b.t['over-claim'] + b.t['recall-miss'] - (a.t['over-claim'] + a.t['recall-miss']));
console.log('    pillar  cells  agree         over  miss  abst  findings');
for (const { pillar, t } of byPillar) {
  const g = t.cells - t.ungraded;
  console.log(
    `    ${pad(pillar, 6)}  ${pad(g, 5)}  ${pad(t.agree, 5)} ${pct(t.agree, g).padStart(6)}  ${pad(t['over-claim'], 4)}  ${pad(t['recall-miss'], 4)}  ${pad(t.abstained, 4)}  ${pad(t.findings, 8)}`,
  );
}

const wanted = arg('cells') as Verdict | null;
if (wanted) {
  const listed = cells.filter((c) => c.verdict === wanted).sort((a, b) => b.findings - a.findings);
  console.log(`\n  ${listed.length} ${wanted} cell(s), most findings first`);
  console.log('    economy  indicator  ours  escap  findings  instruments');
  for (const c of listed) {
    console.log(
      `    ${c.economy.padEnd(7)}  ${c.indicator.padEnd(9)}  ${pad(c.ours ?? '-', 4)}  ${pad(c.theirs ?? '-', 5)}  ${pad(c.findings, 8)}  ${pad(c.instruments, 11)}`,
    );
  }
}

const against = arg('against');
if (against) {
  const before = scorecard(db, against);
  const moves = movement(before, cells);
  const better = moves.filter((m) => m.to === 'agree');
  const worse = moves.filter((m) => m.from === 'agree');
  console.log(`\n  against ${against}: ${tally(before).agree} agree -> ${all.agree} agree`);
  console.log(`    ${better.length} cell(s) fixed, ${worse.length} broken, ${moves.length - better.length - worse.length} reclassified`);
  for (const m of moves) console.log(`    ${m.economy} ${m.indicator.padEnd(8)} ${m.from} -> ${m.to}`);
}

const show = (c: CellResult) => `${c.economy} ${c.indicator}`;
const worst = cells.filter((c) => c.instruments > 20).sort((a, b) => b.instruments - a.instruments);
if (worst.length > 0) {
  console.log(`\n  ${worst.length} cell(s) cite more than 20 instruments; ESCAP cites one to three`);
  for (const c of worst.slice(0, 8)) console.log(`    ${show(c)}: ${c.instruments} instruments, ${c.findings} findings`);
}
console.log('');
