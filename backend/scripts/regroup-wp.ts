/**
 * One-off repair: re-file a WordPress media library that was registered one instrument per file.
 *
 * The adapter now registers one instrument per publishing page, with the page's other files read
 * as further documents of it. This brings an already-built corpus to that shape: an upload no
 * page publishes is retired, a second edition is folded into the instrument its page names, and
 * the instruments that remain take the name the regulator gave the page.
 *
 *   npx tsx --tsconfig backend/tsconfig.json backend/scripts/regroup-wp.ts MYS [--apply]
 */
import { openDb } from '../src/db/index.js';
import { Fetcher } from '../src/fetch/index.js';
import { register, materialise } from '../src/discover/index.js';
import { wpAdapter } from '../src/discover/wp.js';
import { loadProfile } from '../src/profile/index.js';
import { portalId } from '../src/profile/index.js';

const code = process.argv[2] ?? 'MYS';
const apply = process.argv.includes('--apply');

const db = openDb();
const profile = loadProfile(code);
const portal = profile.portals.find((p) => p.adapter === 'wp');
if (!portal) throw new Error(`${code} has no WordPress portal`);
const fetcher = new Fetcher({ db, sourceMode: 'fetch' });
const via = `portal:${portalId(db, code, portal.url)}`;

const listed = await wpAdapter.discover({ portal, fetcher, log: (l) => console.log(l), setAside: () => {} });
const primary = new Map(listed.map((f) => [f.url, f.title]));

interface Row { id: number; title: string; source_url: string }
const rows = db
  .prepare('SELECT id, title, source_url FROM instrument WHERE economy_code = ? AND discovered_via = ?')
  .all(code, via) as Row[];
const keep = rows.filter((r) => primary.has(r.source_url));
const drop = rows.filter((r) => !primary.has(r.source_url));

console.log(`\n${rows.length} instrument(s) registered from this portal`);
console.log(`  ${keep.length} the portal still publishes as instruments in their own right`);
console.log(`  ${drop.length} retired: an upload no page publishes, or an edition of one of the above`);
if (!apply) {
  console.log('\nNothing changed. Re-run with --apply.');
} else {

  // FTS5 is contentless and has no delete trigger, so its rows have to go before the sections do:
  // section ids are reused, and a stale index row would then hold another section's text.
  const removed = db.transaction(() => {
    const ids = drop.map((r) => r.id);
    let sections = 0;
    for (const id of ids) {
      const secs = db
        .prepare(`SELECT s.id FROM section s JOIN document d ON d.id = s.document_id WHERE d.instrument_id = ?`)
        .all(id) as { id: number }[];
      const del = db.prepare('DELETE FROM section_fts WHERE rowid = ?');
      for (const s of secs) del.run(s.id);
      sections += secs.length;
      // A past answer that cited it loses the citation but keeps its score: the citation was the
      // defect, and rewriting the answer to hide it would be worse than recording that it went.
      db.prepare('UPDATE cell_answer SET controlling_instrument_id = NULL WHERE controlling_instrument_id = ?').run(id);
      db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
        .run('discover', drop.find((r) => r.id === id)?.source_url ?? String(id), 'not-published-by-any-page',
             drop.find((r) => r.id === id)?.title ?? '', new Date().toISOString());
      db.prepare('DELETE FROM instrument WHERE id = ?').run(id);
    }
    // The page's name is the regulator's own, and better than the first line of the PDF, which is
    // how instruments came to be called "PRIVATE & CONFIDENTIAL".
    const rename = db.prepare('UPDATE instrument SET title = ?, title_provisional = 0 WHERE id = ?');
    for (const r of keep) rename.run(primary.get(r.source_url) ?? r.title, r.id);
    return sections;
  })();
  console.log(`\nretired ${drop.length} instrument(s) and ${removed} section(s)`);

  await register(db, profile, fetcher, (l) => console.log(l));

  const ids = (db
    .prepare('SELECT id FROM instrument WHERE economy_code = ? AND discovered_via = ?')
    .all(code, via) as { id: number }[]).map((r) => r.id);
  const results = await materialise(db, profile, fetcher, {
    instrumentIds: ids, refresh: true, log: (l) => console.log(l),
  });
  const by = (o: string) => results.filter((r) => r.outcome === o).length;
  console.log(`\n${by('parsed')} parsed, ${by('unread')} unread, ${by('error')} failed`);

}
