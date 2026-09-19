/**
 * Put the bytes of every assembled document back into the blob cache.
 *
 *   npm run -w backend recache-composed -- --dry-run
 *   npm run -w backend recache-composed
 *
 * Three adapters build a document out of several responses -- the volumes of an Act on the
 * Federal Register, the provisions of a Singapore Statutes page, the sections of an India Code
 * item. Each part was cached under its own hash; the assembly was not, and the assembly is what
 * the document row's `content_hash` is taken over. So for 1,231 of 4,050 documents that hash
 * addressed nothing, and 199 of them belong to an instrument some answer cites: the promise that
 * a quoted passage can be re-checked against the exact bytes it was read out of did not hold for
 * the third of the corpus that needed assembling.
 *
 * `cacheComposed` now stores the assembly at the moment it is made, so this is a backfill and not
 * a routine. It runs entirely from the cache -- the parts are already on disk -- and it writes
 * only blob files, never the database: a document whose bytes come back with a different hash is
 * reported rather than re-pointed, because that would be a change to what a past answer cited.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { adapterFor } from '../src/discover/index.js';
import { CacheMiss, CACHE_DIR, Fetcher } from '../src/fetch/index.js';
import { loadProfile } from '../src/profile/index.js';

const dryRun = process.argv.includes('--dry-run');
const db = openDb();

const blobPath = (hash: string): string => join(CACHE_DIR, 'blob', hash.slice(0, 2), hash);

const missing = db
  .prepare(
    `SELECT d.id, d.url, d.content_hash AS hash, i.economy_code AS economy, i.source_url AS instrumentUrl,
            i.title, i.discovered_via AS via,
            (SELECT COUNT(*) FROM answer_basis ab WHERE ab.instrument_id = i.id) AS cited
       FROM document d JOIN instrument i ON i.id = d.instrument_id
      ORDER BY cited DESC, d.id`,
  )
  .all() as {
  id: number;
  url: string;
  hash: string;
  economy: string;
  instrumentUrl: string;
  title: string;
  via: string;
  cited: number;
}[];

const absent = missing.filter((d) => !existsSync(blobPath(d.hash)));
console.log(`${absent.length} of ${missing.length} document(s) have a hash that addresses no blob`);
console.log(`${absent.filter((d) => d.cited > 0).length} of those belong to an instrument an answer cites`);
if (dryRun) {
  for (const d of absent.slice(0, 10)) {
    console.log(`  ${d.economy} document ${d.id} ${d.cited > 0 ? '[cited]' : '       '} ${d.url.slice(0, 84)}`);
  }
  db.close();
  process.exit(0);
}

const fetcher = new Fetcher({ db, sourceMode: 'cache-only', onLog: () => {} });

// The adapter that composed a document is the one behind the portal the instrument came off,
// which is exactly what the read path resolves -- so this asks the same question the same way
// rather than guessing from the url.
const profiles = new Map<string, ReturnType<typeof loadProfile>>();
const adapterOf = (economy: string, via: string) => {
  let profile = profiles.get(economy);
  if (!profile) {
    profile = loadProfile(economy);
    profiles.set(economy, profile);
  }
  return adapterFor(db, profile, via);
};

let restored = 0;
let diverged = 0;
let noParts = 0;
let noAdapter = 0;

for (const d of absent) {
  const adapter = adapterOf(d.economy, d.via);
  if (!adapter?.resolveDocument) {
    noAdapter += 1;
    continue;
  }
  try {
    // resolveDocument calls cacheComposed, so simply resolving it again stores the assembly.
    const res = await adapter.resolveDocument(d.instrumentUrl, fetcher);
    if (res.contentHash === d.hash) {
      restored += 1;
    } else if (existsSync(blobPath(d.hash))) {
      restored += 1;
    } else {
      diverged += 1;
      if (diverged <= 5) {
        console.log(`  document ${d.id} re-composes to ${res.contentHash.slice(0, 12)}, not ${d.hash.slice(0, 12)}`);
        console.log(`    ${d.title.slice(0, 84)}`);
      }
    }
  } catch (err) {
    if (err instanceof CacheMiss) noParts += 1;
    else throw err;
  }
  const done = restored + diverged + noParts;
  if (done % 200 === 0) console.log(`  ${done} of ${absent.length}...`);
}

console.log(`\n${restored} document(s) now address their own bytes`);
console.log(`${diverged} re-compose to different bytes, so the old hash stays unaddressable`);
console.log(`${noParts} could not be rebuilt: a part is no longer in the cache`);
console.log(`${noAdapter} came from an adapter that does not compose, so the gap is something else`);
db.close();
