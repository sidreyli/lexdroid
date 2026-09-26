/**
 * Embed the title of every registered instrument, for the economies named, and nothing else.
 *
 *   OLLAMA_HOST=http://127.0.0.1:11501 npm run -w backend embed-titles -- --economies MNG,RUS,LAO
 *
 * The title index is what ranks the register for the framework indicators (7.1, 7.2, 8.1, 8.2)
 * and for the shortlist; zone1 --embed builds the section index and leaves this one to zone1's
 * shortlist step, which also walks the portals. On a rented GPU the two are wanted without the walk,
 * before the fleet starts with --skip-prepare. Resumable: a title already embedded is skipped.
 */
import { openDb } from '../src/db/index.js';
import { loadEnv } from '../src/env.js';
import { buildInstrumentIndex } from '../src/shortlist/index.js';

loadEnv();
const i = process.argv.indexOf('--economies');
const economies = (i >= 0 ? process.argv[i + 1] ?? '' : '').split(',').map((e) => e.trim().toUpperCase()).filter(Boolean);
if (economies.length === 0) throw new Error('--economies MNG,RUS,LAO is required');

const db = openDb();
for (const economy of economies) {
  const built = await buildInstrumentIndex(db, { economy, log: (l) => console.log(`  ${economy} ${l.trim()}`) });
  console.log(`${economy}: ${built.embedded} title(s) embedded, ${built.alreadyPresent} already present (${built.model})`);
}
