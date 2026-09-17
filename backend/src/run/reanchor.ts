/**
 * Holding an economy's citations across a re-parse.
 *
 * A re-parse rebuilds the sections of every document it touches. `reading` and `shortlist_entry`
 * cascade away with them, which is right -- a finding about a provision whose text has changed is
 * stale and has to be read again. `answer_basis` and `export_row` deliberately do not cascade:
 * what a past run cited is a record, not a derived value, and a parser change may not quietly
 * delete it. SQLite then refuses the delete outright, which is how re-parsing Malaysia stopped at
 * the sixth Act with "FOREIGN KEY constraint failed" -- 146 of its 1,626 documents are cited by an
 * answer, and they are the documents that matter most, being the ones the cells rest on.
 *
 * So `detachCitations` parks the pointers and nulls them, and `attachCitations` puts each one back
 * against the provision that now carries the same Part, heading and label. A citation the new parse
 * no longer produces is not restored and not guessed at: it goes to the discard ledger, named.
 */
import type { Db } from '../db/index.js';

const TABLES = ['answer_basis', 'export_row'] as const;
type CitingTable = (typeof TABLES)[number];

export interface DetachResult {
  parked: Record<CitingTable, number>;
  /**
   * Export rows that named the reading behind them, released because that reading cannot survive.
   *
   * A section's readings cascade away with it and are re-read, so this pointer -- unlike the
   * section pointer -- has nothing to come back to. `export_row.reading_id` does not cascade
   * either, so it blocks the cascade onto `reading` and the re-parse fails there instead.
   */
  readingsReleased: number;
  held: number;
}

export interface AttachResult {
  /** Put back against the provision that carries the same Part, heading and label. */
  restored: number;
  /** Of those, the ones matched on position because the name was gone. */
  byPosition: number;
  /** Export rows whose quote was found again in the re-parsed text, and re-offset onto it. */
  reoffset: number;
  /** Export rows whose quote the new parse does not contain; their offsets are now null. */
  offsetLost: number;
  /** Citations the new parse has no provision for, written to the discard ledger. */
  retired: number;
  held: number;
}

const heldCount = (db: Db): number =>
  (db.prepare('SELECT COUNT(*) c FROM detached_citation').get() as { c: number }).c;

export function detachCitations(db: Db, economy: string, at: string = new Date().toISOString()): DetachResult {
  const sectionsOf = `
    SELECT s.id FROM section s
      JOIN document d ON d.id = s.document_id
      JOIN instrument i ON i.id = d.instrument_id
     WHERE i.economy_code = ?`;
  const park = db.prepare(
    `INSERT OR REPLACE INTO detached_citation
       (table_name, row_id, document_id, ordinal, heading_path, label, detached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const parked = { answer_basis: 0, export_row: 0 };
  let readingsReleased = 0;

  db.transaction(() => {
    for (const table of TABLES) {
      const rows = db
        .prepare(
          `SELECT t.id, s.document_id, s.ordinal, s.heading_path, s.label
             FROM ${table} t JOIN section s ON s.id = t.section_id
            WHERE t.section_id IN (${sectionsOf})`,
        )
        .all(economy) as {
        id: number; document_id: number; ordinal: number; heading_path: string; label: string | null;
      }[];
      const clear = db.prepare(`UPDATE ${table} SET section_id = NULL WHERE id = ?`);
      for (const r of rows) {
        park.run(table, r.id, r.document_id, r.ordinal, r.heading_path, r.label, at);
        clear.run(r.id);
      }
      parked[table] = rows.length;
    }

    // The reading behind an export row is not parked, because it is not coming back: it is a
    // finding about text that is about to change, and it has to be read again. Said out loud all
    // the same, so the row's provenance does not just go quiet.
    const behind = db
      .prepare(
        `SELECT e.id, e.reading_id, e.indicator_id, e.law_name FROM export_row e
          WHERE e.reading_id IS NOT NULL AND e.reading_id IN (
            SELECT r.id FROM reading r
              JOIN section s ON s.id = r.section_id
              JOIN document d ON d.id = s.document_id
              JOIN instrument i ON i.id = d.instrument_id
             WHERE i.economy_code = ?)`,
      )
      .all(economy) as { id: number; reading_id: number; indicator_id: string; law_name: string }[];
    const discard = db.prepare(
      'INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)',
    );
    const release = db.prepare('UPDATE export_row SET reading_id = NULL WHERE id = ?');
    for (const r of behind) {
      discard.run(
        're-parse',
        `export_row ${r.id} :: ${r.indicator_id} :: ${r.law_name}`,
        'the reading behind this row is re-read by the re-parse and cannot be pointed at again',
        `was reading ${r.reading_id}`,
        at,
      );
      release.run(r.id);
      readingsReleased += 1;
    }
  }).immediate();

  return { parked, readingsReleased, held: heldCount(db) };
}

export function attachCitations(db: Db, at: string = new Date().toISOString()): AttachResult {
  const held = db.prepare('SELECT * FROM detached_citation ORDER BY id').all() as {
    id: number; table_name: CitingTable; row_id: number;
    document_id: number; ordinal: number; heading_path: string; label: string | null;
  }[];

  // The Part, the heading and the label together name a provision independently of where it landed
  // in document order -- which matters, because the same re-parse gives a code of practice back the
  // clauses each of its Parts restarts numbering at, so every ordinal after those moves.
  const byName = db.prepare(
    'SELECT id, char_start, char_end FROM section WHERE document_id = ? AND heading_path = ? AND label IS ?',
  );
  const byOrdinal = db.prepare('SELECT id, char_start, char_end FROM section WHERE document_id = ? AND ordinal = ?');
  const discard = db.prepare(
    'INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)',
  );
  const docText = db.prepare('SELECT text FROM document_text WHERE document_id = ?');
  const forget = db.prepare('DELETE FROM detached_citation WHERE id = ?');
  const snippetOf = db.prepare('SELECT verbatim_snippet FROM export_row WHERE id = ?');
  const setOffsets = db.prepare('UPDATE export_row SET quote_char_start = ?, quote_char_end = ? WHERE id = ?');

  const out: AttachResult = { restored: 0, byPosition: 0, reoffset: 0, offsetLost: 0, retired: 0, held: 0 };

  db.transaction(() => {
    for (const h of held) {
      const named = byName.all(h.document_id, h.heading_path, h.label) as
        { id: number; char_start: number; char_end: number }[];
      let found = named.length === 1 ? named[0]! : null;
      if (!found && named.length === 0) {
        // Only where the name is gone, never where it is ambiguous: an ordinal is a position, and
        // a position means nothing once the re-parse has added sections above it.
        const at2 = byOrdinal.get(h.document_id, h.ordinal) as
          | { id: number; char_start: number; char_end: number }
          | undefined;
        if (at2) {
          found = at2;
          out.byPosition += 1;
        }
      }

      const retire = (reason: string, detail: string): void => {
        discard.run(
          're-parse',
          `${h.table_name} row ${h.row_id} :: document ${h.document_id} :: ${h.heading_path}`,
          reason, detail, at,
        );
        forget.run(h.id);
        out.retired += 1;
      };

      if (!found) {
        retire('the re-parse does not produce the provision this cited',
          `label ${h.label ?? 'none'}, was ordinal ${h.ordinal}`);
        continue;
      }

      try {
        db.prepare(`UPDATE ${h.table_name} SET section_id = ? WHERE id = ?`).run(found.id, h.row_id);
      } catch (err) {
        // Two parked rows of one cell land on one provision where the old parse had split it.
        if (out.byPosition > 0 && named.length === 0) out.byPosition -= 1;
        retire('restoring this citation would duplicate one the same cell already holds',
          err instanceof Error ? err.message : String(err));
        continue;
      }
      out.restored += 1;

      if (h.table_name === 'export_row') {
        // The offsets index into the document's own text, so taking a page header out of the middle
        // of a provision moves every one of them after it. The snippet is the evidence: find it.
        const snippet = (snippetOf.get(h.row_id) as { verbatim_snippet: string | null } | undefined)
          ?.verbatim_snippet ?? '';
        const text = (docText.get(h.document_id) as { text: string } | undefined)?.text ?? '';
        // Prefer the occurrence inside the provision the row cites; a form of words can repeat.
        const within = snippet ? text.indexOf(snippet, found.char_start) : -1;
        const where = within >= 0 && within < found.char_end ? within : snippet ? text.indexOf(snippet) : -1;
        if (where >= 0) {
          setOffsets.run(where, where + snippet.length, h.row_id);
          out.reoffset += 1;
        } else {
          // Said out loud rather than left pointing at the wrong characters. This is the case where
          // the quote itself contained the page header the re-parse has just removed.
          setOffsets.run(null, null, h.row_id);
          discard.run(
            're-parse',
            `export_row ${h.row_id} :: document ${h.document_id} :: ${h.heading_path}`,
            'the quote this row exported is not in the document as it now parses',
            snippet.slice(0, 120), at,
          );
          out.offsetLost += 1;
        }
      }
      forget.run(h.id);
    }
  }).immediate();

  out.held = heldCount(db);
  return out;
}
