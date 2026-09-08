/**
 * Does discovery find the instruments the answer turns on?
 *
 *   npm run -w backend discovery -- --economy SGP --pillars 6,7
 *
 * The gate measures reading and scoring. It cannot measure discovery, because part of its corpus
 * was assembled by naming Acts from knowledge -- so a cell can score correctly over a document
 * that the system would never have found on its own. In the live hour there is no such knowledge:
 * the economy may be one nobody has looked at, and whatever the register surfaces is the whole of
 * what gets read.
 *
 * So this asks one question and reports it without adjustment: given only the register -- every
 * instrument's title, kind and number, and nothing of its contents -- how far down the list are
 * the instruments ESCAP actually cites?
 *
 * Two failures are separated on purpose, because they have different repairs:
 *
 *   NOT REGISTERED   the instrument is not in the register at all, so no ranking could ever find
 *                    it. That is a crawl problem.
 *   NOT RANKED       it is in the register and the shortlist put it below the cut. That is a
 *                    ranking problem, and the one this script was written to size.
 *
 * The baseline is opened only after every shortlist has been computed, exactly as in the gate. It
 * is a scorecard here, never an input: nothing about a cited instrument reaches the ranking.
 */
import { openDb } from '../src/db/index.js';
import { loadRubric, indicatorsOfPillar } from '../src/rubric/index.js';
import { queriesFor } from '../src/retrieve/index.js';
import { shortlistInstruments, type InstrumentCandidate } from '../src/shortlist/index.js';
import { openBaseline, BASELINE_DB_PATH, sameInstrument } from '../src/baseline/index.js';
import { OllamaUnavailable } from '../src/engines/ollama.js';
import { existsSync } from 'node:fs';

/** Where the list is cut. Reported at several depths because the right one is a design choice. */
const DEPTHS = [10, 25, 50, 100];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const economy = (arg('economy') ?? 'SGP').toUpperCase();
const pillars = (arg('pillars') ?? '6,7')
  .split(',')
  .map((p) => Number(p.trim()))
  .filter((p) => Number.isInteger(p) && p > 0);
const limit = Number(arg('limit') ?? Math.max(...DEPTHS));
/** Rank on titles alone, as discovery did before the contents index. The control measurement. */
const titlesOnly = process.argv.includes('--titles-only');

/**
 * ESCAP records several instruments in one cell, separated by semicolons and blank lines, and a
 * cell may have several rows. Each named instrument is one thing discovery had to find.
 */
function citedTitles(raw: string | null): string[] {
  return (raw ?? '')
    .split(/[;\n]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 3);
}

interface CellResult {
  indicatorId: string;
  queries: number;
  shortlist: InstrumentCandidate[];
  cited: { title: string; registeredAs: string | null; rank: number | null; why: string[] }[];
}

async function main(): Promise<void> {
  const db = openDb();
  const rubric = loadRubric();
  const indicators = pillars.flatMap((p) => indicatorsOfPillar(p, rubric));

  const registered = db
    .prepare('SELECT id, title FROM instrument WHERE economy_code = ?')
    .all(economy) as { id: number; title: string }[];

  const withContents = (
    db
      .prepare(
        `SELECT COUNT(*) c FROM instrument_contents ic JOIN instrument i ON i.id = ic.instrument_id
          WHERE i.economy_code = ?`,
      )
      .get(economy) as { c: number }
  ).c;

  console.log(
    `Discovery over the register alone: ${registered.length} instrument(s) known for ${economy}, ` +
      `${indicators.length} indicator(s), list cut at ${limit}.`,
  );
  console.log(
    titlesOnly
      ? '  ranking on titles only (the control)'
      : `  ranking on titles and on the contents of ${withContents} instrument(s)`,
  );

  // Every shortlist is computed before the baseline is opened.
  const results: CellResult[] = [];
  for (const indicator of indicators) {
    const queries = queriesFor(indicator);
    const shortlist = await shortlistInstruments(db, {
      economy,
      queries,
      limit,
      ...(titlesOnly ? { contents: false } : {}),
    });
    results.push({ indicatorId: indicator.id, queries: queries.length, shortlist, cited: [] });
    process.stdout.write(`  ${indicator.id}: ${shortlist.length} candidate(s)\n`);
  }

  if (!existsSync(BASELINE_DB_PATH)) {
    console.log('\nNo baseline; nothing to score against.');
    return;
  }

  const baseline = openBaseline();
  const like = economy === 'SGP' ? '%ingapore%' : economy === 'MYS' ? '%alaysia%' : '%ustralia%';
  const rows = baseline
    .prepare('SELECT indicator_id, act_or_practice FROM baseline_row WHERE economy LIKE ?')
    .all(like) as { indicator_id: string; act_or_practice: string | null }[];
  baseline.close();

  for (const result of results) {
    const cited = [
      ...new Set(
        rows
          .filter((r) => r.indicator_id === result.indicatorId)
          .flatMap((r) => citedTitles(r.act_or_practice)),
      ),
    ];
    for (const title of cited) {
      const inRegister = registered.find((i) => sameInstrument(i.title, title));
      const hit = result.shortlist.find((c) => sameInstrument(c.title, title));
      result.cited.push({
        title,
        registeredAs: inRegister?.title ?? null,
        rank: hit?.rank ?? null,
        why: hit?.matchedHeadings ?? [],
      });
    }
  }

  console.log('\n=== What the register was asked for, and where the cited instruments came back ===\n');
  for (const result of results) {
    console.log(`  ${result.indicatorId}  (${result.queries} queries)`);
    if (result.cited.length === 0) {
      console.log('    no baseline citation for this cell');
    }
    for (const c of result.cited) {
      const where =
        c.rank !== null
          ? `rank ${c.rank}`
          : c.registeredAs === null
            ? 'NOT REGISTERED'
            : 'NOT RANKED (in the register, below the cut)';
      console.log(`    ${where.padEnd(38)} ${c.title.slice(0, 70)}`);
      // Why it was surfaced, before anything was fetched -- the part a reviewer can check.
      if (c.why.length > 0) console.log(`${' '.repeat(43)}on: ${c.why[0]}`);
    }
    console.log(`    top of the list: ${result.shortlist.slice(0, 3).map((c) => c.title).join(' | ')}`);
  }

  const all = results.flatMap((r) => r.cited);
  const registeredCount = all.filter((c) => c.registeredAs !== null).length;
  console.log('\n=== Recall ===\n');
  console.log(`  ${all.length} instrument citation(s) across ${results.length} cell(s).`);
  console.log(
    `  ${registeredCount} of ${all.length} are in the register at all ` +
      `(${all.length - registeredCount} never discovered, so no ranking could reach them).`,
  );
  for (const d of DEPTHS) {
    if (d > limit) continue;
    const found = all.filter((c) => c.rank !== null && c.rank <= d).length;
    console.log(
      `  at depth ${String(d).padStart(3)}: ${found}/${all.length} found ` +
        `(${((100 * found) / Math.max(all.length, 1)).toFixed(0)}%)` +
        `, ${((100 * found) / Math.max(registeredCount, 1)).toFixed(0)}% of what is registered`,
    );
  }

  // A cell whose every cited instrument is missing is a cell that cannot be answered from the
  // corpus at all -- worth naming separately, because it is the shape of a live-hour failure.
  const blind = results.filter((r) => r.cited.length > 0 && r.cited.every((c) => c.rank === null));
  if (blind.length > 0) {
    console.log(
      `\n  ${blind.length} cell(s) surfaced none of their cited instruments: ` +
        blind.map((r) => r.indicatorId).join(', '),
    );
  }
}

main().catch((err: unknown) => {
  if (err instanceof OllamaUnavailable) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
});
