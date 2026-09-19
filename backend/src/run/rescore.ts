/**
 * Take the scores again, after the second reading has ruled on the findings.
 *
 * The confirmation pass does not change what was read; it changes what each reading is held to
 * have shown. So the cells have to be decided again over the same record, and the answer that
 * stands has to be the one the export and the reviewer will see. Until this existed the pass wrote
 * its verdicts into a table that only a diagnostic script consulted, and the run went on reporting
 * the scores it had computed before the verdicts arrived.
 *
 * Nothing is read, fetched, searched or asked of an engine. This is the same decision, over the
 * same readings, with the verdicts now in front of it -- which is exactly what `replay` prints and
 * what `verify` checks a stored score against. One rebuild, three callers.
 *
 * The basis is rewritten with the score because a cell that now rests on different provisions and
 * still cites the old ones is worse than one that was never re-scored: the citation would no longer
 * support the claim.
 */
import type { Db } from '../db/index.js';
import { recordedDecider } from '../decide/record.js';
import { confirmationsForRun, type ConfirmationSet } from '../read/confirmations.js';
import { ratesOfRun } from './index.js';

export interface RescoreResult {
  cells: number;
  /** Cells whose score is not what it was. */
  changed: number;
  /** Cells that were answered and now cannot be, and the reverse. Both are worth saying. */
  nowUnresolved: number;
  nowAnswered: number;
}

export interface RescoreOptions {
  /** The verdicts to score against. The run's own engine's, when not given. */
  confirmations?: ConfirmationSet;
}

export function rescoreRun(db: Db, runId: string, opts: RescoreOptions = {}): RescoreResult {
  const confirmations = opts.confirmations ?? confirmationsForRun(db, runId);
  const { cells, rebuild } = recordedDecider(db, runId, ratesOfRun(db, runId), { confirmations });

  const updateCell = db.prepare('UPDATE cell SET state = ?, unresolved_reason = ? WHERE id = ?');
  const updateAnswer = db.prepare(
    `INSERT OR REPLACE INTO cell_answer
       (cell_id, score, band_ordinal, band_criterion, deciding_fact, controlling_instrument_id,
        absence_basis, rationale, confirmations_asked, confirmations_applied, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const clearBasis = db.prepare('DELETE FROM answer_basis WHERE cell_id = ?');
  const insertBasis = db.prepare(
    `INSERT OR IGNORE INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure, quote)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const out: RescoreResult = { cells: 0, changed: 0, nowUnresolved: 0, nowAnswered: 0 };
  const now = new Date().toISOString();

  db.transaction(() => {
    for (const cell of cells) {
      const decision = rebuild(cell);
      if (!decision) continue;
      out.cells += 1;

      const was = cell.score;
      const is = decision.score;
      if (was !== is) out.changed += 1;
      if (was !== null && is === null) out.nowUnresolved += 1;
      if (was === null && is !== null) out.nowAnswered += 1;

      updateCell.run(
        decision.state,
        decision.state === 'unresolved' ? decision.decidingFact : null,
        cell.id,
      );

      const lead = decision.basis[0];
      const controlling =
        lead?.instrumentId ?? decision.absence?.instrumentId ?? decision.frameworkBasis[0]?.instrumentId ?? null;

      updateAnswer.run(
        cell.id,
        decision.score,
        decision.band?.ordinal ?? null,
        decision.band?.criterion ?? null,
        decision.decidingFact,
        controlling,
        decision.absence?.basis ?? null,
        decision.rationale,
        decision.confirmations?.asked ?? 0,
        decision.confirmations?.applied ?? 0,
        now,
      );

      // The provisions the answer now stands on, in place of the ones it used to.
      clearBasis.run(cell.id);
      let ordinal = 0;
      for (const e of decision.basis) {
        insertBasis.run(cell.id, (ordinal += 1), e.instrumentId, e.sectionId, e.finding.measure, e.finding.quote);
      }
      // Where a zero rests on an instrument rather than a provision of it, that instrument is the
      // basis, and the export needs it to cite what the absence was read against.
      if (decision.basis.length === 0 && decision.absence) {
        insertBasis.run(cell.id, (ordinal += 1), decision.absence.instrumentId, null, null, null);
      }
      const framework = decision.state === 'restricted' ? decision.frameworkBasis[0] : undefined;
      if (framework && decision.basis.length === 0) {
        insertBasis.run(cell.id, (ordinal += 1), framework.instrumentId, null, null, null);
      }
    }
  })();

  return out;
}
