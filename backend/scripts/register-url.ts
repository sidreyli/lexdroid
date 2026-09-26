/**
 * Register documents a portal walk cannot reach, and read them.
 *
 * Every other route into the register starts from a listing: an adapter walks a portal's index
 * and registers what the index names. That covers the gazette, which publishes an index of
 * everything it gazettes, and it does not cover a regulator that files its governing document
 * outside the listing its adapter walks. Malaysia's licensing guidebook sits under /sectors, not
 * under /resources/guidelines; the Treasury's Instructions are behind a flipbook whose page links
 * to a directory; the prepaid registration guideline's own listing entry is the pagination URL of
 * the listing it appears on. In each case the crawl registered something -- a landing page, a
 * pager, a shell -- and the instrument itself stayed out of the corpus, so the cells that turn on
 * it read an absence of text as an absence of law.
 *
 * This takes the URL of the document instead, which is the one thing a human reading the
 * regulator's site always has. `also_at` is left null deliberately: the URL given here *is* the
 * document, not a page that points at one.
 *
 *   npm run -w backend register-url -- --economy MYS --portal 22 --kind guideline \
 *     --title "MCMC Licensing Guidebook" --url https://... [--number MCMC/G/07/06] [--apply]
 *
 * Several --title/--url/--kind triples may be given; they pair off in the order written. Dry by
 * default, and --read fetches and parses what it registered.
 */
import { openDb } from '../src/db/index.js';
import { Fetcher } from '../src/fetch/index.js';
import { loadProfile, applyProfile } from '../src/profile/index.js';
import { materialise } from '../src/discover/index.js';
import type { InstrumentKind } from '../src/discover/titles.js';

/**
 * The register's kinds, listed here because the type is erased before the string arrives.
 *
 * A cast to `InstrumentKind` satisfies the compiler and nothing else: "--kind licence" put
 * four rows into the register under a kind no rule in the system knows, where `registeredKind`
 * would not test them and no filter would find them.
 */
const KINDS: readonly InstrumentKind[] = ['act', 'regulation', 'notice', 'guideline', 'order', 'rule', 'publication'];

const argv = process.argv.slice(2);
const all = (name: string): string[] =>
  argv.flatMap((a, i) => (a === `--${name}` ? [argv[i + 1] ?? ''] : []));
const one = (name: string): string | null => all(name)[0] ?? null;
const has = (name: string): boolean => argv.includes(`--${name}`);

const economy = (one('economy') ?? '').toUpperCase();
const titles = all('title');
const urls = all('url');
const kinds = all('kind');
const numbers = all('number');
const portal = one('portal');
const apply = has('apply');

if (!/^[A-Z]{3}$/.test(economy) || titles.length === 0 || urls.length !== titles.length) {
  console.error('usage: --economy XXX --portal <id> --kind <kind> --title <t> --url <u> [--number <n>] [--apply] [--read]');
  process.exit(2);
}

const db = openDb();

// A portal the economy does not have would register the document under another economy's crawl,
// and `adapterFor` would then hand it that adapter's resolveDocument.
// With no portal the document came from its own URL, and says so: the column is NOT NULL, and a
// value that names no portal gets no adapter, which is right for a document nothing listed.
const via = portal ? `portal:${Number(portal)}` : 'url';
if (portal) {
  const owns = db
    .prepare('SELECT economy_code FROM portal WHERE id = ?')
    .get(Number(portal)) as { economy_code: string } | undefined;
  if (owns?.economy_code !== economy) {
    console.error(`portal ${portal} belongs to ${owns?.economy_code ?? 'no economy'}, not ${economy}`);
    process.exit(2);
  }
}

function kindOf(word: string): InstrumentKind {
  const found = KINDS.find((k) => k === word);
  if (!found) {
    console.error(`"${word}" is not one of the register's kinds: ${KINDS.join(', ')}`);
    process.exit(2);
  }
  return found;
}

const now = new Date().toISOString();
const insert = db.prepare(
  `INSERT INTO instrument (economy_code, title, official_number, kind, status, status_basis,
                           source_url, discovered_via, discovered_at, title_provisional)
   VALUES (?, ?, ?, ?, 'unknown', NULL, ?, ?, ?, 0)
   ON CONFLICT(economy_code, source_url) DO NOTHING`,
);

const wanted: { title: string; url: string; kind: InstrumentKind }[] = titles.map((title, i) => ({
  title,
  url: urls[i]!,
  // One --kind for all of them is the common case; one each is the general one.
  kind: kindOf(kinds.length === titles.length ? kinds[i]! : kinds[0] ?? 'guideline'),
}));

console.log(`\n${wanted.length} document(s) for ${economy}${via ? ` via ${via}` : ''}${apply ? '' : '  (dry run)'}\n`);

const ids: number[] = [];
for (const [i, w] of wanted.entries()) {
  const existing = db
    .prepare('SELECT id, title FROM instrument WHERE economy_code = ? AND source_url = ?')
    .get(economy, w.url) as { id: number; title: string } | undefined;
  if (existing) {
    console.log(`  [${w.kind}] already registered as #${existing.id}: ${existing.title}`);
    ids.push(existing.id);
    continue;
  }
  console.log(`  [${w.kind}] ${w.title}\n        ${w.url}`);
  if (apply) {
    insert.run(economy, w.title, numbers[i] ?? null, w.kind, w.url, via, now);
    const row = db
      .prepare('SELECT id FROM instrument WHERE economy_code = ? AND source_url = ?')
      .get(economy, w.url) as { id: number };
    ids.push(row.id);
    console.log(`        registered as #${row.id}`);
  }
}

if (has('read') && apply && ids.length) {
  const profile = loadProfile(economy);
  applyProfile(db, profile);
  const fetcher = new Fetcher({ db, sourceMode: 'fetch', onLog: (l) => console.log(l) });
  console.log(`\nReading ${ids.length} instrument(s)\n`);
  const results = await materialise(db, profile, fetcher, {
    instrumentIds: ids,
    log: (l) => console.log(l),
  });
  for (const r of results) console.log(`  ${r.outcome.padEnd(8)} ${r.detail ?? ''}  ${r.title}`);
}
