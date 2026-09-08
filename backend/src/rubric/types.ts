/**
 * The indicator model.
 *
 * Every field here is derived from an ESCAP document by scripts/derive-rubric.ts and carries
 * provenance saying which one. Nothing in this model is typed in by hand, because a rubric we
 * transcribed is a rubric we can get wrong quietly.
 */

/** Verbatim as ESCAP writes it. Never parsed as a number: "4.01" and "4.1" are different
 *  indicators, and "12.10" collapses to "12.1" the moment anything treats it as numeric. */
export type IndicatorId = string;

/**
 * What kind of question the indicator asks. This decides how many rows a cell may produce and
 * what counts as evidence, and getting it wrong is one of the five mapping traps ESCAP names.
 */
export type IndicatorShape =
  /** The default. A specific provision in a specific instrument answers it. */
  | 'provision'
  /** Answered once for the whole economy: does a comprehensive framework exist at all.
   *  ESCAP: per-provision citations here "are not discoveries and score zero". */
  | 'framework'
  /** Turns on observed practice rather than statutory text, so official reports and
   *  documented cases are admissible alongside primary law. */
  | 'practice';

/** One band of the scoring scale, as ESCAP states it. */
export interface ScoreBand {
  /** The numeric score this band awards. */
  readonly score: number;
  /** ESCAP's own wording for when this band applies, verbatim and untrimmed. */
  readonly criterion: string;
  /** 1-based position in ESCAP's enumeration, so band text can be traced back to the sheet. */
  readonly ordinal: number;
}

export interface Indicator {
  readonly id: IndicatorId;
  readonly pillarId: number;
  readonly pillarName: string;
  /** ESCAP's "Category (Policy issue)" text: what the indicator is about. */
  readonly category: string;
  /** The "Exception:" clause carved out of the category text, when there is one. These are
   *  load-bearing -- 3.1 excludes telecom and e-commerce because 5.x and 12.x cover them. */
  readonly exception: string | null;
  /** The full "Criteria for scoring" cell, verbatim, before it was split into bands. */
  readonly criteriaText: string;
  /** The bands, highest score first. */
  readonly bands: readonly ScoreBand[];
  readonly shape: IndicatorShape;
  /** Why this shape, quoted from the document that says so. */
  readonly shapeBasis: string;
  readonly provenance: Provenance;
}

export interface Pillar {
  readonly id: number;
  readonly name: string;
  readonly indicatorIds: readonly IndicatorId[];
}

export interface Provenance {
  /** Repo-relative path of the ESCAP document this was read out of. */
  readonly document: string;
  /** Where in it: sheet name and row, or page. */
  readonly locator: string;
}

/*  There is deliberately no timestamp on a Provenance. The rubric carries one derivedAt at the
 *  top; stamping the same value onto all 64 provenance records made every re-derivation a 65-line
 *  diff of nothing, which is how a generated file stops being reviewed.
 */

export interface Rubric {
  readonly version: string;
  readonly derivedAt: string;
  readonly pillars: readonly Pillar[];
  readonly indicators: readonly Indicator[];
  /** The indicator IDs ESCAP draws from external databases, for which they state plainly that
   *  no extraction tool is required. Recorded so the count is auditable, never processed. */
  readonly nonRegulatory: readonly IndicatorId[];
  readonly sources: readonly Provenance[];
}
