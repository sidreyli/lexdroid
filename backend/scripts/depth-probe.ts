/**
 * Where ESCAP's own provision sits when we rank inside the instrument we already chose.
 *
 * The shortlist lets one instrument hold twelve seats at most, so an Act of four thousand
 * provisions is read twelve provisions deep. This asks the question that decides whether a second,
 * instrument-restricted pass would find anything: rank that Act's provisions by the cell's own
 * queries and see what rank ESCAP's cited section takes. A rank of four hundred says the depth was
 * never the problem.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { loadRubric } from '../src/rubric/index.js';
import { queriesFor } from '../src/retrieve/index.js';
import { ftsQuery } from '../src/index/index.js';

const RUN = 'b78c76f0-cf8b-4fab-a569-c7b11ca6800a';
const CSV = process.argv[2]!;
const NAME: Record<string, string> = { AUS: 'Australia', MYS: 'Malaysia', SGP: 'Singapore' };

const db = new Database('backend/data/lexdroid.db', { readonly: true });
db.exec(`ATTACH DATABASE 'backend/data/baseline.db' AS b`);
const indicators = new Map(loadRubric().indicators.map((i) => [i.id as string, i]));

const verdicts = readFileSync(CSV, 'utf8')
  .split('\n')
  .slice(1)
  .filter(Boolean)
  .map((l) => l.split(','))
  .filter((f) => f[7] === 'under-claim')
  .map((f) => ({ economy: f[0]!, indicator: f[1]! }));

const SECTION_REF = /\b(?:section|sec\.|s\.|reg(?:ulation)?\.?|article|art\.)\s*([0-9]+[A-Za-z]*)/gi;
const stop = new Set(['act', 'the', 'and', 'regulations', 'rules', 'order', 'code', 'law', 'under', 'with']);
const terms = (s: string): Set<string> =>
  new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !stop.has(w)),
  );

/** Rank every provision of one instrument against one query set, lexically, by reciprocal rank fusion. */
function rankWithin(instrumentId: number, queries: string[]): number[] {
  const scores = new Map<number, number>();
  for (const q of queries) {
    const m = ftsQuery(q);
    if (!m) continue;
    const hits = db
      .prepare(
        `SELECT f.rowid AS id, bm25(section_fts, 1.0, 0.5) AS score
           FROM section_fts f JOIN section s ON s.id = f.rowid
           JOIN document d ON d.id = s.document_id
          WHERE section_fts MATCH ? AND d.instrument_id = ?
          ORDER BY score LIMIT 500`,
      )
      .all(m, instrumentId) as { id: number }[];
    hits.forEach((h, i) => scores.set(h.id, (scores.get(h.id) ?? 0) + 1 / (60 + i + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

console.log(`  cell      ESCAP provision           in corpus  read?  rank inside the Act  Act size`);
let reachable = 0;
let counted = 0;
for (const { economy, indicator } of verdicts) {
  const rows = db
    .prepare(
      `SELECT act_or_practice, coverage, impact, note, references_raw FROM b.baseline_row
        WHERE source = 'round-1' AND economy = ? AND indicator_id = ?`,
    )
    .all(NAME[economy] ?? economy, indicator) as Record<string, string | null>[];
  const labels = new Set<string>();
  const want = new Set<string>();
  for (const r of rows) {
    const blob = Object.values(r).map((v) => v ?? '').join(' ');
    for (const m of blob.matchAll(SECTION_REF)) labels.add(m[1]!.toLowerCase());
    for (const t of terms(r['act_or_practice'] ?? '')) want.add(t);
  }
  if (labels.size === 0 || want.size === 0) continue;

  const instruments = db
    .prepare(`SELECT id, title FROM instrument WHERE economy_code = ?`)
    .all(economy) as { id: number; title: string }[];
  const matched = instruments.filter((i) => [...terms(i.title)].filter((t) => want.has(t)).length >= 2);
  if (matched.length === 0) continue;

  for (const inst of matched.slice(0, 2)) {
    const secs = db
      .prepare(
        `SELECT s.id, LOWER(s.label) AS label FROM section s JOIN document d ON d.id = s.document_id
          WHERE d.instrument_id = ?`,
      )
      .all(inst.id) as { id: number; label: string | null }[];
    const targets = new Set(
      secs.filter((s) => s.label && labels.has(s.label.trim().replace(/\(.*$/, ''))).map((s) => s.id),
    );
    if (targets.size === 0) continue;

    const read = db
      .prepare(
        `SELECT COUNT(*) AS n FROM reading r JOIN cell c ON c.id = r.cell_id
          WHERE c.run_id = ? AND c.economy_code = ? AND c.indicator_id = ? AND r.section_id IN (${[...targets].join(',')})`,
      )
      .get(RUN, economy, indicator) as { n: number };

    const ind = indicators.get(indicator);
    if (!ind) continue;
    const order = rankWithin(inst.id, queriesFor(ind, NAME[economy]));
    const best = order.findIndex((id) => targets.has(id));
    counted += 1;
    if (best >= 0 && best < 40) reachable += 1;
    console.log(
      `  ${economy} ${indicator.padEnd(7)} ${inst.title.slice(0, 26).padEnd(26)} ${String(targets.size).padStart(5)}  ${read.n ? 'read ' : ' no  '}  ${(best < 0 ? 'not ranked' : String(best + 1)).padStart(12)}  ${String(secs.length).padStart(6)}`,
    );
  }
}
console.log(`\n  ${reachable} of ${counted} land in the first 40 of their own Act.`);
db.close();
