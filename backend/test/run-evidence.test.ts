/**
 * A run that no longer holds the readings it was decided on.
 *
 * The defect: Malaysia's banked run graded 40/61 -> 30/61 with eleven cells broken, and the number
 * was written into two documents as a measurement of the rules. It was a measurement of a re-parse.
 * `reading` cascades with the sections a re-parse rebuilds, `answer_basis` is detached and
 * re-attached because a citation is a record rather than a derived value, and `recordedDecider`
 * rebuilds from the run's own readings -- so the cells came back empty however the rules were
 * written. 3,356 of 19,785 readings were left, and 56 of the 69 provisions its answers cite carried
 * none.
 *
 * What makes the citation the signal, and not the reading count: a basis row exists only because a
 * reading of that provision was made by this run and counted towards its band. The counts alone
 * cannot say it, because a reading is written only for what the reader could use -- a run that has
 * lost nothing is still short by its own discards.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { evidenceIsLost, evidenceLines, pillarsMissingEvidence, runEvidence } from '../src/run/evidence.js';

function store() {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS', 'Malaysia', '[\"en\"]')").run();
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status)
     VALUES ('r1', '2026-09-19T17:00:00Z', '["MYS"]', '[6]', 'engine-a', 'm', 'fetch',
             'abc1234', '2026-09-01T00:00:00Z', 'complete')`,
  ).run();
  db.prepare(
    `INSERT INTO instrument (id, economy_code, title, kind, status, source_url, discovered_via,
                             discovered_at)
     VALUES (1, 'MYS', 'An Act', 'act', 'in-force', 'https://example.test/act', 'seed',
             '2026-09-19T00:00:00Z')`,
  ).run();
  db.prepare(
    `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status,
                           fetched_at)
     VALUES (1, 1, 'https://example.test/act', 'h', 'text/html', 10, 200, '2026-09-19T00:00:00Z')`,
  ).run();
  for (const id of [10, 11]) {
    db.prepare(
      `INSERT INTO section (id, document_id, ordinal, heading_path, label, text, char_start, char_end)
       VALUES (?, 1, ?, 'Part I', 's', 'the words', 0, 9)`,
    ).run(id, id);
  }
  const cell = (id: number, indicator: string, read: number) =>
    db
      .prepare(
        `INSERT INTO cell (id, run_id, economy_code, indicator_id, state, sections_read)
         VALUES (?, 'r1', 'MYS', ?, 'restricted', ?)`,
      )
      .run(id, indicator, read);
  const reading = (cellId: number, sectionId: number) =>
    db
      .prepare(
        `INSERT INTO reading (cell_id, section_id, engine, model, applies, read_at)
         VALUES (?, ?, 'engine-a', 'm', 1, '2026-09-19T18:00:00Z')`,
      )
      .run(cellId, sectionId);
  const cites = (cellId: number, sectionId: number) =>
    db
      .prepare(
        `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure, quote)
         VALUES (?, 1, 1, ?, 'local-storage', 'the words')`,
      )
      .run(cellId, sectionId);

  cell(100, '6.2', 40);
  cell(101, '7.3', 40);
  reading(100, 10);
  reading(101, 11);
  cites(100, 10);
  cites(101, 11);
  return { db, loseReadingOf: (cellId: number) => db.prepare('DELETE FROM reading WHERE cell_id = ?').run(cellId) };
}

describe('what a finished run has left', () => {
  it('says nothing is lost while every cited provision still carries its reading', () => {
    const { db } = store();
    const [mys] = runEvidence(db, 'r1');
    if (!mys) throw new Error('no evidence recorded for MYS');
    expect(mys).toMatchObject({ economy: 'MYS', cells: 2, read: 80, readings: 2, cited: 2, lost: 0 });
    expect(evidenceIsLost(runEvidence(db, 'r1'))).toBe(false);
    expect(evidenceLines(runEvidence(db, 'r1'))).toEqual([]);
    expect(pillarsMissingEvidence(db, 'r1').size).toBe(0);
  });

  it('counts a citation whose reading a re-parse took away', () => {
    const { db, loseReadingOf } = store();
    loseReadingOf(100);
    const [mys] = runEvidence(db, 'r1');
    if (!mys) throw new Error('no evidence recorded for MYS');
    expect(mys.cited).toBe(2);
    expect(mys.lost).toBe(1);
    expect(mys.readings).toBe(1);
    expect(evidenceIsLost(runEvidence(db, 'r1'))).toBe(true);
  });

  it('names the pillar that lost it, because the rest of the economy is still answerable', () => {
    const { db, loseReadingOf } = store();
    loseReadingOf(100);
    const lost = pillarsMissingEvidence(db, 'r1');
    expect(lost.has('MYS 6')).toBe(true);
    expect(lost.has('MYS 7')).toBe(false);
  });

  it('convicts the pillar on one citation, because the whole pillar was read over one union', () => {
    // One call reads one provision against a whole pillar, so a cascaded section takes a reading
    // from every cell of that pillar at once -- and across both banked runs every cell of every
    // (economy, pillar) does record the same sections_read and hold the same number of readings.
    // The cell this is for is the one that cites nothing: an answer of "the governing instrument
    // imposes no requirement" has no citation to orphan, and emptying its readings is exactly what
    // makes it say so. Malaysia's 4.6 broke that way and no per-cell test can see it.
    const { db, loseReadingOf } = store();
    db.prepare(
      `INSERT INTO cell (id, run_id, economy_code, indicator_id, state, sections_read)
       VALUES (102, 'r1', 'MYS', '6.4', 'no-restriction', 40)`,
    ).run();
    db.prepare(
      `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure, quote)
       VALUES (102, 1, 1, NULL, NULL, NULL)`,
    ).run();
    loseReadingOf(100);
    expect(pillarsMissingEvidence(db, 'r1').has('MYS 6')).toBe(true);
  });

  it('says so in a line a script can print above its own numbers', () => {
    const { db, loseReadingOf } = store();
    loseReadingOf(100);
    const [line] = evidenceLines(runEvidence(db, 'r1'));
    if (!line) throw new Error('no line printed');
    expect(line).toContain('MYS');
    expect(line).toContain('1 of 2 cited provision(s)');
    expect(line).toContain('not the rules');
  });

  it('does not call the ordinary discard a loss', () => {
    // A reading is written only for what the reader could use, so every run stores fewer readings
    // than the provisions it was handed. Australia and Singapore kept 19,990 of 20,906 and lost
    // nothing; reading the shortfall as a loss would have condemned a run that is intact.
    const { db } = store();
    const [mys] = runEvidence(db, 'r1');
    if (!mys) throw new Error('no evidence recorded for MYS');
    expect(mys.readings).toBeLessThan(mys.read);
    expect(mys.lost).toBe(0);
  });

  it('holds a framework citation, which names an instrument and no provision, against nobody', () => {
    const { db } = store();
    db.prepare(
      `INSERT INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure, quote)
       VALUES (100, 2, 1, NULL, NULL, NULL)`,
    ).run();
    const [mys] = runEvidence(db, 'r1');
    if (!mys) throw new Error('no evidence recorded for MYS');
    expect(mys.cited).toBe(2);
    expect(mys.lost).toBe(0);
  });
});
