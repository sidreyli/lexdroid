/**
 * The same document registered twice is one instrument, not two measures.
 *
 * Malaysia's statute book and its regulators both publish the same gazette PDF, and one portal
 * serves the same file from two paths, so 28 documents sit under two and three instrument ids
 * each. `otherLanguageCopies` keys on instrument and label, so two copies under two instrument
 * ids are two different keys and never pair. The cost is not wasted reading -- several bands turn
 * on how many measures an economy has, and a cell handed one provision twice can make two of it.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { duplicateRegistrations } from '../src/retrieve/index.js';

function corpus(): { db: ReturnType<typeof openDb>; add: (title: string, num: string | null, status: string, hash: string) => number } {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\",\"en\"]')").run();
  let seq = 0;
  const add = (title: string, num: string | null, status: string, hash: string): number => {
    seq += 1;
    const instrumentId = Number(
      db
        .prepare(
          `INSERT INTO instrument (economy_code, title, official_number, kind, status, source_url, discovered_via, discovered_at)
             VALUES ('MYS', ?, ?, 'regulation', ?, ?, 'test', '2026-09-07')`,
        )
        .run(title, num, status, `https://x/${seq}`).lastInsertRowid,
    );
    const documentId = Number(
      db
        .prepare(
          `INSERT INTO document (instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at, extraction, section_count)
             VALUES (?, ?, ?, 'application/pdf', 10, 200, '2026-09-07', 'pdf-text', 1)`,
        )
        .run(instrumentId, `https://x/${seq}.pdf`, hash).lastInsertRowid,
    );
    db.prepare(
      `INSERT INTO section (document_id, ordinal, label, heading_path, text, char_start, char_end)
         VALUES (?, 0, '1', 'Part I', 'A licensee shall pay the prescribed fee.', 0, 40)`,
    ).run(documentId);
    return Number(db.prepare('SELECT id FROM section WHERE document_id = ?').get(documentId)!['id' as never]);
  };
  return { db, add };
}

describe('a second registration of the same bytes', () => {
  it('keeps the copy whose source stated an identifier, and retires the one that stated nothing', () => {
    const { db, add } = corpus();
    const fromStatuteBook = add('ONLINE SAFETY (FEES) REGULATIONS 2025', 'P.U. (A) 466/2025', 'in-force', 'same');
    const fromRegulator = add('Online Safety (Fees) Regulations 2025', null, 'unknown', 'same');
    const retired = duplicateRegistrations(db, 'MYS');
    expect(retired.has(fromRegulator)).toBe(true);
    expect(retired.has(fromStatuteBook)).toBe(false);
  });

  it('retires every copy but one where three hold the same bytes', () => {
    const { db, add } = corpus();
    const kept = add('ONLINE SAFETY (APPEAL TRIBUNAL) REGULATIONS 2025', 'P.U. (A) 478/2025', 'in-force', 'same');
    const a = add('Online Safety (Appeal Tribunal) Regulations 2025', null, 'unknown', 'same');
    const b = add('Online Safety (Appeal Tribunal) Regulations 2025', null, 'unknown', 'same');
    const retired = duplicateRegistrations(db, 'MYS');
    expect([...retired].sort()).toEqual([a, b].sort());
    expect(retired.has(kept)).toBe(false);
  });

  it('keeps the first where neither copy states anything', () => {
    const { db, add } = corpus();
    const first = add('Appointment of Commissioner', null, 'unknown', 'same');
    const second = add('Pelantikan Pesuruhjaya', null, 'unknown', 'same');
    const retired = duplicateRegistrations(db, 'MYS');
    expect(retired.has(second)).toBe(true);
    expect(retired.has(first)).toBe(false);
  });

  it('retires nothing where the bytes differ', () => {
    const { db, add } = corpus();
    add('ONLINE SAFETY (FEES) REGULATIONS 2025', 'P.U. (A) 466/2025', 'in-force', 'one');
    add('ONLINE SAFETY (PERIOD) REGULATIONS 2025', 'P.U. (A) 465/2025', 'in-force', 'other');
    expect(duplicateRegistrations(db, 'MYS').size).toBe(0);
  });
});
