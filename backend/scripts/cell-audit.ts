/**
 * Every cell, classified by whether its answer is evidenced -- which is the thing the rubric marks.
 *
 *   npm run -w backend cell-audit
 *   npm run -w backend cell-audit -- --run <id>       one run instead of the latest per economy
 *   npm run -w backend cell-audit -- --class hollow   only cells in one class
 *
 * This replaces an earlier audit that classified a cell by whether it cited the same instrument as
 * ESCAP, and treated "different instrument, same score" as a false agreement. That was the wrong
 * test twice over.
 *
 * It is wrong on the framework's own terms. The internal guide answers it directly -- "One measure
 * can be listed under several RDTII sub-pillars" -- and the horizontal/vertical coverage rule means
 * a restriction can sit in an overarching Act or in a sector regulation made under it, and both are
 * in scope. An economy that restricts the same thing in two instruments has two correct citations
 * and ESCAP's reviewer wrote one of them down.
 *
 * It is wrong on the submission's terms. The final-round output schema has fourteen columns and not
 * one of them is a score: the row is law_name, indicator_id, article, discovery_tag, snippet, url,
 * language. `discovery_tag` is NEW for an independent find and KNOWN for one already in the held
 * baseline, so an instrument ESCAP did not name is the case the schema has a word for, not a defect.
 * Nothing in C1a-C5 marks agreement with ESCAP's number. C2b marks article-level verbatim citation
 * and C2a marks the mapping staying consistent across economies.
 *
 * So agreement is a diagnostic for the reader, reported here beside the cell, and the class is set
 * by what the cell rests on:
 *
 *   evidenced   the answer cites what its shape owes: a provision with a quote where it asserts a
 *               measure, a named instrument where it is a framework question or an absence
 *   named-only  an absence or framework answer resting on an instrument, no provision -- the
 *               expected shape, kept separate because `reuse` is what tells the two apart
 *   thin        an asserted measure with no provision behind it -- article-level is the graded
 *               unit and this is the shape that cannot be exported as a row
 *   secondary   it rests on a publication, which the guide excludes: "Excludes secondary sources"
 *   bare        it cites nothing at all
 *
 * A zero is not automatically bare. The guide's scoring criteria say a score of 0 means low
 * compliance cost or "absence of specific measures/regulations", and directs the researcher to cite
 * "relevant general rules (if have)" and state the reason. An absence with a general rule behind it
 * is a finding; an absence with nothing behind it is an assertion, and the two look identical in
 * the score column. That is what this separates.
 *
 * `reuse` is the tell for the second kind. It counts how many other indicators in the same economy
 * rest on the same lead instrument: one Act standing as the governing instrument for nine unrelated
 * questions is a default, not nine findings.
 */
import { openDb } from '../src/db/index.js';
import { scorecard, type CellResult } from '../src/eval/scorecard.js';
import { loadRubric } from '../src/rubric/index.js';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** Words that appear in almost every statute title and so distinguish nothing. */
const EMPTY = new Set([
  'act', 'acts', 'the', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'a', 'an', 'no',
  'regulation', 'regulations', 'rules', 'rule', 'order', 'orders', 'law', 'laws', 'code',
  'notice', 'notices', 'guideline', 'guidelines', 'amendment', 'amended', 'cap', 'chapter',
  'section', 'sections', 'part', 'schedule', 'national', 'general', 'provisions', 'provision',
]);

function tokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 2 && !EMPTY.has(w) && !/^\d{4}$/.test(w))
      // ESCAP writes "Patent Act 1990" where the register carries "Patents Act 1990", and an
      // audit that calls those two different instruments invents the very defect it is counting.
      .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)),
  );
}

/** Whether two instrument names are the same instrument, judged on the words that distinguish it. */
function sameInstrument(a: string, b: string): boolean {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  for (const w of ta) if (tb.has(w)) shared++;
  return shared / Math.min(ta.size, tb.size) >= 0.6;
}

type Basis = {
  title: string;
  kind: string | null;
  status: string;
  hasSection: number;
  hasQuote: number;
  instrumentId: number;
};

type Row = {
  cell: CellResult;
  klass: 'evidenced' | 'named-only' | 'thin' | 'secondary' | 'bare';
  escap: 'corroborated' | 'independent' | 'divergent-same-instrument' | 'divergent' | 'escap-silent';
  reuse: number;
  lead: string;
  theirs: string;
  theirsRegistered: boolean | null;
};

async function main(): Promise<void> {
  const db = openDb();
  const only = arg('run');
  const wantClass = arg('class');
  const runs: { id: string; economy: string }[] = only
    ? (db.prepare('SELECT DISTINCT run_id id, economy_code economy FROM cell WHERE run_id=?').all(only) as any[])
    : (db.prepare(
        `SELECT c.economy_code economy, c.run_id id, MAX(r.started_at) AS t
           FROM cell c JOIN run r ON r.id=c.run_id
          WHERE r.status='complete' AND c.economy_code IN ('AUS','SGP','MYS')
          GROUP BY c.economy_code ORDER BY c.economy_code`).all() as any[]);

  const baseline = new Database(resolve('data/baseline.db'), { readonly: true });
  const escapActs = new Map<string, string[]>();
  for (const r of baseline.prepare(
    `SELECT economy, indicator_id, act_or_practice FROM baseline_row
      WHERE source='round-1' AND indicator_id IS NOT NULL AND act_or_practice IS NOT NULL`).all() as any[]) {
    const key = `${r.economy}/${r.indicator_id}`;
    const at = escapActs.get(key) ?? [];
    at.push(String(r.act_or_practice));
    escapActs.set(key, at);
  }
  baseline.close();
  const names = new Map(
    (db.prepare('SELECT code, name FROM economy').all() as any[]).map((e) => [e.code, e.name] as const));

  const basisOf = db.prepare(
    `SELECT i.title, i.kind, i.status, i.id AS instrumentId,
            (ab.section_id IS NOT NULL) AS hasSection,
            (ab.quote IS NOT NULL AND length(ab.quote) > 0) AS hasQuote
       FROM answer_basis ab
       JOIN cell c ON c.id = ab.cell_id
       JOIN instrument i ON i.id = ab.instrument_id
      WHERE c.run_id = ? AND c.economy_code = ? AND c.indicator_id = ?
      ORDER BY ab.ordinal`);

  const rows: Row[] = [];

  const shapeOf = new Map<string, string>(loadRubric().indicators.map((i) => [i.id, i.shape]));

  for (const run of runs) {
    const results = scorecard(db, run.id).filter((c) => c.economy === run.economy);
    const state = new Map<string, string>(
      (db.prepare('SELECT indicator_id, economy_code, state FROM cell WHERE run_id = ?').all(run.id) as any[])
        .map((c) => [`${c.indicator_id}/${c.economy_code}`, c.state]));
    // Every instrument this economy's register holds, for asking whether ESCAP's Act is even here.
    const registered = db.prepare('SELECT title FROM instrument WHERE economy_code = ?')
      .all(run.economy) as { title: string }[];

    const draft: Omit<Row, 'reuse'>[] = [];
    for (const cell of results) {
      const basis = basisOf.all(run.id, cell.economy, cell.indicator) as Basis[];
      const theirActs = (escapActs.get(`${names.get(cell.economy)}/${cell.indicator}`) ?? [])
        .filter((a) => tokens(a).size > 0);

      const lead = basis[0];
      // What the cell owes depends on the indicator's shape and on the answer it gave. A framework
      // indicator is decided over instruments, so naming one is the whole of its evidence; an
      // absence owes a general rule where the economy has one, and owes no provision, because
      // there is no provision to cite. Only an asserted measure owes an article and a quote.
      const shape = shapeOf.get(cell.indicator) ?? 'provision';
      const owesProvision = shape === 'provision' && state.get(cell.indicator + '/' + cell.economy) === 'restricted';
      let klass: Row['klass'];
      if (!basis.length) klass = 'bare';
      else if (basis.every((b) => b.kind === 'publication')) klass = 'secondary';
      else if (owesProvision && !basis.some((b) => b.hasSection && b.hasQuote)) klass = 'thin';
      else if (!owesProvision && !basis.some((b) => b.hasSection && b.hasQuote)) klass = 'named-only';
      else klass = 'evidenced';

      const matched = basis.some((b) => theirActs.some((a) => sameInstrument(a, b.title)));
      const agreed = cell.verdict === 'agree';
      const escap: Row['escap'] = !theirActs.length
        ? 'escap-silent'
        : agreed
          ? matched ? 'corroborated' : 'independent'
          : matched ? 'divergent-same-instrument' : 'divergent';

      draft.push({
        cell,
        klass,
        escap,
        lead: lead?.title ?? '(none)',
        theirs: theirActs[0] ?? '(none named)',
        theirsRegistered: theirActs.length
          ? registered.some((r) => theirActs.some((a) => sameInstrument(a, r.title)))
          : null,
      });
    }

    // How often each lead instrument stands as the answer across this economy's other indicators.
    const leadCount = new Map<string, number>();
    for (const d of draft) if (d.lead !== '(none)') leadCount.set(d.lead, (leadCount.get(d.lead) ?? 0) + 1);
    for (const d of draft) rows.push({ ...d, reuse: leadCount.get(d.lead) ?? 0 });
  }

  const show = wantClass ? rows.filter((r) => r.klass === wantClass) : rows;
  for (const r of show) {
    console.log([
      r.cell.economy,
      r.cell.indicator.padEnd(7),
      String(r.cell.ours ?? '-').padStart(4),
      String(r.cell.theirs ?? '-').padStart(4),
      r.cell.verdict.padEnd(11),
      r.klass.padEnd(10),
      r.escap.padEnd(25),
      `reuse ${String(r.reuse).padStart(2)}`,
      r.theirsRegistered === false ? 'THEIRS NOT REGISTERED' : '                     ',
      `${r.lead.slice(0, 40)}  |  ${r.theirs.slice(0, 40)}`,
    ].join('  '));
  }

  const count = <K extends string>(pick: (r: Row) => K): Map<K, number> => {
    const m = new Map<K, number>();
    for (const r of rows) m.set(pick(r), (m.get(pick(r)) ?? 0) + 1);
    return m;
  };
  const table = (title: string, m: Map<string, number>): void => {
    console.log(`\n${title}`);
    for (const [k, v] of [...m].sort((a, b) => b[1] - a[1])) console.log(`${String(v).padStart(4)}  ${k}`);
  };

  console.log(`\n=== ${rows.length} cells ===`);
  table('what the answer rests on', count((r) => r.klass));
  table('against ESCAP, as a diagnostic', count((r) => r.escap));
  table('what the answer rests on, among the cells that agree',
    count((r) => (r.cell.verdict === 'agree' ? r.klass : 'zz-other')));

  const unregistered = rows.filter((r) => r.theirsRegistered === false);
  console.log(`\ncells where the instrument ESCAP names is not in our register at all: ${unregistered.length}`);
  console.log('  (a Zone 1 defect -- no rule change can reach a document we never fetched)');

  const defaults = rows.filter((r) => r.reuse >= 4 && r.klass !== 'bare');
  console.log(`\ncells whose lead instrument also leads 3+ other indicators: ${defaults.length}`);
  const byLead = new Map<string, string[]>();
  for (const r of defaults) {
    const k = `${r.cell.economy}  ${r.lead.slice(0, 50)}`;
    byLead.set(k, [...(byLead.get(k) ?? []), r.cell.indicator]);
  }
  for (const [k, ind] of [...byLead].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(ind.length).padStart(2)}  ${k}  --  ${ind.join(', ')}`);
  }

  console.log('\nruns audited: ' + runs.map((r) => `${r.economy} ${r.id.slice(0, 8)}`).join(', '));
  db.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
