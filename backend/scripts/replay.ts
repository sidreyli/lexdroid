/**
 * Re-score a finished run from its stored readings, with no engine and no network.
 *
 *   npm run -w backend replay -- --run <id>
 *   npm run -w backend replay -- --run <id> --no-confirmed    score as if the second reading never ran
 *
 * The banked second-reading verdicts are in play by default, because the live run scores against
 * them too. --no-confirmed is for reproducing a run recorded before that was true, and the fidelity
 * line says when a run is one of those.
 *
 * The readings are the expensive part of a run and they are already banked. Scoring is a pure
 * function of them, so a rule change can be graded in seconds instead of a six-hour fleet.
 * Nothing is written: this reads the run and prints, so the graded run stays the record of itself.
 */
import { writeFileSync } from 'node:fs';
import { openDb } from '../src/db/index.js';
import {
  decide,
  sameFinding,
  topBandScoresAbsence,
  type Evidence,
  type FrameworkEvidence,
  type SurfacedInstrument,
  type Coverage,
} from '../src/decide/index.js';
import { loadRubric } from '../src/rubric/index.js';
import { loadProfile } from '../src/profile/index.js';
import { citationUrl } from '../src/export/index.js';
import { amendsAnotherAct, citesADefinition } from '../src/parse/identity.js';
import { scorecard, tally, verdictFor, pillarOf, type CellResult } from '../src/eval/scorecard.js';
import type { Finding } from '../src/read/index.js';
import { confirmationsForRun, noConfirmations } from '../src/read/confirmations.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/**
 * Candidate qualifications to try before writing one into the scorer.
 * Each says which findings may support a band; the point is to measure a rule, not to adopt it.
 */
const GATES: Record<string, (e: Evidence, governing: number[]) => boolean> = {
  none: () => true,
  // Not a candidate rule. It is the ceiling for any rule that works by rejecting findings: what a
  // cell scores when none survive. A cell it does not fix cannot be fixed by rejecting better.
  'reject-all': () => false,
  governing: (e, g) => g.length === 0 || g.includes(e.instrumentId),
  mandatory: (e) => e.finding.mandatory !== false,
  imposes: (e) => e.finding.dutyForce !== 'declares',
  'governing+imposes': (e, g) => (g.length === 0 || g.includes(e.instrumentId)) && e.finding.dutyForce !== 'declares',
  'mandatory+imposes': (e) => e.finding.mandatory !== false && e.finding.dutyForce !== 'declares',
};
const gateName = arg('gate') ?? 'none';
const gate = GATES[gateName];
const prefersGoverning = gateName.startsWith('prefer-governing');
if (!gate && !prefersGoverning) {
  console.error(`unknown gate "${gateName}"; try: ${Object.keys(GATES).join(', ')}, prefer-governing`);
  process.exit(1);
}

/**
 * The register's verdict as a preference rather than a veto: read only the instruments it named,
 * unless it named none that were read, in which case its silence should not silence the cell.
 */
function qualify(evidence: Evidence[], governing: number[]): Evidence[] {
  if (prefersGoverning) {
    const named = evidence.filter((e) => governing.includes(e.instrumentId));
    return named.length > 0 ? named : evidence;
  }
  return evidence.filter((e) => gate!(e, governing));
}

const db = openDb();
const runId =
  arg('run') ?? (db.prepare('SELECT id FROM run ORDER BY started_at DESC LIMIT 1').get() as { id: string }).id;
const indicators = new Map(loadRubric().indicators.map((i) => [i.id as string, i]));

/** Which way an indicator runs, so a disagreement can be read as over- or under-claiming. */
const absenceCache = new Map<string, boolean>();
function absenceScored(id: string): boolean {
  let v = absenceCache.get(id);
  if (v === undefined) {
    const ind = indicators.get(id);
    v = ind ? topBandScoresAbsence(ind) : false;
    absenceCache.set(id, v);
  }
  return v;
}

const ratesRow = db.prepare('SELECT fx_rates FROM run WHERE id = ?').get(runId) as { fx_rates: string | null } | undefined;
const rates = ratesRow?.fx_rates ? JSON.parse(ratesRow.fx_rates) : null;

type CellRow = {
  id: number;
  economy_code: string;
  indicator_id: string;
  governing: string | null;
  surfaced_instruments: string | null;
  sections_read: number | null;
  framework_failed: number | null;
  sections_indexed: number | null;
};

const cells = db
  .prepare(
    `SELECT id, economy_code, indicator_id, governing, surfaced_instruments, sections_read, framework_failed, sections_indexed
     FROM cell WHERE run_id = ? ORDER BY economy_code, indicator_id`,
  )
  .all(runId) as CellRow[];

const pillarOfIndicator = (id: string) => id.split('.')[0] ?? '';
const siblings = new Map<string, string[]>();
for (const c of cells) {
  const key = `${c.economy_code}/${pillarOfIndicator(c.indicator_id)}`;
  siblings.set(key, [...(siblings.get(key) ?? []), c.indicator_id]);
}

/**
 * Every reading of the pillar this cell belongs to, not only this cell's own.
 *
 * Reading is pillar-scoped and the decision is handed the pillar's whole evidence, so an
 * indicator with no findings of its own still has a witness that its subject was governed. The
 * record files each finding under the indicator that acted on it, which is right for the row and
 * wrong for the replay: taking one cell's rows back would leave three zeros unreproducible.
 */
const readingsFor = db.prepare(
  `SELECT r.cell_id, r.section_id, r.attributes, s.heading_path, s.text, s.anchor,
          d.instrument_id, i.title AS instrument_title, i.kind AS instrument_kind,
          i.source_url, i.last_amended_on
   FROM reading r
   JOIN cell c ON c.id = r.cell_id
   JOIN section s ON s.id = r.section_id
   JOIN document d ON d.id = s.document_id
   JOIN instrument i ON i.id = d.instrument_id
   WHERE c.run_id = ? AND c.economy_code = ? AND c.indicator_id IN (SELECT value FROM json_each(?))
   ORDER BY r.applies DESC, r.id`,
);

const frameworkFor = db.prepare(
  `SELECT f.instrument_id, i.title, i.source_url, i.kind, f.establishes_framework, f.framework_shown,
          f.horizontal, f.dedicated, f.dedicated_shown, f.sectoral_shown, f.sector, f.quote
   FROM framework_reading f JOIN instrument i ON i.id = f.instrument_id WHERE f.cell_id = ?`,
);

// Coverage counts every instrument the reader looked at, not only the ones it found something in.
// A cell that read forty Acts and found nothing has searched; one that read none has not.
const consideredFor = db.prepare(
  `SELECT COUNT(DISTINCT d.instrument_id) AS n
   FROM reading r JOIN cell c ON c.id = r.cell_id
   JOIN section s ON s.id = r.section_id JOIN document d ON d.id = s.document_id
   WHERE c.run_id = ? AND c.economy_code = ? AND c.indicator_id IN (SELECT value FROM json_each(?))`,
);

const storedAnswer = db.prepare('SELECT score FROM cell_answer WHERE cell_id = ?');

/**
 * What the register calls each instrument, for the surfaced list a zero is cited against.
 *
 * A run banks its surfaced instruments as JSON, and the runs already in the store were banked
 * before the kind was carried: all 1,160 entries of the Australia/Singapore run hold an id, a
 * title, a rank and a currency date, and no kind. `absenceFor` turns away a publication about the
 * law, so read from the JSON alone that guard can never fire and a replay scores a consultation
 * paper as the Act that governs the subject -- which is the behaviour the guard exists to stop.
 *
 * The rebuild path does not have this hole: `recordedDecider` joins the register for the kind
 * rather than trusting the banked row. This does the same, so all three ways of scoring a run see
 * the same register.
 *
 * The banked value still wins where a run recorded one. This fills a gap; it does not overrule a
 * run that answered for itself.
 */
const kindOfInstrument = new Map<number, string | null>(
  (db.prepare('SELECT id, kind FROM instrument').all() as { id: number; kind: string | null }[]).map(
    (r) => [r.id, r.kind],
  ),
);

/**
 * The second reading's answers, where --confirmed asks for them.
 *
 * Off by default so the replay of a run reproduces that run. On, every finding the confirmation
 * pass ruled out is a provision read twice and found not to carry the measure.
 */
const bare = process.argv.includes('--no-confirmed');
const confirmations = bare ? noConfirmations() : confirmationsForRun(db, runId);
console.log(`
  ${confirmations.size} banked confirmation(s) in play`);

const profiles = new Map<string, Map<string, 'binding' | 'binding-on-licensees' | 'advisory'>>();
function bindingnessFor(economy: string) {
  let m = profiles.get(economy);
  if (!m) {
    m = new Map(loadProfile(economy).instrumentTypes.map((t) => [t.kind, t.bindingness]));
    profiles.set(economy, m);
  }
  return m;
}

type Replayed = {
  economy: string;
  indicator: string;
  was: number | null;
  now: number | null;
  state: string;
  decidingFact: string;
  basis: number;
  held: number;
  excluded: number;
  /** Findings this cell's decision saw a second-reading refusal for. */
  applied: number;
  heldReasons: string;
};
const out: Replayed[] = [];
const dispositions: { economy: string; indicator: string; disposition: string; measure: string; reason: string }[] = [];

for (const cell of cells) {
  const indicator = indicators.get(cell.indicator_id);
  if (!indicator) continue;
  const binding = bindingnessFor(cell.economy_code);

  const evidence: Evidence[] = [];
  // The cell's own search, where the run recorded it. Older runs kept only its size, and a zero
  // cited against a count cannot be reproduced -- so those fall back to everything read.
  const surfaced: SurfacedInstrument[] = (
    cell.surfaced_instruments ? (JSON.parse(cell.surfaced_instruments) as SurfacedInstrument[]) : []
  ).map((s) => ({ ...s, kind: s.kind ?? kindOfInstrument.get(s.instrumentId) ?? null }));
  const recorded = surfaced.length > 0;

  const pillarIndicators = siblings.get(`${cell.economy_code}/${pillarOfIndicator(cell.indicator_id)}`) ?? [];
  const rows = readingsFor.all(runId, cell.economy_code, JSON.stringify(pillarIndicators)) as Record<string, any>[];

  for (const row of rows) {
    if (!recorded && !surfaced.some((s) => s.instrumentId === row['instrument_id'])) {
      surfaced.push({
        instrumentId: row['instrument_id'],
        instrumentTitle: row['instrument_title'],
        rank: surfaced.length,
        currentTo: row['last_amended_on'] ?? null,
        kind: row['instrument_kind'] ?? null,
      });
    }
    // A zero is cited against what the search surfaced, which is every instrument read, not only
    // the ones something was found in -- a cell that finds nothing still has to cite the Act it read.
    for (const finding of JSON.parse(row['attributes']) as Finding[]) {
      // The same claim reported twice is one claim, as the live pipeline has it.
      if (evidence.some((e) => sameFinding(e, { sectionId: row['section_id'], finding }))) continue;
      const kind = binding.get(row['instrument_kind']);
      const confirmed = confirmations.verdict(row['section_id'], finding.indicatorId, finding.measure);
      evidence.push({
        finding,
        sectionId: row['section_id'],
        instrumentId: row['instrument_id'],
        instrumentTitle: row['instrument_title'],
        headingPath: row['heading_path'],
        citation: citationUrl(row['source_url'], row['anchor']),
        amendsAnotherAct: amendsAnotherAct(row['text']),
        definesATerm: citesADefinition(row['text'], finding.definingWords ?? finding.quote),
        ...(kind ? { bindingness: kind } : {}),
        ...(confirmed === undefined ? {} : { confirmed }),
      });
    }
  }

  const frameworkEvidence: FrameworkEvidence[] = (frameworkFor.all(cell.id) as Record<string, any>[]).map((f) => ({
    instrumentId: f['instrument_id'],
    instrumentTitle: f['title'],
    citation: f['source_url'],
    establishesFramework: f['establishes_framework'] === 1,
    frameworkShown: f['framework_shown'] == null ? null : f['framework_shown'] === 1,
    horizontal: f['horizontal'] === 1,
    dedicated: f['dedicated'] === 1,
    dedicatedShown: f['dedicated_shown'] === 1,
    sectoralShown: f['sectoral_shown'] === 1,
    sector: f['sector'],
    bindingness: binding.get(f['kind']) ?? null,
    quote: f['quote'],
  }));

  const isFramework = indicator.shape === 'framework';
  const coverage: Coverage = {
    sectionsRead: cell.sections_read ?? 0,
    sectionsIndexed: cell.sections_indexed ?? 0,
    instrumentsConsidered: isFramework
      ? frameworkEvidence.length
      : ((consideredFor.get(runId, cell.economy_code, JSON.stringify(pillarIndicators)) as { n: number }).n ?? 0),
    ...(isFramework && cell.framework_failed !== null ? { frameworkUnread: cell.framework_failed } : {}),
  };

  const governing: number[] = cell.governing ? JSON.parse(cell.governing) : [];
  const d = decide({
    indicator,
    economy: cell.economy_code,
    evidence: qualify(evidence, governing),
    frameworkEvidence,
    surfaced,
    governing,
    coverage,
    rates,
  });

  // WHY=AUS/12.3 says why one cell answered as it did. A cell that moved is a question, and the
  // deciding fact answers it without a second run.
  if (process.env['WHY'] === `${cell.economy_code}/${cell.indicator_id}`) {
    console.log(`
  ${cell.economy_code} ${cell.indicator_id}: ${d.state}, score ${d.score}`);
    console.log(`  because: ${d.decidingFact}`);
    console.log(
      `  evidence ${evidence.length}, basis ${d.basis.length}, held ${d.held.length}, ` +
        `ruled out ${d.excluded.length}, surfaced ${surfaced.length}`,
    );
    for (const h of d.held.slice(0, 5)) console.log(`    held: ${h.reason}`);
    for (const e of d.basis.slice(0, 5)) {
      console.log(`    cites: ${e.instrumentTitle} -- ${e.finding.measure} -- "${(e.finding.quote ?? '').slice(0, 150)}"`);
    }
    if (d.absence) console.log(`    read against: ${d.absence.instrumentTitle} (${d.absence.basis})`);
  }
  const was = (storedAnswer.get(cell.id) as { score: number | null } | undefined)?.score ?? null;
  for (const [disposition, list] of [
    ['held', d.held],
    ['excluded', d.excluded],
  ] as const) {
    for (const h of list) {
      dispositions.push({
        economy: cell.economy_code,
        indicator: cell.indicator_id,
        disposition,
        measure: h.evidence.finding.measure ?? '',
        reason: h.reason,
      });
    }
  }
  for (const e of d.basis) {
    dispositions.push({
      economy: cell.economy_code,
      indicator: cell.indicator_id,
      disposition: 'basis',
      measure: e.finding.measure ?? '',
      reason: '',
    });
  }
  const reasons = [...new Set([...d.held, ...d.excluded].map((h) => h.reason))];
  out.push({
    economy: cell.economy_code,
    indicator: cell.indicator_id,
    was,
    now: d.score ?? null,
    state: d.state,
    decidingFact: d.decidingFact,
    basis: d.basis.length,
    held: d.held.length,
    excluded: d.excluded.length,
    applied: d.confirmations?.applied ?? 0,
    heldReasons: reasons.slice(0, 6).join(' | '),
  });
}

const moved = out.filter((r) => r.was !== r.now);
const pct = (n: number, of: number) => (of === 0 ? '  -  ' : `${((100 * n) / of).toFixed(1)}%`);

console.log(`\nReplay of ${runId}   gate: ${gateName}`);
console.log(`\n  ${out.length} cell(s) re-scored from banked readings, no engine`);
console.log(
  `  fidelity: ${out.length - moved.length} of ${out.length} reproduce the stored score` +
    (moved.length === 0 ? '  (exact)' : `  -- ${moved.length} differ`),
);

// A run scored before confirmations were consulted cannot be reproduced by a replay that consults
// them, and saying so is the point of recording the state. Without this line the mismatch above
// looks like a scoring bug rather than two different questions.
const storedState = db
  .prepare(
    `SELECT COUNT(a.confirmations_asked) AS recorded, COALESCE(SUM(a.confirmations_applied), 0) AS applied
       FROM cell c JOIN cell_answer a ON a.cell_id = c.id WHERE c.run_id = ?`,
  )
  .get(runId) as { recorded: number; applied: number };
if (storedState.recorded === 0 && confirmations.size > 0 && !bare) {
  console.log(
    `  the stored scores recorded no confirmation state, so they were computed without one.
` +
      `  Re-run with --no-confirmed to reproduce them, or treat the difference as the pass's effect.`,
  );
} else if (storedState.recorded > 0) {
  const replayApplied = out.reduce((n, r) => n + r.applied, 0);
  const same = replayApplied === storedState.applied;
  console.log(
    `  confirmation state: ${storedState.applied} finding(s) ruled out when stored, ` +
      `${replayApplied} now${same ? '  (same set)' : '  -- THE SET HAS CHANGED'}`,
  );
}

if (moved.length > 0) {
  console.log(`\n    economy  indicator   stored   replay`);
  for (const r of moved.slice(0, 40)) {
    const was = String(r.was ?? '-').padStart(6);
    const now = String(r.now ?? '-').padStart(6);
    console.log(`    ${r.economy.padEnd(7)}  ${r.indicator.padEnd(9)}  ${was}   ${now}`);
  }
  if (moved.length > 40) console.log(`    ... and ${moved.length - 40} more`);
}

// Grade the replayed scores exactly as the scorecard grades a run, so the two numbers compare.
const graded = new Map(scorecard(db, runId).map((c) => [`${c.economy}/${c.indicator}`, c]));
const replayed: CellResult[] = out.map((r) => {
  const g = graded.get(`${r.economy}/${r.indicator}`);
  const findings = g?.findings ?? 0;
  return {
    economy: r.economy,
    indicator: r.indicator,
    pillar: pillarOf(r.indicator),
    ours: r.now,
    theirs: g?.theirs ?? null,
    findings,
    instruments: g?.instruments ?? 0,
    verdict: verdictFor(r.now, g?.theirs ?? null, findings, absenceScored(r.indicator)),
  };
});

// --csv <path> writes the graded cells out, because a headline that did not move can still hide
// forty that did, and the direction of each one is what a rule change is diagnosed from.
const csvPath = arg('csv');
if (csvPath) {
  const cell = (v: unknown) => `"${String(v ?? '').replaceAll('"', "''")}"`;
  const byKey = new Map(out.map((r) => [`${r.economy}/${r.indicator}`, r]));
  const lines = [
    'economy,indicator,pillar,ours,theirs,findings,instruments,verdict,state,basis,held,excluded,decidingFact,heldReasons',
  ];
  for (const r of replayed) {
    const d = byKey.get(`${r.economy}/${r.indicator}`);
    lines.push(
      [
        r.economy, r.indicator, r.pillar, r.ours ?? '', r.theirs ?? '', r.findings, r.instruments, r.verdict,
        d?.state ?? '', d?.basis ?? '', d?.held ?? '', d?.excluded ?? '',
        cell(d?.decidingFact), cell(d?.heldReasons),
      ].join(','),
    );
  }
  writeFileSync(csvPath, lines.join('\n') + '\n');
  console.log(`  wrote ${replayed.length} graded cell(s) to ${csvPath}`);
  const dlines = ['economy,indicator,disposition,measure,reason'];
  for (const d of dispositions) {
    dlines.push([d.economy, d.indicator, d.disposition, d.measure, cell(d.reason)].join(','));
  }
  const dPath = csvPath.replace(/\.csv$/, '-evidence.csv');
  writeFileSync(dPath, dlines.join('\n') + '\n');
  console.log(`  wrote ${dispositions.length} disposed finding(s) to ${dPath}`);
}

const t = tally(replayed);
const g = t.cells - t.ungraded;
console.log(`\n  replayed scorecard: ${g} graded, ${t.agree} agree (${pct(t.agree, g)})`);
console.log(`    over-claim   ${String(t['over-claim']).padStart(4)}`);
console.log(`    under-claim  ${String(t['under-claim']).padStart(4)}`);
console.log(`    recall-miss  ${String(t['recall-miss']).padStart(4)}`);
console.log(`    abstained    ${String(t.abstained).padStart(4)}`);

// What the change actually did: a change that wins overall can still be losing cells it should keep.
{
  const before = new Map([...graded].map(([k, c]) => [k, c.verdict]));
  const moves = new Map<string, string[]>();
  for (const r of replayed) {
    const was = before.get(`${r.economy}/${r.indicator}`);
    if (!was || was === r.verdict) continue;
    const key = `${was} -> ${r.verdict}`;
    moves.set(key, [...(moves.get(key) ?? []), `${r.economy} ${r.indicator}`]);
  }
  console.log(`\n  what the gate moved, against the ungated run`);
  for (const [k, cs] of [...moves].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`    ${String(cs.length).padStart(4)}  ${k.padEnd(26)} ${cs.join(', ')}`);
  }
}
console.log('');
