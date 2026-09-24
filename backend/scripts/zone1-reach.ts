/**
 * Whether every cell's measure-bearing instrument can reach the reader at all, before a run.
 *
 *   npm run -w backend zone1-reach
 *
 * `reach.ts` asks how far ESCAP's citation got, but only for cells whose score already differs,
 * and only for a run that has already happened. The question before a run is the other one, asked
 * of all 61 indicators in all three economies: is there any cell whose instrument cannot be
 * surfaced at all, because it is not registered, not fetched, not parsed, or parsed and carrying
 * no vector? A provision with no vector is invisible to the dense channel however good the rules
 * are, and nothing else in the pipeline reports that per cell -- this is how the twenty-three
 * cells whose text arrived after the last embedding pass were found.
 *
 * Only the last four states are defects. `unregistered` mostly is not: ESCAP names ISO standards,
 * WTO moratoria, company financial statements and agency guidance as often as it names law, and a
 * citation that resolves to nothing is as likely to be a citation of nothing. Read the names, do
 * not count the number.
 */
import { openDb } from '../src/db/index.js';
import { citedInstruments, openBaseline, sameInstrument } from '../src/baseline/index.js';
import { economyNames } from '../src/profile/index.js';

const ESCAP_NAME = economyNames();
const db = openDb();
const baseline = openBaseline();

type Reach = 'uncited' | 'unregistered' | 'unfetched' | 'unparsed' | 'unvectored' | 'ready';
const RANK: Reach[] = ['unregistered', 'unfetched', 'unparsed', 'unvectored', 'ready'];

const corpusOf = (economy: string) =>
  db
    .prepare(
      `SELECT i.id, i.title,
              COUNT(DISTINCT d.id) AS docs,
              COUNT(DISTINCT s.id) AS sections,
              COUNT(DISTINCT se.section_id) AS vectors
         FROM instrument i
         LEFT JOIN document d ON d.instrument_id = i.id
         LEFT JOIN section s ON s.document_id = d.id
         LEFT JOIN section_embedding se ON se.section_id = s.id
        WHERE i.economy_code = ?
        GROUP BY i.id`,
    )
    .all(economy) as { id: number; title: string; docs: number; sections: number; vectors: number }[];

const citedFor = baseline.prepare(
  `SELECT act_or_practice FROM baseline_row
    WHERE source = 'round-1' AND economy = ? AND indicator_id = ?
      AND act_or_practice IS NOT NULL AND act_or_practice != ''`,
);

const indicators = (
  db.prepare('SELECT DISTINCT indicator_id FROM cell ORDER BY indicator_id').all() as {
    indicator_id: string;
  }[]
).map((r) => r.indicator_id);

const tally: Record<Reach, number> = {
  uncited: 0, unregistered: 0, unfetched: 0, unparsed: 0, unvectored: 0, ready: 0,
};
const problems: string[] = [];

for (const economy of ['AUS', 'MYS', 'SGP']) {
  const ours = corpusOf(economy);
  const escapEconomy = ESCAP_NAME.get(economy) ?? economy;
  for (const indicator of indicators) {
    const cited = (citedFor.all(escapEconomy, indicator) as { act_or_practice: string }[])
      .flatMap((r) => citedInstruments(r.act_or_practice));
    if (cited.length === 0) {
      tally.uncited++;
      continue;
    }
    let best: Reach = 'unregistered';
    let via = cited[0]!;
    let note = '';
    for (const title of cited) {
      const match = ours.find((o) => sameInstrument(o.title, title));
      let reach: Reach = 'unregistered';
      let mark = '';
      if (match) {
        if (match.docs === 0) reach = 'unfetched';
        else if (match.sections === 0) reach = 'unparsed';
        else if (match.vectors === 0) reach = 'unvectored';
        else reach = 'ready';
        mark = `#${match.id} docs=${match.docs} sec=${match.sections} vec=${match.vectors}`;
      }
      if (RANK.indexOf(reach) > RANK.indexOf(best)) {
        best = reach;
        via = match?.title ?? title;
        note = mark;
      }
    }
    tally[best]++;
    if (best !== 'ready') {
      problems.push(
        `  ${economy} ${indicator.padEnd(8)} ${best.padEnd(12)} ${via.slice(0, 56).padEnd(56)} ${note}`,
      );
    }
  }
}

console.log(`\nZone 1 readiness of ESCAP's own citation, all ${indicators.length} indicators x 3 economies\n`);
problems.sort().forEach((l) => console.log(l));
console.log('');
for (const k of ['uncited', 'unregistered', 'unfetched', 'unparsed', 'unvectored', 'ready'] as Reach[]) {
  if (tally[k]) console.log(`  ${k.padEnd(13)} ${String(tally[k]).padStart(3)}`);
}
