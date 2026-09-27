/**
 * Bring the register to the rule that a name is not a clause.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-clause-titles.ts          # what would change
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-clause-titles.ts --apply  # change it
 *
 * A PDF's guess at its own name is the line it repeats on its own pages, and a table repeated
 * down three pages repeats its lines too. "pursuant to the Universities and University Colleges
 * Act 1971;" mentions an Act, so it passed the bar `ownName` sets, and two instruments were
 * registered under a clause about somebody else's statute. The rule is fixed at the source --
 * `runningHeader` no longer offers a clause, and `ownName` no longer accepts one -- and this
 * brings what is already stored to it, as `repair-page-titles.ts` did for the publisher's name.
 *
 * What it is renamed to is the name its own wrapper page gives it, which is the name the source
 * filed it under and the one the clause displaced. Where no such page is held the entry keeps the
 * clause: the register then says the wrong thing visibly, which is better than saying a different
 * wrong thing plausibly, and the row is printed so it can be looked at.
 *
 * A renamed instrument's title vector is stale, so the run's `buildInstrumentIndex` has to be let
 * rebuild it -- the same note `repair-titles.ts` carries.
 */
import { openDb } from '../src/db/index.js';
import { readsAsAClause } from '../src/parse/identity.js';

const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code AS economy, i.title, i.source_url
       FROM instrument i
      WHERE i.economy_code IN ('AUS','MYS','SGP')
      ORDER BY i.economy_code, i.id`,
  )
  .all() as { id: number; economy: string; title: string; source_url: string }[];

/** The heading the instrument's own page carries, which is what the source called it. */
const headingOf = db.prepare(
  `SELECT s.heading_path AS heading
     FROM section s JOIN document d ON d.id = s.document_id
    WHERE d.instrument_id = ? AND d.url = ?
    ORDER BY s.id LIMIT 1`,
);
const update = db.prepare('UPDATE instrument SET title = ? WHERE id = ?');

let renamed = 0;
const kept: string[] = [];

const run = db.transaction(() => {
  for (const r of rows) {
    if (!readsAsAClause(r.title ?? '')) continue;
    const row = headingOf.get(r.id, r.source_url) as { heading: string | null } | undefined;
    const recovered = (row?.heading ?? '').split('>')[0]!.replace(/\s+/g, ' ').trim();
    if (!recovered || readsAsAClause(recovered) || recovered === r.title) {
      kept.push(`  ${r.economy} ${String(r.id).padEnd(7)} "${String(r.title).slice(0, 70)}"`);
      continue;
    }
    renamed++;
    console.log(`  ${r.economy} ${String(r.id).padEnd(7)}`);
    console.log(`      was  ${r.title.slice(0, 100)}`);
    console.log(`      now  ${recovered.slice(0, 100)}`);
    if (apply) update.run(recovered, r.id);
  }
});
run();

console.log(`\n${renamed} renamed`);
console.log(`${kept.length} left as they are (no page of their own to take a name from):`);
for (const k of kept) console.log(k);
console.log(apply ? '\nApplied.' : '\nNothing written. Re-run with --apply.');
