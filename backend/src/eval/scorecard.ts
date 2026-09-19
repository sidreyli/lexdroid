/**
 * How a run compares with ESCAP's own answers, and why each cell differs.
 *
 * A disagreement is only useful if we can say which kind it is. Three kinds matter and each needs a
 * different fix: we read an instrument and claimed more than it says, we read the right instrument
 * and credited none of it, or we never found the instrument at all. Direction alone cannot tell the
 * first two apart, because some indicators score the presence of a framework as zero -- there,
 * over-claiming lands us below ESCAP, not above. So the indicator is asked which way it runs.
 */
import type { Database } from 'better-sqlite3';
import { openBaseline, escapScore } from '../baseline/index.js';
import { loadRubric } from '../rubric/index.js';
import { topBandScoresAbsence } from '../decide/index.js';
import { economyNames } from '../profile/index.js';

export type Verdict = 'agree' | 'over-claim' | 'under-claim' | 'recall-miss' | 'abstained' | 'ungraded';

export type CellResult = {
  economy: string;
  indicator: string;
  pillar: number;
  ours: number | null;
  theirs: number | null;
  findings: number;
  instruments: number;
  verdict: Verdict;
};

/** The pillar an indicator belongs to. "12.4.1" is pillar 12, and "4.01" is pillar 4. */
export function pillarOf(indicator: string): number {
  return Number.parseInt(indicator.split('.')[0] ?? '0', 10);
}

/**
 * Which kind of disagreement this is.
 *
 * Nothing found and still wrong means we never saw the instrument. Findings and still wrong splits
 * two ways that need opposite fixes, and calling both of them an over-claim hid one of them: of 52
 * cells this reported as over-claims, 24 scored *below* ESCAP while holding twelve to ninety-one
 * findings. Those did not read too much into a provision. They read the right instrument, excluded
 * every provision of it, and landed a band low -- and no rule that rejects evidence can help them.
 *
 * Direction alone cannot make the split, which is why it was not used: where the top band scores an
 * absence, finding too much lands us below ESCAP rather than above. So ask the indicator which way
 * it runs, and read the direction through it.
 */
export function verdictFor(
  ours: number | null,
  theirs: number | null,
  findings: number,
  topBandScoresAbsence = false,
): Verdict {
  if (theirs === null) return 'ungraded';
  if (ours === null) return 'abstained';
  if (ours === theirs) return 'agree';
  if (findings === 0) return 'recall-miss';
  const claimedMore = topBandScoresAbsence ? ours < theirs : ours > theirs;
  return claimedMore ? 'over-claim' : 'under-claim';
}

export function scorecard(db: Database, runId: string, baselinePath?: string): CellResult[] {
  const baseline = openBaseline(baselinePath);
  const indicators = new Map(loadRubric().indicators.map((i) => [i.id as string, i]));

  // ESCAP records one row per measure, each scored as that measure alone would score, so the rows
  // resolve to one answer by the indicator's own ladder. Taking the highest is wrong both ways.
  const rowsOf = new Map<string, (number | null)[]>();
  for (const row of baseline
    .prepare(`SELECT economy, indicator_id, raw_score FROM baseline_row
              WHERE source = 'round-1' AND indicator_id IS NOT NULL`)
    .all() as { economy: string; indicator_id: string; raw_score: number | null }[]) {
    const key = `${row.economy}/${row.indicator_id}`;
    const at = rowsOf.get(key);
    if (at) at.push(row.raw_score);
    else rowsOf.set(key, [row.raw_score]);
  }
  baseline.close();

  // Which way each indicator runs, asked of the indicator once rather than per cell.
  const absence = new Map<string, boolean>();
  for (const [id, ind] of indicators) absence.set(id, topBandScoresAbsence(ind));

  const theirs = new Map<string, number>();
  for (const [key, scores] of rowsOf) {
    const indicator = indicators.get(key.split('/')[1] ?? '');
    if (indicator) theirs.set(key, escapScore(indicator, scores).score);
  }

  const rows = db
    .prepare(`SELECT c.economy_code AS economy, c.indicator_id AS indicator, a.score AS ours,
                     (SELECT COUNT(*) FROM reading r WHERE r.cell_id = c.id AND r.applies = 1) AS findings,
                     (SELECT COUNT(DISTINCT d.instrument_id) FROM reading r
                        JOIN section s ON s.id = r.section_id
                        JOIN document d ON d.id = s.document_id
                       WHERE r.cell_id = c.id AND r.applies = 1) AS instruments
                FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
               WHERE c.run_id = ?
               ORDER BY c.economy_code, c.indicator_id`)
    .all(runId) as { economy: string; indicator: string; ours: number | null; findings: number; instruments: number }[];

  // Their sheets are keyed by name, ours by code.
  const names = economyNames();

  return rows.map((r) => {
    const their = theirs.get(`${names.get(r.economy) ?? r.economy}/${r.indicator}`) ?? null;
    return {
      economy: r.economy,
      indicator: r.indicator,
      pillar: pillarOf(r.indicator),
      ours: r.ours,
      theirs: their,
      findings: r.findings,
      instruments: r.instruments,
      verdict: verdictFor(r.ours, their, r.findings, absence.get(r.indicator) ?? false),
    };
  });
}

export type Tally = Record<Verdict, number> & { cells: number; findings: number };

export function tally(cells: CellResult[]): Tally {
  const t: Tally = {
    cells: 0, findings: 0, agree: 0, 'over-claim': 0, 'under-claim': 0, 'recall-miss': 0,
    abstained: 0, ungraded: 0,
  };
  for (const c of cells) {
    t.cells += 1;
    t.findings += c.findings;
    t[c.verdict] += 1;
  }
  return t;
}

export function groupBy<K extends string | number>(cells: CellResult[], key: (c: CellResult) => K): Map<K, CellResult[]> {
  const out = new Map<K, CellResult[]>();
  for (const c of cells) {
    const k = key(c);
    const list = out.get(k);
    if (list) list.push(c);
    else out.set(k, [c]);
  }
  return out;
}

export type Move = { economy: string; indicator: string; from: Verdict; to: Verdict };

/** What changed between two runs, so an experiment reports what it fixed and what it broke. */
export function movement(before: CellResult[], after: CellResult[]): Move[] {
  const was = new Map(before.map((c) => [`${c.economy}/${c.indicator}`, c.verdict]));
  const moves: Move[] = [];
  for (const c of after) {
    const from = was.get(`${c.economy}/${c.indicator}`);
    if (from !== undefined && from !== c.verdict) {
      moves.push({ economy: c.economy, indicator: c.indicator, from, to: c.verdict });
    }
  }
  return moves;
}
