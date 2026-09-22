/**
 * Whether a finished run still holds the evidence it was decided on.
 *
 * Scoring is a pure function of the stored readings, which is what lets `grade` replay the rules
 * over a banked run without an engine. It is only pure over the record the run actually left. A
 * re-parse rebuilds the sections of every document it touches and `reading` cascades away with
 * them -- deliberately, because a reading is a statement about words that no longer exist -- while
 * `answer_basis` is detached and re-attached, because what a past run cited is a record and not a
 * derived value. So a re-parsed run keeps its citations and loses the readings underneath them,
 * and `recordedDecider`, which rebuilds strictly from `c.run_id = ?`, sees a cell with nothing in
 * it and reports a broken cell.
 *
 * That is how Malaysia's banked run came to read 40/61 -> 30/61 with eleven cells broken and the
 * number was quoted twice as a measurement of the rules. It measures the re-parse: the run recorded
 * putting 19,785 provisions in front of the engine, 3,356 readings of them are still stored, and 56
 * of the 69 provisions its answers cite no longer carry one. Australia and Singapore, whose
 * documents that re-parse did not touch, lost none of the nineteen they cite.
 *
 * > A run that no longer holds a reading of a provision its own answer cites has lost its evidence,
 * > and what a rescore measures over it is the loss rather than the rules.
 *
 * The citation is the exact signal and the reading count is only the magnitude. A basis row exists
 * because a reading of that provision was made by this run and counted towards its band, so the
 * reading's absence can mean nothing else. The counts cannot be compared directly: `sections_read`
 * is what the reader was handed and a reading is only written for what it could use, so a run that
 * has lost nothing is still short by its discards -- Australia and Singapore stored 19,990 readings
 * against 20,906 provisions read, and that 4% is the ordinary discard, not a loss.
 */
import type { Db } from '../db/index.js';

export interface EconomyEvidence {
  economy: string;
  cells: number;
  /** Provisions the run recorded putting in front of the engine. */
  read: number;
  /** Readings of them the store still holds. Short of `read` by the run's own discards. */
  readings: number;
  /** Provisions the run's banked answers cite. */
  cited: number;
  /** Of those, the ones this run no longer holds a reading of. Above zero means evidence is gone. */
  lost: number;
}

/** What each economy of a run has left, worst first. */
export function runEvidence(db: Db, runId: string): EconomyEvidence[] {
  const rows = db
    .prepare(
      `SELECT c.economy_code                                             AS economy,
              COUNT(*)                                                   AS cells,
              COALESCE(SUM(c.sections_read), 0)                          AS read,
              (SELECT COUNT(*) FROM reading r JOIN cell rc ON rc.id = r.cell_id
                WHERE rc.run_id = c.run_id AND rc.economy_code = c.economy_code) AS readings,
              (SELECT COUNT(*) FROM answer_basis b JOIN cell bc ON bc.id = b.cell_id
                WHERE bc.run_id = c.run_id AND bc.economy_code = c.economy_code
                  AND b.section_id IS NOT NULL)                          AS cited,
              (SELECT COUNT(*) FROM answer_basis b JOIN cell bc ON bc.id = b.cell_id
                WHERE bc.run_id = c.run_id AND bc.economy_code = c.economy_code
                  AND b.section_id IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM reading r
                                   WHERE r.cell_id = b.cell_id AND r.section_id = b.section_id)) AS lost
         FROM cell c
        WHERE c.run_id = ?
        GROUP BY c.economy_code`,
    )
    .all(runId) as EconomyEvidence[];
  return rows.sort((x, y) => y.lost - x.lost || x.economy.localeCompare(y.economy));
}

/** True where any of the run's economies has lost evidence its own answers rest on. */
export function evidenceIsLost(evidence: EconomyEvidence[]): boolean {
  return evidence.some((e) => e.lost > 0);
}

/**
 * The pillars of a run that have provably lost evidence, as `${economy} ${pillar}`.
 *
 * The pillar is the unit because reading is: one call reads one provision against a whole pillar
 * and its answer is sorted to that pillar's cells, so every cell of a pillar was handed the same
 * union of provisions and a cascaded section takes a reading from all of them at once. The store
 * bears it out -- across both banked runs, every cell of every (economy, pillar) records the same
 * `sections_read` and holds the same number of readings, without exception. So one cell's orphaned
 * citation convicts its pillar.
 *
 * It has to be the pillar, because the cell that suffers most leaves the least trace. A cell
 * answering "the governing instrument does not impose one" cites an instrument and no provision,
 * so it has no citation to orphan -- and removing its readings is exactly what makes it say that
 * more emphatically. Malaysia's 4.6 and 5.7 broke that way and a per-cell test cannot see either.
 *
 * A pillar whose cells cite no provision at all is not named: nothing in the run proves it, and the
 * economy's own line already says the economy has lost evidence. Malaysia's pillar 5 keeps 47 of
 * the 312 provisions it read where Australia's pillar 5 keeps 309 of 311, which says what happened
 * plainly enough without this claiming to have proved it.
 */
export function pillarsMissingEvidence(db: Db, runId: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT DISTINCT c.economy_code AS economy,
              CAST(substr(c.indicator_id, 1, instr(c.indicator_id, '.') - 1) AS INTEGER) AS pillar
         FROM answer_basis b JOIN cell c ON c.id = b.cell_id
        WHERE c.run_id = ? AND b.section_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM reading r
                           WHERE r.cell_id = b.cell_id AND r.section_id = b.section_id)`,
    )
    .all(runId) as { economy: string; pillar: number }[];
  return new Set(rows.map((r) => `${r.economy} ${r.pillar}`));
}

/** One line per economy, for a script to print above anything it measured over the record. */
export function evidenceLines(evidence: EconomyEvidence[]): string[] {
  return evidence
    .filter((e) => e.lost > 0)
    .map(
      (e) =>
        `${e.economy}: ${e.lost} of ${e.cited} cited provision(s) no longer carry a reading ` +
        `(${e.readings} reading(s) left of ${e.read} read). Its cells below measure that, not the rules.`,
    );
}
