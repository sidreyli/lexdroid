/**
 * Bring the register to the rule that a document names itself.
 *
 *   npm run -w backend repair-titles -- --dry
 *   npm run -w backend repair-titles
 *
 * Discovery already replaces a filed title that names no instrument with the name the document
 * gives itself in its opening provisions. It fired on almost nothing: the patterns it asked with
 * covered "may be cited as the ..." and "This Act is the ...", and a delegated instrument writes
 * "This is the ...", "This instrument is the ...", "These are the ..." or names a kind -- a
 * determination, a standard -- that the patterns did not list. Measured over the three registers,
 * nought of 663 eligible instruments recovered a name.
 *
 * A title is not cosmetic here. It is embedded, and the instrument shortlist ranks the register by
 * it before any document is read, so an Act filed as "Schedule 1", "[Document title]" or
 * "250312-LI-TSY_47_0757-Mergers-general th" cannot be found by the subject it governs and cannot
 * be cited by a name a reviewer could check.
 *
 * This writes titles only. It refuses to write at all if any proposed name fails the same test the
 * old title failed, which is the check that catches the rule being drafted wider than it was
 * measured.
 */
import { openDb } from '../src/db/index.js';
import { namesAnInstrument, statedNames } from '../src/parse/identity.js';

const dry = process.argv.includes('--dry');
const db = openDb();

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code ec, i.title, i.title_provisional prov
       FROM instrument i
      WHERE EXISTS (SELECT 1 FROM document d WHERE d.instrument_id = i.id)
      ORDER BY i.economy_code, i.id`,
  )
  .all() as { id: number; ec: string; title: string; prov: number }[];

const head = db.prepare(
  `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id
    WHERE d.instrument_id = ? ORDER BY s.ordinal LIMIT 3`,
);

const proposed: { id: number; ec: string; from: string; to: string }[] = [];
for (const r of rows) {
  if (!(r.prov === 1 || !namesAnInstrument(r.title))) continue;
  const names = statedNames((head.all(r.id) as { text: string }[]).map((s) => ({ text: s.text })));
  const name = (names.find((n) => n.language === 'en') ?? names[0])?.name;
  if (!name || name.length < 10) continue;
  if (name.trim().toLowerCase() === r.title.trim().toLowerCase()) continue;
  proposed.push({ id: r.id, ec: r.ec, from: r.title, to: name });
}

// The claim being acted on is that the document's own name says what the filed title did not. A
// proposal that names no instrument either is outside that claim, and one of them is reason enough
// to write nothing: a repair that has to be partly trusted is not a repair.
const unsound = proposed.filter((p) => !namesAnInstrument(p.to));
if (unsound.length) {
  console.log(`refusing to write: ${unsound.length} proposed name(s) name no instrument`);
  for (const u of unsound.slice(0, 10)) console.log(`  ${u.id}  "${u.from}" -> "${u.to}"`);
  process.exit(1);
}

for (const p of proposed) console.log(`${p.ec} ${String(p.id).padStart(6)}  "${p.from.slice(0, 44)}"\n        -> "${p.to.slice(0, 96)}"`);
console.log(`\n${proposed.length} instrument(s) would be renamed`);

if (dry) process.exit(0);

const update = db.prepare('UPDATE instrument SET title = ?, title_provisional = 0 WHERE id = ?');
// The title is what the shortlist embeds, so a renamed instrument has to be embedded again. The
// index builder only visits instruments that have no vector, so the stale one is dropped here.
const dropVector = db.prepare('DELETE FROM instrument_embedding WHERE instrument_id = ?');
const write = db.transaction(() => {
  for (const p of proposed) {
    update.run(p.to, p.id);
    dropVector.run(p.id);
  }
});
write();
console.log(`written. Re-embed the titles before the next run.`);
