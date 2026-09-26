/**
 * The rules a question needs, reached through the provision of the Act that answers it.
 *
 * The defect this exists for: India's user-identity cell needs the intermediary rules made under
 * the information technology Act. Their title says "guidelines" and "ethics code", and ranked on
 * the question's words they fell below rules on partnerships and waste. The Act's s.79 exempts an
 * intermediary, and "intermediary" is in the rules' title.
 */
import { describe, expect, it } from 'vitest';
import { indexSections, openDb } from '../src/db/index.js';
import { followDown, versionKey } from '../src/discover/follow.js';

function fixture() {
  const db = openDb(':memory:');
  db.prepare('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)').run('XXX', 'X', '["en"]');
  const add = (id: number, title: string, kind: string, parent: number | null = null) =>
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at, made_under_instrument_id)
       VALUES (?, 'XXX', ?, ?, ?, 'portal', '2026-09-26', ?)`,
    ).run(id, title, kind, `https://example.gov/${id}`, parent);
  const sections = (id: number, secs: [string, string][]) => {
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (?, ?, ?, 'h', 'text/html', 1, 200, '2026-09-26')`,
    ).run(id, id, `https://example.gov/${id}`);
    secs.forEach(([heading, text], i) =>
      db.prepare(
        `INSERT INTO section (document_id, ordinal, heading_path, text, char_start, char_end) VALUES (?, ?, ?, ?, 0, 1)`,
      ).run(id, i, heading, text),
    );
    indexSections(db, id);
  };
  add(1, 'The Information Technology Act, 2000', 'act');
  sections(1, [
    ['Chapter XII > Section 79 — Exemption from liability of intermediary in certain cases.', 'An intermediary shall not be liable for third party information if it observes due diligence.'],
    ['Chapter I > Section 2 — Definitions.', 'In this Act, computer resource means a computer.'],
  ]);
  add(10, 'Information Technology (Security Practices) Rules, 2011', 'rule', 1);
  add(11, 'Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.', 'rule', 1);
  add(12, 'Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021 updated as on 6.4.2023', 'rule', 1);
  add(13, 'Appointment of officers under the Information Technology (Intermediary Guidelines) Rules, 2021', 'notice', 1);
  add(14, 'Information Technology (Certifying Authorities) Rules, 2000', 'rule', 1);
  return db;
}

const asked = [['whether an intermediary must identify its users before they use an online service']];

describe('following down from what was read', () => {
  it('reaches the rules through the provision that answers the question, latest version first', async () => {
    const got = await followDown(fixture(), { economy: 'XXX', asked });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ instrumentId: 12, parentId: 1, alternates: [11] });
    expect(got[0]!.because[0]).toBe('Exemption from liability of intermediary in certain cases.');
  });

  it('treats a version already read as the answer, and never offers a notice', async () => {
    expect(await followDown(fixture(), { economy: 'XXX', asked, exclude: [11] })).toEqual([]);
  });

  it('keys versions of one instrument together up to the year', () => {
    expect(versionKey('Intermediary Guidelines Rules, 2021 updated as on 6.4.2023')).toBe(versionKey('The Intermediary Guidelines Rules, 2021.'));
    expect(versionKey('Intermediary Guidelines Amendment Rules, 2022')).not.toBe(versionKey('Intermediary Guidelines Rules, 2021'));
  });
});
