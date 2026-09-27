/**
 * Build the contents index: what each instrument's own table of contents says it covers.
 *
 *   npm run -w backend contents -- --economy SGP
 *   npm run -w backend contents -- --economy SGP --budget-min 20
 *   npm run -w backend contents -- --economy SGP --kinds act,regulation
 *   npm run -w backend contents -- --economy AUS --order register
 *
 * Discovery ranked titles, and titles do not say what an Act contains -- see src/contents for the
 * measurement that established it. This crawls each instrument's landing page, which is its table
 * of contents, and embeds the headings.
 *
 * Budgeted on purpose. Singapore Statutes Online asks six seconds between requests, so its 524
 * Acts are about an hour of polite crawling; the live test is an hour in total. Whatever the budget
 * allows is indexed, the shortfall is printed, and instruments without contents fall back to their
 * titles -- a partial index is strictly better than none.
 */
import { openDb } from '../src/db/index.js';
import { Fetcher } from '../src/fetch/index.js';
import { buildContents, embedContents } from '../src/contents/index.js';
import { OllamaUnavailable } from '../src/engines/ollama.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const economy = (arg('economy') ?? 'SGP').toUpperCase();
const kinds = (arg('kinds') ?? 'act,regulation,order,rule,notice,guideline')
  .split(',').map((k) => k.trim()).filter(Boolean);
const order = arg('order') === 'register' ? 'register' : 'rubric';
const budgetMin = arg('budget-min') !== null ? Number(arg('budget-min')) : null;
const embedOnly = process.argv.includes('--embed-only');
const sourceMode = process.argv.includes('--cache-only') ? 'cache-only' : 'fetch';

async function main(): Promise<void> {
  const db = openDb();
  const log = (l: string): void => console.log(l);

  if (!embedOnly) {
    console.log(`\nContents -- ${economy}, kinds ${kinds.join(', ')}${budgetMin ? `, budget ${budgetMin} min` : ''}`);
    const fetcher = new Fetcher({ db, sourceMode, onLog: log });
    const progress = await buildContents(db, fetcher, {
      economy,
      kinds,
      order,
      ...(budgetMin ? { budgetMs: budgetMin * 60_000 } : {}),
      log,
    });
    console.log(
      `  ${progress.fetched} fetched, ${progress.fromParsed} taken from documents already parsed, ` +
        `${progress.failed} unreadable, ${progress.skipped} left undone`,
    );
  }

  console.log('\nEmbedding');
  const embedded = await embedContents(db, { economy, log });
  console.log(`  ${embedded.embedded} heading(s) across ${embedded.instruments} instrument(s)`);

  const covered = db
    .prepare(
      `SELECT i.kind, COUNT(*) total,
              SUM(CASE WHEN EXISTS (SELECT 1 FROM instrument_contents c WHERE c.instrument_id = i.id) THEN 1 ELSE 0 END) withContents
         FROM instrument i WHERE i.economy_code = ? GROUP BY i.kind`,
    )
    .all(economy) as { kind: string; total: number; withContents: number }[];
  console.log('\nCoverage');
  for (const c of covered) console.log(`  ${c.kind}: ${c.withContents}/${c.total} have contents`);
}

main().catch((err: unknown) => {
  if (err instanceof OllamaUnavailable) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
});
