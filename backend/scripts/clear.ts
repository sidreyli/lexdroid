/**
 * Clear the slate before the live hour, for the interface. Prints one line of JSON.
 *
 *   clear --economy LAO[,RUS] --dry-run   what would go: runs, cells, register, documents, cache
 *   clear --economy LAO[,RUS]             take those economies out of the store, empty the cache
 *
 * See src/run/clear.ts for why this is the economy and not only a folder.
 */
import { openDb } from '../src/db/index.js';
import { clearEconomies, clearPlan } from '../src/run/clear.js';

const i = process.argv.indexOf('--economy');
const economies = (i >= 0 ? (process.argv[i + 1] ?? '') : '')
  .split(',')
  .map((e) => e.trim().toUpperCase())
  .filter(Boolean);
if (economies.length === 0 || economies.some((e) => !/^[A-Z]{3}$/.test(e))) {
  console.log(JSON.stringify({ ok: false, error: 'Name the economies to clear, as in --economy LAO' }));
  process.exit(2);
}

const db = openDb();
const dryRun = process.argv.includes('--dry-run');
const result = dryRun ? clearPlan(db, economies) : clearEconomies(db, economies);
console.log(JSON.stringify({ ok: true, dryRun, ...result }));
