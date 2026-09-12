/**
 * Does the shortlist reach the instruments ESCAP cited?
 *
 * Retrieval is the one stage whose failures are invisible downstream: a cell reads whatever was
 * fetched and answers honestly over it, so an instrument the shortlist never named is indistinct
 * from one that says nothing. ESCAP's Round 1 answers name the instrument per indicator, which
 * makes recall measurable rather than argued about.
 *
 *   npm run -w backend shortlist-recall -- --economy SGP --depth 40
 *
 * Baseline use is evaluation, which is one of the two permitted ones. Nothing here writes.
 */
import { openDb } from '../src/db/index.js';
import { openBaseline, sameInstrument } from '../src/baseline/index.js';
import { shortlistInstruments } from '../src/shortlist/index.js';
import { loadRubric } from '../src/rubric/index.js';
import { queriesFor } from '../src/retrieve/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const ECONOMY_NAME: Record<string, string> = {
  SGP: 'Singapore',
  MYS: 'Malaysia',
  AUS: 'Australia',
};

const economies = (arg('economy') ?? 'SGP,MYS,AUS').toUpperCase().split(',');
const depth = Number(arg('depth') ?? 40);
const contents = arg('contents') !== 'off';
const only = arg('indicators')?.split(',') ?? null;
// The corpus under test lives in the main worktree; an experiment branch measures against it
// rather than against a copy that has drifted.
const dbPath = arg('db');
const baselinePath = arg('baseline');
const primaryShare = arg('primary') !== null ? Number(arg('primary')) : undefined;

/** One cited instrument, and where the shortlist put it. */
interface Probe {
  indicatorId: string;
  cited: string;
  instrumentId: number | null;
  rank: number | null;
  fetched: boolean;
}

async function measure(economy: string): Promise<Probe[]> {
  const db = dbPath ? openDb(dbPath) : openDb();
  const baseline = baselinePath ? openBaseline(baselinePath) : openBaseline();
  const rubric = loadRubric();

  const registry = db
    .prepare('SELECT id, title FROM instrument WHERE economy_code = ?')
    .all(economy) as { id: number; title: string }[];
  const fetched = new Set(
    (
      db
        .prepare(
          `SELECT DISTINCT i.id FROM instrument i JOIN document d ON d.instrument_id = i.id
            WHERE i.economy_code = ?`,
        )
        .all(economy) as { id: number }[]
    ).map((r) => r.id),
  );

  const rows = baseline
    .prepare(
      `SELECT indicator_id, act_or_practice FROM baseline_row
        WHERE economy = ? AND source = 'round-1' AND act_or_practice IS NOT NULL`,
    )
    .all(ECONOMY_NAME[economy] ?? economy) as { indicator_id: string; act_or_practice: string }[];

  // ESCAP writes several citations into one cell, separated by semicolons and blank lines.
  const cited = new Map<string, string[]>();
  for (const row of rows) {
    if (only && !only.includes(row.indicator_id)) continue;
    const names = row.act_or_practice
      .split(/;|\n\n/)
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter((s) => s.length >= 8);
    if (!names.length) continue;
    cited.set(row.indicator_id, [...(cited.get(row.indicator_id) ?? []), ...names]);
  }

  const out: Probe[] = [];
  for (const [indicatorId, names] of cited) {
    const indicator = rubric.indicators.find((i) => i.id === indicatorId);
    if (!indicator) continue;
    const ranked = await shortlistInstruments(db, {
      economy,
      queries: queriesFor(indicator),
      limit: depth,
      contents,
      ...(primaryShare !== undefined ? { primaryShare } : {}),
    });
    for (const name of names) {
      const match = registry.find((r) => sameInstrument(r.title, name));
      const at = match ? ranked.findIndex((c) => c.instrumentId === match.id) : -1;
      out.push({
        indicatorId,
        cited: name,
        instrumentId: match?.id ?? null,
        rank: at >= 0 ? at + 1 : null,
        fetched: match ? fetched.has(match.id) : false,
      });
    }
  }
  return out;
}

for (const economy of economies) {
  const probes = await measure(economy);
  const registered = probes.filter((p) => p.instrumentId !== null);
  const inList = registered.filter((p) => p.rank !== null);
  const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(0)}%` : '--');

  console.log(`\n${economy} -- ${probes.length} cited instrument(s) over ${new Set(probes.map((p) => p.indicatorId)).size} indicators, depth ${depth}${primaryShare !== undefined ? `, ${Math.round(primaryShare * 100)}% held for Acts` : ''}${contents ? '' : ', titles only'}`);
  console.log(`  in the register        ${registered.length}/${probes.length}  ${pct(registered.length, probes.length)}`);
  console.log(`  shortlisted            ${inList.length}/${registered.length}  ${pct(inList.length, registered.length)}`);
  console.log(`  and already fetched    ${inList.filter((p) => p.fetched).length}/${inList.length}`);

  const missed = registered.filter((p) => p.rank === null);
  if (missed.length) {
    console.log(`  registered but never shortlisted:`);
    for (const m of missed) console.log(`    ${m.indicatorId.padEnd(8)} ${m.cited.slice(0, 72)}`);
      }
  const unregistered = probes.filter((p) => p.instrumentId === null);
  if (unregistered.length) {
    console.log(`  cited but not in the register at all:`);
    for (const m of unregistered) console.log(`    ${m.indicatorId.padEnd(8)} ${m.cited.slice(0, 72)}`);
      }
}
