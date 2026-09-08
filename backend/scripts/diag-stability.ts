import { openDb } from '../src/db/index.js';
import { readSection } from '../src/read/index.js';
import { loadRubric, indicatorsOfPillar } from '../src/rubric/index.js';

const CONCURRENCY = Number(process.env['C'] ?? 4);
const N = Number(process.env['N'] ?? 20);
const db = openDb();
// The provisions pillar 6 actually read last run, so the sample is the real workload.
const rows = db.prepare(`
  select distinct s.id, s.heading_path, s.text, i.title
  from reading r join section s on s.id = r.section_id
  join document d on d.id = s.document_id join instrument i on i.id = d.instrument_id
  join cell c on c.id = r.cell_id
  where c.economy_code='AUS' and c.indicator_id like '6.%'
  order by s.id limit ?
`).all(N) as any[];

const inds = indicatorsOfPillar(6, loadRubric());
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]!); }
  }));
  return out;
}
const sig = (r: any): string =>
  r.findings.map((f: any) => `${f.indicatorId}/${f.measure}/${String(f.quote).slice(0, 40)}`).sort().join('|');

const round = (): Promise<string[]> => pool(rows, CONCURRENCY, async (r) =>
  sig(await readSection({ sectionId: r.id, instrumentTitle: r.title, headingPath: r.heading_path, text: r.text },
    6, inds[0]!.pillarName, inds)));

const t0 = Date.now();
const a = await round();
const b = await round();
const secs = (Date.now() - t0) / 1000;
let differ = 0;
for (let k = 0; k < rows.length; k += 1) {
  if (a[k] !== b[k]) { differ += 1; console.log(`DIFFERS: ${rows[k]!.title} :: ${String(rows[k]!.heading_path).slice(-60)}`); console.log(`   A: ${a[k] || '(nothing)'}`); console.log(`   B: ${b[k] || '(nothing)'}`); }
}
console.log(`\nconcurrency ${CONCURRENCY}: ${differ}/${rows.length} provisions read differently on a second pass (${secs.toFixed(0)}s for both passes)`);
