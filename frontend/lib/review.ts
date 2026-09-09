/**
 * A reviewer's verdict on one finding. These mirror the review_action table, which
 * the backend defines but does not yet expose a route to write.
 */

export type ReviewAction = "accept" | "edit" | "reject";

/** Only these fields can be corrected by hand. Everything else is derived. */
export interface FindingEdit {
  article: string | null;
  locationReference: string | null;
  verbatimSnippet: string | null;
  quoteCharStart: number | null;
  quoteCharEnd: number | null;
  score: number | null;
  bandOrdinal: number | null;
  bandCriterion: string | null;
  mappingRationale: string | null;
  notes: string | null;
}

export interface ReviewDecision {
  rowId: number;
  action: ReviewAction;
  attestation: string;
  changedFields: Partial<Record<keyof FindingEdit, { from: unknown; to: unknown }>>;
  reviewer: string;
  actedAt: string;
}

export const actionLabel: Record<ReviewAction, string> = {
  accept: "Approved",
  edit: "Corrected",
  reject: "Rejected",
};

/** Compares a draft against the finding as read, keeping only what actually moved. */
export function diffEdit(
  before: FindingEdit,
  after: FindingEdit,
): ReviewDecision["changedFields"] {
  const out: ReviewDecision["changedFields"] = {};
  for (const key of Object.keys(before) as (keyof FindingEdit)[]) {
    if (before[key] !== after[key]) out[key] = { from: before[key], to: after[key] };
  }
  return out;
}
