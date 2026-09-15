/**
 * Where a wrong cell actually went wrong.
 *
 * The scorecard splits disagreements by whether the cell produced findings, and calls everything
 * with findings an over-claim. That is the wrong cut. A cell can read sixty provisions of the
 * right pillar, never meet the measure at all, and still be counted as having read too much into
 * what it saw -- thirteen of Australia's, Malaysia's and Singapore's worst cells are exactly that.
 *
 * So ask a different question, of ESCAP's own citation: did the instrument they answered from ever
 * reach the reader? Five answers, each with a different repair, and only the last is a reading
 * defect:
 *
 *   unregistered  the register never listed the instrument
 *   unfetched     listed, never retrieved
 *   unparsed      retrieved, no sections came out of it
 *   unshortlisted parsed, but no section of it was ever a candidate for this cell
 *   read          a section of it was read for this cell, and the measure was still missed
 */
import { readFileSync } from 'node:fs';
import { openDb } from '../src/db/index.js';
import { openBaseline, sameInstrument } from '../src/baseline/index.js';
import { scorecard, type CellResult } from '../src/eval/scorecard.js';

const ESCAP_NAME: Record<string, string> = { AUS: 'Australia', MYS: 'Malaysia', SGP: 'Singapore' };

type Reach = 'unregistered' | 'unfetched' | 'unparsed' | 'unshortlisted' | 'read' | 'uncited';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const runId = arg('run');
if (!runId) {
  console.error('usage: reach --run <id> [--from <replay csv>] [--economy AUS] [--verdict over-claim]');
  process.exit(1);
}

const db = openDb();
const baseline = openBaseline();

/** Every instrument we hold for an economy, with how far down the pipeline it got. */
const corpusOf = (economy: string) =>
  db
    .prepare(
      `SELECT i.id, i.title,
              (SELECT COUNT(*) FROM document d WHERE d.instrument_id = i.id) AS docs,
              (SELECT COUNT(*) FROM document d JOIN section s ON s.document_id = d.id
                WHERE d.instrument_id = i.id) AS sections
         FROM instrument i WHERE i.economy_code = ?`,
    )
    .all(economy) as { id: number; title: string; docs: number; sections: number }[];

/** The instruments ESCAP cites for a cell, by the law name on their row. */
const citedFor = baseline.prepare(
  `SELECT act_or_practice FROM baseline_row
    WHERE source = 'round-1' AND economy = ? AND indicator_id = ?
      AND act_or_practice IS NOT NULL AND act_or_practice != ''`,
);

/** Did any section of this instrument become a candidate for this cell, and was it read? */
const shortlisted = db.prepare(
  `SELECT COUNT(*) AS n, COUNT(se.read_at) AS read
     FROM shortlist_entry se
     JOIN section s ON s.id = se.section_id
     JOIN document d ON d.id = s.document_id
    WHERE se.cell_id = ? AND d.instrument_id = ?`,
);

const cellIdOf = db.prepare(
  'SELECT id FROM cell WHERE run_id = ? AND economy_code = ? AND indicator_id = ?',
);

const onlyEconomy = arg('economy');
const onlyVerdict = arg('verdict');

/**
 * The stored scores are the ungated run. A replay CSV carries the scores the gates produce, which
 * is what would ship, so diagnose those cells when one is offered.
 */
function fromCsv(path: string): CellResult[] {
  const [head, ...rows] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = head!.split(',');
  const at = (r: string[], n: string) => r[cols.indexOf(n)] ?? '';
  const num = (v: string) => (v === '' ? null : Number(v));
  return rows.map((line) => {
    const parts: string[] = [];
    let field = '', quoted = false;
    for (const ch of line) {
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) { parts.push(field); field = ''; }
      else field += ch;
    }
    parts.push(field);
    return {
      economy: at(parts, 'economy'), indicator: at(parts, 'indicator'),
      pillar: Number(at(parts, 'pillar')), ours: num(at(parts, 'ours')),
      theirs: num(at(parts, 'theirs')), findings: Number(at(parts, 'findings')),
      instruments: Number(at(parts, 'instruments')), verdict: at(parts, 'verdict') as CellResult['verdict'],
    };
  });
}

const from = arg('from');
const cells = (from ? fromCsv(from) : scorecard(db, runId)).filter(
  (c) =>
    c.verdict !== 'agree' &&
    c.verdict !== 'ungraded' &&
    (!onlyEconomy || c.economy === onlyEconomy) &&
    (!onlyVerdict || c.verdict === onlyVerdict),
);

const corpus = new Map<string, ReturnType<typeof corpusOf>>();
const tally: Record<Reach, number> = {
  unregistered: 0, unfetched: 0, unparsed: 0, unshortlisted: 0, read: 0, uncited: 0,
};
const lines: string[] = [];

for (const c of cells) {
  const escapEconomy = ESCAP_NAME[c.economy] ?? c.economy;
  const cited = (citedFor.all(escapEconomy, c.indicator) as { act_or_practice: string }[])
    .map((r) => r.act_or_practice.trim())
    .filter((t) => t.length > 0);

  if (cited.length === 0) {
    tally.uncited++;
    lines.push(`  ${c.economy} ${c.indicator.padEnd(8)} uncited       ESCAP names no instrument`);
    continue;
  }

  if (!corpus.has(c.economy)) corpus.set(c.economy, corpusOf(c.economy));
  const ours = corpus.get(c.economy)!;
  const cellId = (cellIdOf.get(runId, c.economy, c.indicator) as { id: number } | undefined)?.id;

  // Best reach across every instrument ESCAP cites: one of them arriving is enough.
  let best: Reach = 'unregistered';
  let via = cited[0]!;
  const rank: Reach[] = ['unregistered', 'unfetched', 'unparsed', 'unshortlisted', 'read'];
  for (const title of cited) {
    const match = ours.find((o) => sameInstrument(o.title, title));
    let reach: Reach = 'unregistered';
    if (match) {
      if (match.docs === 0) reach = 'unfetched';
      else if (match.sections === 0) reach = 'unparsed';
      else {
        const s = cellId
          ? (shortlisted.get(cellId, match.id) as { n: number; read: number })
          : { n: 0, read: 0 };
        reach = s.n === 0 ? 'unshortlisted' : 'read';
      }
    }
    if (rank.indexOf(reach) > rank.indexOf(best)) { best = reach; via = match?.title ?? title; }
  }

  tally[best]++;
  lines.push(
    `  ${c.economy} ${c.indicator.padEnd(8)} ${best.padEnd(13)} ` +
      `ours=${c.ours ?? '-'} escap=${c.theirs ?? '-'}  ${via.slice(0, 58)}`,
  );
}

console.log(`\nReach of ESCAP's own citation, run ${runId}`);
console.log(`\n  ${cells.length} cell(s) that do not agree\n`);
lines.sort().forEach((l) => console.log(l));
console.log('\n  where the measure-bearing instrument got to:');
for (const k of ['unregistered', 'unfetched', 'unparsed', 'unshortlisted', 'read', 'uncited'] as Reach[]) {
  if (tally[k]) console.log(`    ${k.padEnd(14)} ${String(tally[k]).padStart(3)}`);
}
console.log('\n  only the last is a reading defect; the rest are upstream of the reader.\n');
