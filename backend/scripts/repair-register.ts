/**
 * Bring an already-built register to the rule `registeredKind` now applies at discovery.
 *
 * A title that mentions an Act reads exactly like one that is an Act, so `kindOf` registered a
 * regulator's consultation papers, media releases and landing pages as primary legislation. The
 * shortlist holds half of every governing list for Acts, so those documents competed inside the
 * reserve built to protect statutes, won places in it, and spent the reading window: 465 of 7,470
 * seats in the Australia/Singapore run of 21 September 2026, and 63 of AUS 12.7's 204.
 *
 * Discovery now reads what the listing corroborates instead of what the title claims. This applies
 * the same test to what is already registered. Nothing is deleted and no text is touched: the
 * documents stay, with their sections, citable as evidence of how a regulator reads an obligation.
 * Only what the register calls them changes.
 *
 *   npm run -w backend repair-register -- [AUS] [--apply]
 *
 * Dry by default. Re-run with --apply to write.
 */
import { openDb } from '../src/db/index.js';
import { registeredKind, type InstrumentKind } from '../src/discover/titles.js';

const apply = process.argv.includes('--apply');
const economies = process.argv.slice(2).filter((a) => /^[A-Z]{3}$/.test(a));

const db = openDb();

interface Row {
  id: number;
  economy_code: string;
  title: string;
  kind: string;
  official_number: string | null;
  status: string | null;
  discovered_via: string | null;
  sections: number;
}

const rows = db
  .prepare(
    `SELECT i.id, i.economy_code, i.title, i.kind, i.official_number, i.status, i.discovered_via,
            COALESCE(n.c, 0) AS sections
       FROM instrument i
       LEFT JOIN (SELECT d.instrument_id iid, COUNT(s.id) c
                    FROM document d JOIN section s ON s.document_id = d.id
                   GROUP BY d.instrument_id) n ON n.iid = i.id
      WHERE i.kind <> 'publication'
        ${economies.length ? `AND i.economy_code IN (${economies.map(() => '?').join(',')})` : ''}
      ORDER BY i.economy_code, n.c DESC`,
  )
  .all(...economies) as Row[];

const demote = rows.filter(
  (r) =>
    registeredKind(r.kind as InstrumentKind, { officialNumber: r.official_number, status: r.status }) ===
    'publication',
);

const byEconomy = new Map<string, Row[]>();
for (const r of demote) byEconomy.set(r.economy_code, [...(byEconomy.get(r.economy_code) ?? []), r]);

console.log(`\n${rows.length} instrument(s) in the register${economies.length ? ` for ${economies.join(', ')}` : ''}`);
console.log(`${demote.length} are registered as Acts on a listing that states neither an identifier nor a standing\n`);

for (const [economy, list] of [...byEconomy].sort()) {
  const read = list.filter((r) => r.sections > 0);
  console.log(`${economy}: ${list.length} (${read.length} with text, ${list.length - read.length} never parsed)`);
  const byKind = new Map<string, number>();
  for (const r of list) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  console.log(`  registered as: ${[...byKind].map(([k, n]) => `${n} ${k}`).join(', ')}`);
  // Longest first, because a long document is the one worth a human's eye before it is demoted.
  for (const r of read.slice(0, 8)) {
    console.log(`  ${String(r.sections).padStart(4)}s  ${r.discovered_via ?? '-'}  ${r.title.slice(0, 84)}`);
  }
  if (read.length > 8) console.log(`  ... and ${read.length - 8} more with text`);
  console.log('');
}

// Nothing the test demotes should be a statute, or anything but one claiming to be. Cheap enough
// to run every time, and it is the check that caught the rule being applied wider than it was
// measured -- at which point it retired Australia's .au Domain Rules and Malaysia's PDPA codes.
const wrong = demote.filter(
  (r) => r.kind !== 'act' || (r.status && r.status !== 'unknown') || (r.official_number ?? '').trim() !== '',
);
if (wrong.length) {
  console.error(`REFUSING: ${wrong.length} row(s) would be demoted that the test does not cover, e.g.`);
  for (const r of wrong.slice(0, 5)) console.error(`  ${r.kind} ${r.official_number ?? '-'} ${r.status} ${r.title}`);
  process.exit(1);
}

if (!apply) {
  console.log('Nothing changed. Re-run with --apply.\n');
} else {
  const update = db.prepare(`UPDATE instrument SET kind = 'publication' WHERE id = ?`);
  const n = db.transaction(() => {
    let done = 0;
    for (const r of demote) {
      update.run(r.id);
      done += 1;
    }
    return done;
  })();
  console.log(`${n} instrument(s) re-registered as publications about the law.`);
  console.log('Their documents, sections and readings are untouched.\n');
}
