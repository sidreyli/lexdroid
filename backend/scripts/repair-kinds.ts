/**
 * Bring the register to the rule that a document whose source said nothing about what it is takes
 * the kind its own opening provision states.
 *
 * The register's kind decides what an instrument may be cited for. A regulator's media library
 * states nothing about anything it serves, so the Act of Parliament Malaysia's data-protection
 * regulator publishes as a file was filed as advisory guidance -- and `decide` rules an advisory
 * instrument out of every cell, on the ground that it says how a binding instrument is read rather
 * than imposing a duty. That is the right rule applied to the wrong fact.
 *
 * Read-only unless --apply is passed. See `statedKind` for the test and its guards.
 */
import { openDb } from '../src/db/index.js';
import { statedKind } from '../src/parse/identity.js';

const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code AS ec, i.title, i.kind
       FROM instrument i
      WHERE (i.official_number IS NULL OR TRIM(i.official_number) = '')
        AND i.status = 'unknown'`,
  )
  .all() as { id: number; ec: string; title: string; kind: string | null }[];

const head = db.prepare(
  `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id
    WHERE d.instrument_id = ? ORDER BY s.ordinal LIMIT 6`,
);

const proposed: { id: number; ec: string; title: string; from: string; to: string }[] = [];
for (const r of rows) {
  const sections = (head.all(r.id) as { text: string }[]).map((s) => ({ text: s.text }));
  if (!sections.length) continue;
  const says = statedKind(sections, r.title);
  if (!says || says === r.kind) continue;
  proposed.push({ id: r.id, ec: r.ec, title: r.title, from: r.kind ?? 'nothing', to: says });
}

console.log(`${rows.length} instrument(s) whose source stated neither an identifier nor a standing`);
console.log(`${proposed.length} whose own opening provision names a different kind\n`);
for (const p of proposed) {
  console.log(`  ${p.ec} #${p.id}  ${p.from} -> ${p.to}`);
  console.log(`      ${p.title.slice(0, 96)}`);
}

// A kind is what a row may be cited as, so a proposal that would register something as primary
// legislation without the document having opened as one is outside the claim being acted on. One
// of those is reason enough to write nothing: a repair that has to be partly trusted is not one.
const unsound = proposed.filter((p) => !['act', 'regulation', 'rule', 'order'].includes(p.to));
if (unsound.length) {
  console.error(`\nrefusing: ${unsound.length} proposal(s) name a kind this repair does not grant`);
  process.exit(1);
}

if (!apply) {
  console.log('\nread-only. pass --apply to write.');
  process.exit(0);
}

const update = db.prepare('UPDATE instrument SET kind = ? WHERE id = ?');
const write = db.transaction(() => {
  for (const p of proposed) update.run(p.to, p.id);
});
write();
console.log(`\nwrote ${proposed.length} kind(s).`);
