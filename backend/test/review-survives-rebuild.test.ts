/**
 * A reviewer's decision surviving a re-export.
 *
 * `buildExportRows` is idempotent for rows: it deletes the run's rows and builds them again, so
 * running it twice does not double the export. But `gate_result` and `review_action` both reference
 * `export_row(id)` with ON DELETE CASCADE, and every rebuilt row gets a new id -- so the delete was
 * taking both with it.
 *
 * For the gates that is survivable, because `verifyRun` recomputes them from the stored source and
 * the fleet runs it straight after the export. A reviewer's accept or reject is not recomputable by
 * anything. It is a person's judgement about a specific quotation, and re-exporting was destroying
 * it without saying so -- on 15 October, a reviewer could work through the held rows and lose all
 * of it to a re-export nobody thought of as destructive.
 *
 * Found by rebuilding run 82673dbf's export and watching its 200 gate-held rows drop to zero.
 */
import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { buildExportRows } from '../src/export/index.js';

function store(): Db {
  const db = openDb(':memory:');
  const now = '2026-09-16T00:00:00Z';
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1', ?, '["SGP"]', '[6]', 'engine-a', 'm', 'fetch', 'abc', ?, 'complete')`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO economy (code, name, official_languages) VALUES ('SGP', 'Singapore', '["en"]')`,
  ).run();
  return db;
}

/**
 * A cell that produces one unresolved row: the smallest shape that exercises the rebuild without
 * needing a document, a reading and a finding to hang off it.
 */
function cellWithRow(db: Db, indicator: string, reason: string): number {
  const info = db
    .prepare(
      `INSERT INTO cell (run_id, economy_code, indicator_id, state, unresolved_reason)
       VALUES ('r1', 'SGP', ?, 'unresolved', ?)`,
    )
    .run(indicator, reason);
  return Number(info.lastInsertRowid);
}

function review(db: Db, rowId: number, reviewer: string): void {
  db.prepare(
    `INSERT INTO review_action (export_row_id, action, reviewer, acted_at)
     VALUES (?, 'reject', ?, '2026-09-16T01:00:00Z')`,
  ).run(rowId, reviewer);
}

function rowsOf(db: Db): { id: number; indicator_id: string }[] {
  return db
    .prepare(
      `SELECT e.id, e.indicator_id FROM export_row e JOIN cell c ON c.id = e.cell_id
        WHERE c.run_id = 'r1' ORDER BY e.indicator_id`,
    )
    .all() as { id: number; indicator_id: string }[];
}

describe('rebuilding the export', () => {
  it('carries a reviewer decision onto the row that did not change', () => {
    const db = store();
    cellWithRow(db, '6.1', 'nothing found');
    buildExportRows(db, 'r1');

    const [row] = rowsOf(db);
    review(db, row!.id, 'a reviewer');

    const result = buildExportRows(db, 'r1');
    expect(result.reviewsCarried).toBe(1);
    expect(result.reviewsDropped).toBe(0);

    // The id changed; the decision did not.
    const after = rowsOf(db);
    const kept = db
      .prepare(`SELECT export_row_id, action, reviewer FROM review_action`)
      .all() as { export_row_id: number; action: string; reviewer: string }[];
    expect(kept).toHaveLength(1);
    expect(kept[0]?.action).toBe('reject');
    expect(kept[0]?.reviewer).toBe('a reviewer');
    expect(kept[0]?.export_row_id).toBe(after[0]!.id);
    db.close();
  });

  it('carries a decision when only the wording of the rationale moved', () => {
    // Identity is the citation and the quotation -- what a reviewer actually reads. A reworded
    // rationale is our prose about the same provision, so the decision still stands.
    const db = store();
    const cellId = cellWithRow(db, '6.1', 'nothing found');
    buildExportRows(db, 'r1');
    review(db, rowsOf(db)[0]!.id, 'a reviewer');

    db.prepare(`UPDATE cell SET unresolved_reason = 'a different reason entirely' WHERE id = ?`).run(cellId);
    const result = buildExportRows(db, 'r1');

    expect(result.reviewsCarried).toBe(1);
    expect(result.reviewsDropped).toBe(0);
    db.close();
  });

  it('does not transplant a decision onto a row citing a different instrument', () => {
    // The safety property. A reviewer rejected a claim about one Act; if the rebuild now cites a
    // different Act at a different URL, that is not the row they judged, and inheriting the
    // rejection would attribute a judgement to them that they never made.
    const db = store();
    for (const [id, title, url] of [
      [1, 'Payment Services Act 2019', 'https://sso.agc.gov.sg/Act/PSA2019'],
      [2, 'Companies Act 1967', 'https://sso.agc.gov.sg/Act/CoA1967'],
    ] as const) {
      db.prepare(
        `INSERT INTO instrument (id, economy_code, title, kind, source_url, language,
                                 discovered_via, discovered_at)
         VALUES (?, 'SGP', ?, 'act', ?, 'en', 'portal', '2026-09-16T00:00:00Z')`,
      ).run(id, title, url);
    }
    const info = db
      .prepare(
        `INSERT INTO cell (run_id, economy_code, indicator_id, state)
         VALUES ('r1', 'SGP', '6.1', 'no-restriction')`,
      )
      .run();
    const cellId = Number(info.lastInsertRowid);
    db.prepare(
      `INSERT INTO cell_answer (cell_id, rationale, controlling_instrument_id, computed_at)
       VALUES (?, 'no requirement found', 1, '2026-09-16T00:00:00Z')`,
    ).run(cellId);

    buildExportRows(db, 'r1');
    review(db, rowsOf(db)[0]!.id, 'a reviewer');

    db.prepare(`UPDATE cell_answer SET controlling_instrument_id = 2 WHERE cell_id = ?`).run(cellId);
    const result = buildExportRows(db, 'r1');

    expect(result.reviewsCarried).toBe(0);
    // Not silent: somebody's work went, and the caller is told how much.
    expect(result.reviewsDropped).toBe(1);
    expect(db.prepare(`SELECT COUNT(*) n FROM review_action`).get()).toEqual({ n: 0 });
    db.close();
  });

  it('does not multiply decisions when the export is rebuilt repeatedly', () => {
    const db = store();
    cellWithRow(db, '6.1', 'nothing found');
    buildExportRows(db, 'r1');
    review(db, rowsOf(db)[0]!.id, 'a reviewer');

    for (let i = 0; i < 3; i++) buildExportRows(db, 'r1');

    expect(db.prepare(`SELECT COUNT(*) n FROM review_action`).get()).toEqual({ n: 1 });
    db.close();
  });
});
