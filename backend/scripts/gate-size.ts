/**
 * How much reading a go/no-go on the under-claim group alone would cost.
 *
 * The full run re-reads everything. This counts only the provisions the governing seats newly add
 * inside the cells that are actually being tested, which is what a first gate has to pay for.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { searchLexical } from '../src/index/index.js';

const RUN = 'b78c76f0-cf8b-4fab-a569-c7b11ca6800a';
const CSV = process.argv[2]!;
const SEATS = Number(process.argv[3] ?? 24);
const db = new Database('backend/data/lexdroid.db', { readonly: true });

const want = new Set(
  readFileSync(CSV, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(','))
    .filter((f) => f[7] === 'under-claim').map((f) => `${f[0]}/${f[1]}`),
);

const cells = db
  .prepare(`SELECT id, economy_code e, indicator_id i, queries, governing FROM cell WHERE run_id = ?`)
  .all(RUN) as { id: number; e: string; i: string; queries: string | null; governing: string | null }[];

const ownCache = new Map<number, Set<number>>();
function own(id: number): Set<number> {
  let s = ownCache.get(id);
  if (s) return s;
  const rows = db.prepare(`SELECT s.id FROM section s JOIN document d ON d.id = s.document_id WHERE d.instrument_id = ?`).all(id) as { id: number }[];
  ownCache.set(id, (s = new Set(rows.map((r) => r.id))));
  return s;
}

const added = new Set<number>();
let n = 0;
for (const c of cells) {
  if (!want.has(`${c.e}/${c.i}`)) continue;
  const governing: number[] = JSON.parse(c.governing ?? '[]');
  const queries: string[] = JSON.parse(c.queries ?? '[]');
  if (!governing.length || !queries.length) continue;
  n += 1;
  const read = new Set(
    (db.prepare(`SELECT section_id s FROM reading WHERE cell_id = ?`).all(c.id) as { s: number }[]).map((r) => r.s),
  );
  const deep = queries.map((q) => searchLexical(db, q, { limit: 5_000, economy: c.e }));
  for (const inst of governing) {
    const mine = own(inst);
    const score = new Map<number, number>();
    for (const run of deep) {
      run.filter((h) => mine.has(h.sectionId)).slice(0, SEATS * 2)
        .forEach((h, i) => score.set(h.sectionId, (score.get(h.sectionId) ?? 0) + 1 / (60 + i + 1)));
    }
    for (const [id] of [...score].sort((a, b) => b[1] - a[1]).slice(0, SEATS)) if (!read.has(id)) added.add(id);
  }
}
const lex = added.size;
const withDense = Math.round(lex * 1.17);
console.log(`\n  ${n} cell(s) gated, ${SEATS} seats each`);
console.log(`  ${lex} new provision(s) lexically, about ${withDense} with the meaning channel`);
console.log(`  about ${((withDense * 11.95) / 3600).toFixed(1)} GPU-hours, $${((withDense * 11.95) / 3600 * 0.79).toFixed(2)} on one L40S`);
db.close();
