/**
 * Grade the five-economy benchmark and say what a change did to it, cell by cell.
 *
 *   npm run -w backend bench-diff                          grade the packs as they are
 *   npm run -w backend bench-diff -- --use IND:12=<run>    pillar 12 of India from a new run
 *   npm run -w backend bench-diff -- --use MYS=<run>       all of Malaysia from a new run
 *   npm run -w backend bench-diff -- --write-reference     re-bank reference.json
 *
 * The packs (scripts/bench-pack.ts) sit in ../bench-pack unless --packs says otherwise. A run named
 * by --use must be in the pack the manifest gives that economy; a re-read made with
 * `gate --retrieval-from` on that pack is. A fresh run is cut into a pack of its own and named with
 * `--use AUS:7=<run>@<file>`: re-cutting the old pack from the working database would carry any
 * re-parse made since into the runs it already held, and a reading on a section that no longer
 * exists leaves with the section.
 *
 * Every run is rescored under the current rules inside a transaction that is rolled back, so a
 * rule change is measured without a re-read and nothing in a pack is changed. Each cell is then
 * set beside the packs' reference.json (it carries ESCAP's scores, so it ships with them) and the
 * hand audit in bench/manifest.json:
 *
 *   agree   our score is ESCAP's
 *   earned  an agreement the audit did not find resting on the wrong law
 *   right   earned, or one of the audit's finds with our score still the one the find is about
 *
 * A pillar is declarable when at least `declareAt` of its graded cells are right. What prints is
 * every cell whose score or leading citation moved, and the totals and declarable pillars before
 * and after. An agreement whose citation moved is flagged too: it may no longer be earned, and
 * only reading the new citation says whether it is.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db/index.js';
import { scorecard } from '../src/eval/scorecard.js';
import { rescoreRun } from '../src/run/rescore.js';
import { confirmationsForRun } from '../src/read/confirmations.js';

const here = dirname(fileURLToPath(import.meta.url));
const BENCH = join(here, '..', 'bench');

interface Source {
  economy: string;
  pack: string;
  run: string;
  pillars?: number[];
  skip?: number[];
}
interface Manifest {
  packs: Record<string, string>;
  sources: Source[];
  audit: { unearned: string[]; finds: Record<string, number>; contestable: string[]; notAnswerable: string[] };
  declareAt: number;
}
interface Cell {
  economy: string;
  indicator: string;
  pillar: number;
  ours: number | null;
  escap: number | null;
  verdict: string;
  basis: string | null;
  run: string;
}

const argv = process.argv.slice(2);
const all = (name: string): string[] => argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1] ?? ''] : []));
const packsDir = resolve(all('packs')[0] ?? join(here, '..', '..', 'bench-pack'));
const manifest = JSON.parse(readFileSync(join(BENCH, 'manifest.json'), 'utf8')) as Manifest;
// The baseline the reference was graded against ships with the packs, so a teammate's own copy --
// imported from a different kit, or not at all -- cannot move every verdict at once.
const shipped = join(packsDir, 'baseline.db');
const baseline = existsSync(shipped) ? shipped : undefined;

// --use ECO=<run> or ECO:p,q=<run>: the named pillars (or all) of an economy come from that run,
// found in the economy's pack or, after an @, in the pack file named.
const sources: Source[] = [...manifest.sources];
for (const use of all('use')) {
  const m = /^([A-Z]{3})(?::([\d,]+))?=([^@\s]+)(?:@(\S+))?$/.exec(use);
  if (!m) {
    console.error(`--use ${use}: expected ECO=<run>, ECO:12,8=<run> or ECO:12=<run>@<pack file>`);
    process.exit(2);
  }
  const [, economy, pillarList, run, file] = m as unknown as [string, string, string | undefined, string, string | undefined];
  const pillars = pillarList ? pillarList.split(',').map(Number) : null;
  const pack = file ?? sources.find((s) => s.economy === economy)?.pack;
  if (!pack) {
    console.error(`--use ${use}: ${economy} is not in the benchmark`);
    process.exit(2);
  }
  // Cut the pillars out of whatever answered them before, then add the new run for them.
  for (const s of sources.filter((x) => x.economy === economy)) {
    if (!pillars) s.pillars = [];
    else if (s.pillars) s.pillars = s.pillars.filter((p) => !pillars.includes(p));
    else s.skip = [...(s.skip ?? []), ...pillars];
  }
  sources.push({ economy, pack, run, ...(pillars ? { pillars } : {}) });
}

function grade(source: Source): Cell[] {
  const path = join(packsDir, manifest.packs[source.pack] ?? source.pack);
  const db = openDb(path);
  try {
    const run = db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${source.run}%`) as { id: string } | undefined;
    if (!run) throw new Error(`No run ${source.run} in ${path}`);
    db.exec('BEGIN');
    try {
      rescoreRun(db, run.id, { confirmations: confirmationsForRun(db, run.id) });
      const lead = db.prepare(
        `SELECT i.title, b.quote FROM answer_basis b JOIN cell c ON c.id = b.cell_id
           LEFT JOIN instrument i ON i.id = b.instrument_id
          WHERE c.run_id = ? AND c.economy_code = ? AND c.indicator_id = ?
          ORDER BY b.ordinal LIMIT 1`,
      );
      return scorecard(db, run.id, baseline)
        .filter((r) => r.economy === source.economy && r.verdict !== 'ungraded')
        .filter((r) => (source.pillars ? source.pillars.includes(r.pillar) : true))
        .filter((r) => !(source.skip ?? []).includes(r.pillar))
        .map((r) => {
          const b = lead.get(run.id, r.economy, r.indicator) as { title: string | null; quote: string | null } | undefined;
          return {
            economy: r.economy,
            indicator: r.indicator,
            pillar: r.pillar,
            ours: r.ours,
            escap: r.theirs,
            verdict: r.verdict,
            basis: b ? `${b.title ?? '?'} :: ${(b.quote ?? '').slice(0, 160)}` : null,
            run: run.id,
          };
        });
    } finally {
      db.exec('ROLLBACK');
    }
  } finally {
    db.close();
  }
}

const key = (c: Pick<Cell, 'economy' | 'indicator'>) => `${c.economy} ${c.indicator}`;
const unearned = new Set(manifest.audit.unearned);
const agrees = (c: Cell) => c.verdict === 'agree';
const earned = (c: Cell) => agrees(c) && !unearned.has(key(c));
const isFind = (c: Cell) => key(c) in manifest.audit.finds && c.ours === manifest.audit.finds[key(c)];
const right = (c: Cell) => earned(c) || isFind(c);

function summary(cells: Cell[]) {
  const byEco = new Map<string, Cell[]>();
  for (const c of cells) byEco.set(c.economy, [...(byEco.get(c.economy) ?? []), c]);
  const out = new Map<string, { agree: number; earned: number; right: number; graded: number; declarable: number[] }>();
  for (const [eco, cs] of byEco) {
    const pillars = [...new Set(cs.map((c) => c.pillar))].sort((a, b) => a - b);
    out.set(eco, {
      agree: cs.filter(agrees).length,
      earned: cs.filter(earned).length,
      right: cs.filter(right).length,
      graded: cs.length,
      declarable: pillars.filter((p) => {
        const inP = cs.filter((c) => c.pillar === p);
        return inP.filter(right).length / inP.length >= manifest.declareAt;
      }),
    });
  }
  return out;
}

const cells = sources.flatMap((s) => {
  if (s.pillars && s.pillars.length === 0) return [];
  process.stderr.write(`grading ${s.economy} from ${s.run.slice(0, 8)}${s.pillars ? ` pillars ${s.pillars.join(',')}` : ''}${s.skip ? ` (not ${s.skip.join(',')})` : ''}\n`);
  return grade(s);
});
const order = ['AUS', 'MYS', 'SGP', 'IND', 'THA'];
cells.sort((a, b) => order.indexOf(a.economy) - order.indexOf(b.economy) || a.indicator.localeCompare(b.indicator, 'en', { numeric: true }));

// ESCAP's score for every cell is its answer key, which the repository never carries (see .gitignore),
// so the reference travels with the packs.
const refPath = join(packsDir, 'reference.json');
if (argv.includes('--write-reference')) {
  const labelled = cells.map((c) => ({
    economy: c.economy,
    indicator: c.indicator,
    ours: c.ours,
    escap: c.escap,
    verdict: c.verdict,
    label: isFind(c)
      ? 'find'
      : earned(c)
        ? 'earned'
        : agrees(c)
          ? 'unearned'
          : manifest.audit.contestable.includes(key(c))
            ? 'contestable'
            : manifest.audit.notAnswerable.includes(key(c))
              ? 'not-answerable'
              : 'wrong',
    basis: c.basis,
    run: c.run,
  }));
  writeFileSync(refPath, JSON.stringify(labelled, null, 1) + '\n');
  console.log(`Wrote ${labelled.length} cells to ${refPath}`);
}

const reference = JSON.parse(readFileSync(refPath, 'utf8')) as (Cell & { label: string })[];
const before = new Map(reference.map((r) => [key(r), r]));

const moved = cells.filter((c) => {
  const r = before.get(key(c));
  return !r || r.ours !== c.ours || r.basis !== c.basis;
});
if (moved.length === 0) {
  console.log('\nNo cell moved against reference.json.');
} else {
  console.log(`\n${moved.length} cell(s) moved against reference.json:\n`);
  for (const c of moved) {
    const r = before.get(key(c));
    const was = r ? `${r.ours ?? '-'} (${r.label})` : 'not in the reference';
    const now = `${c.ours ?? '-'} vs ESCAP ${c.escap ?? '-'}, ${right(c) ? 'right' : agrees(c) ? 'agrees' : c.verdict}`;
    const flag = r && r.ours === c.ours ? '   citation moved -- check it is still the right law' : '';
    console.log(`  ${key(c).padEnd(11)} ${was} -> ${now}${flag}`);
    if (r && r.basis !== c.basis) {
      console.log(`      was: ${r.basis ?? '(none)'}`);
      console.log(`      now: ${c.basis ?? '(none)'}`);
    }
  }
}

const refCells = reference.map((r) => ({ ...r, pillar: Number.parseInt(r.indicator, 10) }));
const was = summary(refCells);
const now = summary(cells);
console.log('\n        agree       earned      right        declarable pillars (>= ' + manifest.declareAt * 100 + '% right)');
let totals = [0, 0, 0, 0, 0, 0, 0];
for (const eco of order) {
  const a = was.get(eco);
  const b = now.get(eco);
  if (!a || !b) continue;
  const pair = (x: number, y: number) => (x === y ? `${y}`.padEnd(11) : `${x} -> ${y}`.padEnd(11));
  const dec = a.declarable.join(',') === b.declarable.join(',')
    ? `${b.declarable.length}: ${b.declarable.join(', ')}`
    : `${a.declarable.length} -> ${b.declarable.length}: ${b.declarable.join(', ')}  (was ${a.declarable.join(', ')})`;
  console.log(`  ${eco}  ${pair(a.agree, b.agree)} ${pair(a.earned, b.earned)} ${pair(a.right, b.right)}  ${dec}`);
  totals = [totals[0]! + a.agree, totals[1]! + b.agree, totals[2]! + a.earned, totals[3]! + b.earned, totals[4]! + a.right, totals[5]! + b.right, totals[6]! + b.graded];
}
const [aa, ba, ae, be, ar, br, graded] = totals as [number, number, number, number, number, number, number];
console.log(`  all  ${`${aa}${aa === ba ? '' : ` -> ${ba}`}`.padEnd(11)} ${`${ae}${ae === be ? '' : ` -> ${be}`}`.padEnd(11)} ${`${ar}${ar === br ? '' : ` -> ${br}`}`.padEnd(11)}  of ${graded}`);
