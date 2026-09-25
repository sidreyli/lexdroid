/**
 * Link every amending instrument to the Act it says it amends.
 *
 * `amends_instrument_id` has been in the schema from the beginning and written by nothing. It is
 * needed now because a finding may rest on words an amendment sets out for insertion, and those
 * words are the principal Act's -- a citation that named the vehicle would be the citation defect
 * ESCAP marks directly.
 *
 * Resolution is by the principal's own gazette identifier, read out of the amending clause, so it
 * is an equality test rather than a fuzzy title match. Read-only unless --apply is passed.
 */
import { openDb } from '../src/db/index.js';
import { amendsWhat } from '../src/parse/identity.js';

const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code AS ec, i.title, i.amends_instrument_id AS linked
       FROM instrument i
      WHERE EXISTS (SELECT 1 FROM document d WHERE d.instrument_id = i.id)`,
  )
  .all() as { id: number; ec: string; title: string; linked: number | null }[];

const head = db.prepare(
  `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id
    WHERE d.instrument_id = ? ORDER BY s.ordinal LIMIT 4`,
);
const byNumber = db.prepare(
  `SELECT id, title FROM instrument
    WHERE economy_code = ? AND REPLACE(UPPER(official_number), ' ', '') = ? LIMIT 1`,
);

const links: { id: number; ec: string; from: string; to: number; toTitle: string; num: string }[] = [];
let named = 0;
const unresolved: string[] = [];
for (const r of rows) {
  const sections = (head.all(r.id) as { text: string }[]).map((s) => ({ text: s.text }));
  const says = amendsWhat(sections);
  if (!says) continue;
  named += 1;
  const hit = byNumber.get(r.ec, says.officialNumber.replace(/\s+/g, '').toUpperCase()) as
    | { id: number; title: string }
    | undefined;
  if (!hit) {
    if (unresolved.length < 10) unresolved.push(`  ${r.ec} #${r.id} names ${says.officialNumber} (${says.name.slice(0, 50)}) -- not in the register`);
    continue;
  }
  // An instrument cannot amend itself: a consolidation reprints its own amending history.
  if (hit.id === r.id) continue;
  links.push({ id: r.id, ec: r.ec, from: r.title, to: hit.id, toTitle: hit.title, num: says.officialNumber });
}

console.log(`${rows.length} instrument(s) with text`);
console.log(`  name an Act they amend, with its identifier : ${named}`);
console.log(`  identifier resolves to a row we hold        : ${links.length}`);
if (unresolved.length) {
  console.log('\n  named but not held:');
  unresolved.forEach((u) => console.log(u));
}
console.log('\n  first 12 links:');
for (const l of links.slice(0, 12)) {
  console.log(`  ${l.ec} #${l.id} ${l.from.slice(0, 42)}`);
  console.log(`        amends #${l.to} ${l.toTitle.slice(0, 46)} [${l.num}]`);
}

if (!apply) {
  console.log('\nread-only. pass --apply to write.');
  process.exit(0);
}
const update = db.prepare('UPDATE instrument SET amends_instrument_id = ? WHERE id = ?');
db.transaction(() => {
  for (const l of links) update.run(l.to, l.id);
})();
console.log(`\nwrote ${links.length} link(s).`);
