/**
 * Does the query rewrite in 3c622cf reach ESCAP's instrument more often, or less?
 *
 * The commit makes four changes to how a phrase becomes an FTS5 query: NFC normalisation, Thai
 * SARA AM canonicalisation, a split that keeps combining marks attached, and trigram expansion of
 * spaceless script. None of those can touch a Latin query -- checked, not assumed: over the 342
 * distinct queries our runs have actually asked, the first three produce a byte-identical term list
 * and the fourth never fires. What is left is a fifth change the commit message does not mention,
 * deduplicating the term list, and that one applies to every query we ask.
 *
 * So the comparison worth running is master against the commit, and the only queries that can move
 * are the ones holding a repeated term. Identical query strings are not asked twice.
 *
 *   npm run -w backend lexical-ab -- --db <snapshot> --baseline <path> --depth 40
 *
 * Measured against ESCAP's own citation, which names the instrument per indicator, so recall is a
 * count rather than an argument. A cell whose cited instrument we never discovered is skipped: that
 * is a discovery failure, and charging retrieval for it would muddy the result. Nothing here writes,
 * and the baseline is read for evaluation, which is one of the two permitted uses.
 */
import Database from 'better-sqlite3';
import { openBaseline, citedInstruments, sameInstrument } from '../src/baseline/index.js';
import { loadRubric } from '../src/rubric/index.js';
import { queriesFor } from '../src/retrieve/index.js';
import { economyNames } from '../src/profile/index.js';
import { MIN_TRIGRAM_TERM } from '../src/db/index.js';
import { canonicalizeThai } from '../src/util/thai.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const SPACELESS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const SPACELESS_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]+/gu;
const MAX_QUERY_TERMS = 96;

function expand(token: string): string[] {
  if (!SPACELESS.test(token)) return [token];
  const out: string[] = [];
  let last = 0;
  for (const m of token.matchAll(SPACELESS_RUN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(token.slice(last, at));
    const run = m[0];
    if (run.length <= MIN_TRIGRAM_TERM) out.push(run);
    else for (let i = 0; i + MIN_TRIGRAM_TERM <= run.length; i += 1) out.push(run.slice(i, i + MIN_TRIGRAM_TERM));
    last = at + run.length;
  }
  if (last < token.length) out.push(token.slice(last));
  return out;
}

const quoted = (terms: string[]): string | null =>
  terms.length === 0 ? null : terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');

/** master, as it stands today. */
function asMaster(phrase: string): string | null {
  return quoted(phrase.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= MIN_TRIGRAM_TERM));
}

/** 3c622cf exactly. */
function asMerged(phrase: string): string | null {
  return quoted(
    [
      ...new Set(
        canonicalizeThai(phrase.normalize('NFC'))
          .toLowerCase()
          .split(/[^\p{L}\p{N}\p{M}]+/u)
          .flatMap(expand)
          .filter((t) => t.length >= MIN_TRIGRAM_TERM),
      ),
    ].slice(0, MAX_QUERY_TERMS),
  );
}

const dbPath = arg('db') ?? 'data/lexdroid.db';
const depth = Number(arg('depth') ?? 40);
const economies = (arg('economies') ?? 'AUS,MYS,SGP').split(',');

const db = new Database(dbPath, { readonly: true });
const baseline = openBaseline(arg('baseline'));
const rubric = loadRubric();
const NAMES = economyNames();

// The owner comes back with the hit: resolving it per row afterwards was 40 extra statements a query.
const search = db.prepare(
  `SELECT f.rowid AS section_id, d.instrument_id AS owner, bm25(section_fts, 1.0, 0.5) AS score
     FROM section_fts f
     JOIN section s ON s.id = f.rowid
     JOIN document d ON d.id = s.document_id
    WHERE section_fts MATCH ?
      AND d.instrument_id IN (SELECT id FROM instrument WHERE economy_code = ?)
    ORDER BY score LIMIT ?`,
);
const instrumentsOf = db.prepare(`SELECT id, title FROM instrument WHERE economy_code = ?`);

/** One FTS call per distinct (query, economy), however many cells and variants ask for it. */
const cache = new Map<string, { section_id: number; owner: number }[]>();
function hitsFor(fts: string, economy: string): { section_id: number; owner: number }[] {
  const key = `${economy}\u0000${fts}`;
  const seen = cache.get(key);
  if (seen) return seen;
  const rows = search.all(fts, economy, depth) as { section_id: number; owner: number }[];
  cache.set(key, rows);
  return rows;
}

interface Tally {
  reached: number;
  inTopTen: number;
  mrrSum: number;
  cells: number;
}
const results: Record<'master' | 'merged', Tally> = {
  master: { reached: 0, inTopTen: 0, mrrSum: 0, cells: 0 },
  merged: { reached: 0, inTopTen: 0, mrrSum: 0, cells: 0 },
};

// Which cells are even measurable: ESCAP names an instrument, and we hold it.
const measurable: { economy: string; indicator: string; citedIds: Set<number> }[] = [];
for (const economy of economies) {
  const held = instrumentsOf.all(economy) as { id: number; title: string }[];
  for (const indicator of rubric.indicators) {
    const rows = baseline
      .prepare(
        `SELECT act_or_practice FROM baseline_row
          WHERE source = 'round-1' AND economy = ? AND indicator_id = ? AND act_or_practice IS NOT NULL`,
      )
      .all(NAMES.get(economy) ?? economy, indicator.id) as { act_or_practice: string }[];
    const cited = new Set<string>();
    for (const r of rows) for (const c of citedInstruments(r.act_or_practice)) cited.add(c);
    if (cited.size === 0) continue;
    const ids = new Set<number>();
    for (const h of held) for (const c of cited) if (sameInstrument(h.title, c)) ids.add(h.id);
    if (ids.size === 0) continue;
    measurable.push({ economy, indicator: indicator.id, citedIds: ids });
  }
}

const rank = (n: number): string => (Number.isFinite(n) ? String(n) : 'miss');
const moved: string[] = [];
let asked = 0;
let done = 0;

for (const cell of measurable) {
  const indicator = rubric.indicators.find((i) => i.id === cell.indicator);
  if (!indicator) continue;
  const queries = queriesFor(indicator, NAMES.get(cell.economy));

  /** The best rank any of this cell's queries gives a section of the cited instrument. */
  const bestUnder = (build: (p: string) => string | null): number => {
    let best = Infinity;
    for (const q of queries) {
      const fts = build(q);
      if (!fts) continue;
      if (!cache.has(`${cell.economy}\u0000${fts}`)) asked += 1;
      const hits = hitsFor(fts, cell.economy);
      for (let i = 0; i < hits.length; i += 1) {
        if (cell.citedIds.has(hits[i]!.owner)) {
          best = Math.min(best, i + 1);
          break;
        }
      }
    }
    return best;
  };

  const before = bestUnder(asMaster);
  const after = bestUnder(asMerged);

  for (const [name, best] of [['master', before], ['merged', after]] as const) {
    const t = results[name];
    t.cells += 1;
    if (best <= depth) t.reached += 1;
    if (best <= 10) t.inTopTen += 1;
    if (Number.isFinite(best)) t.mrrSum += 1 / best;
  }

  if (before !== after) {
    moved.push(`  ${after < before ? 'better' : 'worse '}  ${cell.economy} ${cell.indicator.padEnd(7)} ${rank(before)} -> ${rank(after)}`);
  }
  done += 1;
  process.stderr.write(`\r  ${done}/${measurable.length} cells, ${asked} searches`);
}

process.stderr.write('\n');
console.log(`\nCells where ESCAP names an instrument we hold: ${measurable.length}   (depth ${depth})`);
console.log(`Distinct searches run: ${asked}\n`);
console.log('variant   reached   in top 10      MRR');
for (const name of ['master', 'merged'] as const) {
  const t = results[name];
  console.log(
    `${name.padEnd(8)}  ${String(t.reached).padStart(3)}/${t.cells}   ${String(t.inTopTen).padStart(3)}/${t.cells}   ${(t.mrrSum / t.cells).toFixed(4)}`,
  );
}

const better = moved.filter((m) => m.includes('better')).length;
console.log(`\nCells whose best rank moved, master -> merged: ${moved.length}  (${better} better, ${moved.length - better} worse)`);
for (const line of moved) console.log(line);
