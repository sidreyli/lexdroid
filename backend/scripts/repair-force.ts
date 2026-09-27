/**
 * Bring the register to the rule that a document filed as guidance, which says in its own opening
 * that it is issued under a section of an Act or that licensees must comply with it, binds those it
 * is issued to -- the notice tier -- rather than being advisory.
 *
 *   npm run -w backend repair-force                read-only: what would change
 *   npm run -w backend repair-force -- --apply
 *
 * See `statesItsForce` for the test and its guards.
 */
import { openDb } from '../src/db/index.js';
import { statesItsForce } from '../src/parse/identity.js';

const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(`SELECT id, economy_code AS ec, title FROM instrument WHERE kind = 'guideline'`)
  .all() as { id: number; ec: string; title: string }[];
const head = db.prepare(
  `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id
    WHERE d.instrument_id = ? ORDER BY d.id, s.ordinal LIMIT 40`,
);

const proposed = rows.filter((r) => statesItsForce(head.all(r.id) as { text: string }[]));
console.log(`${rows.length} instrument(s) registered as guidance`);
console.log(`${proposed.length} whose own opening says they bind\n`);
for (const p of proposed) console.log(`  ${p.ec} #${p.id}  ${p.title.slice(0, 100)}`);

if (!apply) {
  console.log('\nread-only. pass --apply to write.');
  process.exit(0);
}
const update = db.prepare(`UPDATE instrument SET kind = 'notice' WHERE id = ? AND kind = 'guideline'`);
db.transaction(() => {
  for (const p of proposed) update.run(p.id);
})();
console.log(`\nwrote ${proposed.length} kind(s).`);
