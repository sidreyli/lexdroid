/**
 * The banked answers to the second question, read back as one set.
 *
 * Three places assemble the evidence a decision is made from -- the live run, the rebuild that
 * verify checks a stored score against, and the replay that grades a rule change without an
 * engine. Each one used to decide for itself whether a confirmation applied, and only one of them
 * ever did: the same run scored 105 cells stored, 105 re-derived and 118 replayed, all three true
 * and nothing in the store saying which question each had answered.
 *
 * So the lookup lives here and all three call it. A score is then a function of the readings and
 * this set, and `applied`/`asked` are written onto the answer so a later re-derivation that sees a
 * different set says so instead of quietly returning a different number.
 *
 * Two rulings are preserved from the pass that produced these rows, because they are the whole
 * point of keeping `failure` separate from a null answer:
 *
 *   words present   the provision was read and states the measure
 *   words null      the provision was read and does not state it -- evidence for a zero
 *   failure set     nobody read it. Not a provision found wanting, and not a verdict.
 */
import type { Db } from '../db/index.js';

export interface ConfirmationSet {
  /** How many verdicts are in force. A failed ask is not one. */
  readonly size: number;
  /**
   * True where the provision was read and states the measure, false where it was read and does
   * not, and undefined where it was never asked or the ask failed.
   */
  verdict(sectionId: number, indicatorId: string, measure: string | null | undefined): boolean | undefined;
}

const EMPTY: ConfirmationSet = { size: 0, verdict: () => undefined };

/** A set with nothing in it, for a caller that has deliberately turned confirmations off. */
export function noConfirmations(): ConfirmationSet {
  return EMPTY;
}

/**
 * Every verdict banked so far.
 *
 * Read once per run rather than per cell: the table is keyed by the question, not the run, so the
 * same provision filed under the same measure in three cells is one row read one time.
 */
export function loadConfirmations(db: Db): ConfirmationSet {
  const byKey = new Map<string, boolean>();
  for (const row of db
    .prepare(
      `SELECT section_id, indicator_id, measure, words
         FROM measure_confirmation WHERE failure IS NULL`,
    )
    .all() as { section_id: number; indicator_id: string; measure: string; words: string | null }[]) {
    byKey.set(`${row.section_id}/${row.indicator_id}/${row.measure}`, row.words !== null);
  }

  return {
    size: byKey.size,
    verdict(sectionId, indicatorId, measure) {
      if (!measure) return undefined;
      return byKey.get(`${sectionId}/${indicatorId}/${measure}`);
    },
  };
}

/**
 * The verdict as a property to spread onto an Evidence, or nothing where there is none.
 *
 * Undefined and absent are not the same thing downstream: absent means the reading predates the
 * pass, and holding on that would hold every finding in every earlier run.
 */
export function confirmedFlag(verdict: boolean | undefined): { confirmed?: boolean } {
  return verdict === undefined ? {} : { confirmed: verdict };
}

/** What a cell's decision actually consulted, written onto the answer so drift is detectable. */
export interface ConfirmationTally {
  /** Findings that carried a verdict either way. */
  asked: number;
  /** Findings the pass ruled out. These are the ones that change a score. */
  applied: number;
}

export function tallyConfirmations(
  evidence: readonly { confirmed?: boolean | undefined }[],
): ConfirmationTally {
  let asked = 0;
  let applied = 0;
  for (const e of evidence) {
    if (e.confirmed === undefined) continue;
    asked += 1;
    if (e.confirmed === false) applied += 1;
  }
  return { asked, applied };
}
