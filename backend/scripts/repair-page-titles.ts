/**
 * Bring the register to the rule that a page's title is not the instrument's name.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-page-titles.ts          # what would change
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-page-titles.ts --apply  # change it
 *
 * `ownName` falls back to the page's own <title> where a document states no name in its opening
 * provisions, and a web page is titled for the site it sits on. So 197 entries went into the
 * register named after a website -- "Cybersecurity Act | Cyber Security Agency of Singapore",
 * "Strategic Goods (Control) Act | Singapore Customs" at 1,822 sections, "Guidelines on Use of
 * Telecommunication Riser Ducts | IMDA" -- and a row citing one shows a reviewer the agency where
 * the provision should be. The rule is fixed at the source; this brings what is already stored to
 * it, as `repair-titles.ts` and `repair-register.ts` did for theirs.
 *
 * Where the part before the publisher's name names an instrument, that is the name. Where none of
 * it does, nothing is recovered: the entry names no instrument either way, which is a fact about
 * it that `registeredKind` already reads, and inventing a name would be worse than keeping a
 * visibly wrong one.
 *
 * A renamed instrument's title vector is stale, so the run's `buildInstrumentIndex` has to be let
 * rebuild it -- the same note `repair-titles.ts` carries.
 */
import { openDb } from '../src/db/index.js';
import { nameBeforeThePublisher } from '../src/parse/identity.js';

const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code AS economy, i.title, i.source_url,
            (SELECT COUNT(*) FROM section s JOIN document d ON d.id = s.document_id
              WHERE d.instrument_id = i.id) AS sections
       FROM instrument i
      WHERE i.title LIKE '%|%'
      ORDER BY i.economy_code, i.id`,
  )
  .all() as { id: number; economy: string; title: string; source_url: string; sections: number }[];

const update = db.prepare('UPDATE instrument SET title = ? WHERE id = ?');

let renamed = 0;
let leftAlone = 0;
let sectionsRenamed = 0;
const perEconomy = new Map<string, number>();

const run = db.transaction(() => {
  for (const r of rows) {
    const recovered = nameBeforeThePublisher(r.title);
    if (!recovered || recovered === r.title) {
      leftAlone++;
      continue;
    }
    renamed++;
    sectionsRenamed += r.sections;
    perEconomy.set(r.economy, (perEconomy.get(r.economy) ?? 0) + 1);
    if (renamed <= 25) {
      console.log(`  ${r.economy} ${String(r.id).padEnd(7)} ${String(r.sections).padStart(5)} sections`);
      console.log(`      was  ${r.title.slice(0, 110)}`);
      console.log(`      now  ${recovered.slice(0, 110)}`);
    }
    if (apply) update.run(recovered, r.id);
  }
});
run();

console.log(`\n${rows.length} title(s) carry a publisher's name after a pipe`);
console.log(`  renamed       ${renamed}  (${sectionsRenamed} sections behind them)`);
for (const [economy, n] of [...perEconomy].sort()) console.log(`      ${economy}  ${n}`);
console.log(`  left alone    ${leftAlone}  (nothing before the pipe names an instrument)`);
console.log(apply ? '\nApplied.' : '\nNothing written. Re-run with --apply.');
