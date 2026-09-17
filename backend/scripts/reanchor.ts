/**
 * Hold one economy's citations across a re-parse, and put them back afterwards.
 *
 *   npm run -w backend reanchor -- --economy MYS --detach
 *   npm run -w backend zone1 -- --economy MYS --reparse --cache-only
 *   npm run -w backend reanchor -- --economy MYS --attach
 *
 * Why this exists at all is in src/run/reanchor.ts: a re-parse has to delete the sections it
 * rebuilds, and the two tables recording what a past run cited are the two that must not cascade.
 */
import { openDb } from '../src/db/index.js';
import { attachCitations, detachCitations, reanchorOffsets } from '../src/run/reanchor.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const db = openDb();
const economy = (arg('economy') ?? '').toUpperCase();
const detach = process.argv.includes('--detach');
const attach = process.argv.includes('--attach');
const offsets = process.argv.includes('--offsets');

if ([detach, attach, offsets].filter(Boolean).length !== 1 || ((detach || offsets) && !economy)) {
  console.log('usage: reanchor -- [--economy MYS] [--title "..."] (--detach | --attach | --offsets)');
  process.exit(1);
}

if (offsets) {
  console.log(`\nOffsets -- re-anchoring ${economy}'s export rows on the words they exported\n`);
  const r = reanchorOffsets(db, economy);
  console.log(`  ${String(r.fixed).padStart(6)}  row(s) located in the document as it now parses`);
  console.log(`  ${String(r.unresolved).padStart(6)}  row(s) whose quote is not there, left without offsets\n`);
  process.exit(0);
}

if (detach) {
  console.log(`\nDetach -- parking ${economy}'s citations before a re-parse\n`);
  const title = arg('title');
  const { parked, readingsReleased, held } = detachCitations(db, economy, title ? { titleLike: title } : {});
  console.log(`  ${String(parked.answer_basis).padStart(6)}  answer_basis row(s) parked`);
  console.log(`  ${String(parked.export_row).padStart(6)}  export_row row(s) parked`);
  console.log(`  ${String(readingsReleased).padStart(6)}  export row(s) released from the reading behind them`);
  console.log(`\n  ${held} citation(s) held. Re-parse now, then run this again with --attach.\n`);
  process.exit(0);
}

console.log('\nAttach -- putting citations back after a re-parse\n');
const r = attachCitations(db);
if (r.restored + r.retired === 0) {
  console.log('  nothing was held; --detach parks citations and this puts them back\n');
  process.exit(0);
}
console.log(`  ${String(r.restored).padStart(6)}  citation(s) restored${r.byPosition ? ` (${r.byPosition} by position)` : ''}`);
console.log(`  ${String(r.reoffset).padStart(6)}  export row(s) re-anchored to their quote`);
console.log(`  ${String(r.offsetLost).padStart(6)}  export row(s) whose quote the new parse does not contain`);
console.log(`  ${String(r.retired).padStart(6)}  citation(s) retired to the discard ledger`);
console.log(`\n  ${r.held} still held\n`);
