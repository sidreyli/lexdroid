/**
 * Does the parser still read the corpus the way it did?
 *
 *   npm run -w backend parse-check -- --economy AUS
 *
 * Run this *before* attaching a re-parse. It resolves every document the economy holds, parses it
 * with the parser as it stands now, and compares the sectioning against what the database banked
 * from the last good parse. A document that loses sections is the thing to look at; a document that
 * gains them is usually the point of the change.
 *
 * It exists because a re-parse is not reversible in practice -- by the time the citations are
 * reattached and the corpus re-embedded, the evidence of what the old parse said is gone -- and
 * because the obvious way to check costs a day of GPU and still misses things.
 *
 * Two details are the whole value, and both were learned by getting them wrong. `4cdd564` turned
 * every compiled Act into a single blob and the checks run against it reported no change at all.
 *
 *   - Resolve through the adapter, not through the document URL. A long Act is not at its own URL:
 *     the register serves a title page there and the read path calls `resolveDocument` to pull the
 *     EPUB volumes and join them. Fetching the URL gets the title page, which is an unreadable stub
 *     before and after any parser change, so every compiled Act reports "unchanged" while broken.
 *   - Check the offset invariant on every section. `text.slice(charStart, charEnd) === text` is what
 *     every quote in every export is anchored on, and a parse can satisfy the section count while
 *     breaking it.
 *
 * Sampling cannot replace this. A sample drawn by how a document looks -- blobs, generic parses,
 * good ones -- draws the broken ones from the population that is already broken, which is exactly
 * where a regression hides.
 */
import { openDb } from '../src/db/index.js';
import { Fetcher, CacheMiss } from '../src/fetch/index.js';
import { adapterFor } from '../src/discover/index.js';
import { loadProfile } from '../src/profile/index.js';
import { parseDocument } from '../src/parse/index.js';

const args = process.argv.slice(2);
const economy = (args[args.indexOf('--economy') + 1] ?? '').toUpperCase();
if (!economy || !args.includes('--economy')) {
  console.error('usage: parse-check -- --economy AUS [--fetch]');
  process.exit(2);
}

const db = openDb();
const profile = loadProfile(economy);
const fetcher = new Fetcher({ db, sourceMode: args.includes('--fetch') ? 'fetch' : 'cache-only' });

const rows = db
  .prepare(
    `SELECT d.id, d.url, i.title, i.discovered_via,
            (SELECT COUNT(*) FROM section s WHERE s.document_id = d.id) banked
       FROM document d JOIN instrument i ON i.id = d.instrument_id
      WHERE i.economy_code = ? ORDER BY d.id`,
  )
  .all(economy) as { id: number; url: string; title: string; discovered_via: string; banked: number }[];

console.log(`\nParse check -- ${rows.length} document(s) of ${economy}, against what the database holds\n`);

const lost: { title: string; banked: number; now: number; url: string }[] = [];
const broken: { title: string; url: string; failed: number }[] = [];
let same = 0;
let gained = 0;
let unreachable = 0;

for (const row of rows) {
  const adapter = adapterFor(db, profile, row.discovered_via);
  let fetched;
  try {
    // Through the adapter, or a multi-volume Act is only ever its title page.
    fetched = adapter?.resolveDocument
      ? await adapter.resolveDocument(row.url, fetcher)
      : await fetcher.fetch(row.url);
  } catch (err) {
    if (err instanceof CacheMiss) {
      unreachable++;
      continue;
    }
    throw err;
  }
  if (fetched.status !== 200) {
    unreachable++;
    continue;
  }

  const parsed = await parseDocument(fetched);
  const failed = parsed.sections.filter((s) => parsed.text.slice(s.charStart, s.charEnd) !== s.text).length;
  if (failed > 0) broken.push({ title: row.title, url: row.url, failed });

  const now = parsed.sections.length;
  if (now < row.banked) lost.push({ title: row.title, banked: row.banked, now, url: row.url });
  else if (now > row.banked) gained++;
  else same++;
}

console.log(`  ${String(same).padStart(6)}  document(s) sectioned exactly as banked`);
console.log(`  ${String(gained).padStart(6)}  with more sections than banked`);
console.log(`  ${String(lost.length).padStart(6)}  with fewer -- look at these`);
console.log(`  ${String(broken.length).padStart(6)}  breaking the offset invariant`);
if (unreachable > 0) console.log(`  ${String(unreachable).padStart(6)}  not reachable from the cache`);

if (lost.length > 0) {
  console.log('\n  fewer sections than banked:');
  for (const l of lost.sort((a, b) => b.banked - b.now - (a.banked - a.now)).slice(0, 40)) {
    console.log(`    ${String(l.banked).padStart(5)} -> ${String(l.now).padEnd(5)}  ${l.title.slice(0, 64)}`);
  }
}
if (broken.length > 0) {
  console.log('\n  offset invariant broken -- every quote in these is unanchored:');
  for (const b of broken.slice(0, 20)) console.log(`    ${b.failed} section(s)  ${b.title.slice(0, 64)}\n      ${b.url}`);
}
console.log();
process.exit(lost.length > 0 || broken.length > 0 ? 1 : 0);
