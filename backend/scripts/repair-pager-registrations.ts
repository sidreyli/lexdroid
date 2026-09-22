/**
 * Take a listing's pagination URL out of the register.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-pager-registrations.ts          # what would go
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-pager-registrations.ts --apply  # take it out
 *
 * A paginated index links its own pages, and on some templates an item's link is the pager rather
 * than a page of its own. The crawl then registers an instrument whose URL is page 4 of a listing:
 * fetched, it is recognised as a landing page and recorded unread, so it holds no text and can be
 * neither read nor cited -- but it still carries a name in the title index the shortlist ranks.
 *
 * A pagination URL is not an instrument. Deleted rather than left inert, and only where the row
 * holds no section, bore no reading and was cited by no answer, so nothing a past run stands on
 * can be removed by this. The instruments those listings name are registered from their own pages
 * by the same walk.
 */
import { openDb } from '../src/db/index.js';

const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code AS economy, i.title, i.source_url
       FROM instrument i
      WHERE (i.source_url LIKE '%?page=%' OR i.source_url LIKE '%&page=%')
        AND NOT EXISTS (SELECT 1 FROM section s JOIN document d ON d.id = s.document_id
                         WHERE d.instrument_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM answer_basis ab WHERE ab.instrument_id = i.id)
        AND NOT EXISTS (SELECT 1 FROM reading r JOIN section s ON s.id = r.section_id
                         JOIN document d ON d.id = s.document_id WHERE d.instrument_id = i.id)
      ORDER BY i.economy_code, i.id`,
  )
  .all() as { id: number; economy: string; title: string; source_url: string }[];

for (const r of rows) console.log(`  ${r.economy} ${String(r.id).padEnd(7)} ${r.source_url.slice(0, 95)}`);

if (apply && rows.length) {
  const ids = rows.map((r) => r.id);
  db.transaction(() => {
    const marks = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM document WHERE instrument_id IN (${marks})`).run(...ids);
    db.prepare(`DELETE FROM instrument WHERE id IN (${marks})`).run(...ids);
  })();
}

console.log(`\n${rows.length} registration(s) of a listing's pagination URL`);
console.log(apply ? 'Removed.' : 'Nothing written. Re-run with --apply.');
