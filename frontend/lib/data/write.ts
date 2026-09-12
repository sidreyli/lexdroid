/**
 * The writes the interface makes: a reviewer's verdict, and the corrections that come with it.
 * Every verdict is appended to the ledger, so what the tool said and what a reviewer changed both survive.
 */
import "server-only";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { DB_PATH } from "./paths";
import type { FindingEdit, ReviewAction } from "@/lib/review";

let handle: Database.Database | null = null;

function db(): Database.Database {
  if (handle) return handle;
  if (!existsSync(DB_PATH)) throw new Error("No working store to write to");
  handle = new Database(DB_PATH);
  handle.pragma("journal_mode = WAL");
  handle.pragma("busy_timeout = 8000");
  return handle;
}

export interface Verdict {
  rowId: number;
  action: ReviewAction;
  attestation: string;
  changedFields: Partial<Record<keyof FindingEdit, { from: unknown; to: unknown }>>;
  reviewer: string;
}

/** What a correction touches: the citation on the row, or the band on the answer behind it. */
const ROW_COLUMNS: Partial<Record<keyof FindingEdit, string>> = {
  article: "article",
  locationReference: "location_reference",
  verbatimSnippet: "verbatim_snippet",
  quoteCharStart: "quote_char_start",
  quoteCharEnd: "quote_char_end",
  mappingRationale: "mapping_rationale",
  notes: "notes",
};
const ANSWER_COLUMNS: Partial<Record<keyof FindingEdit, string>> = {
  score: "score",
  bandOrdinal: "band_ordinal",
  bandCriterion: "band_criterion",
};

function assignments(
  changed: Verdict["changedFields"],
  columns: Partial<Record<keyof FindingEdit, string>>,
): { sets: string[]; values: unknown[] } {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [field, change] of Object.entries(changed ?? {})) {
    const column = columns[field as keyof FindingEdit];
    if (!column) continue;
    sets.push(`${column} = ?`);
    values.push((change as { to: unknown }).to ?? null);
  }
  return { sets, values };
}

export function recordVerdict(v: Verdict): { id: number } {
  const d = db();
  const row = d.prepare("SELECT id, cell_id AS cellId FROM export_row WHERE id = ?").get(v.rowId) as
    | { id: number; cellId: number }
    | undefined;
  if (!row) throw new Error(`No row ${v.rowId}`);

  const write = d.transaction((): { id: number } => {
    const inserted = d
      .prepare(
        `INSERT INTO review_action (export_row_id, action, attestation, changed_fields, reviewer, acted_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        v.rowId,
        v.action,
        v.attestation || null,
        JSON.stringify(v.changedFields ?? {}),
        v.reviewer || null,
        new Date().toISOString(),
      );

    if (v.action === "edit") {
      const onRow = assignments(v.changedFields, ROW_COLUMNS);
      if (onRow.sets.length > 0) {
        d.prepare(`UPDATE export_row SET ${onRow.sets.join(", ")} WHERE id = ?`).run(
          ...onRow.values,
          v.rowId,
        );
      }
      const onAnswer = assignments(v.changedFields, ANSWER_COLUMNS);
      if (onAnswer.sets.length > 0) {
        d.prepare(`UPDATE cell_answer SET ${onAnswer.sets.join(", ")} WHERE cell_id = ?`).run(
          ...onAnswer.values,
          row.cellId,
        );
      }
    }
    return { id: Number(inserted.lastInsertRowid) };
  });

  return write();
}
