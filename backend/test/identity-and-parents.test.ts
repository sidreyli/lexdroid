/**
 * Three things India's intermediary cells needed, none of them named for India.
 *
 * A passive duty's subject is the party acted on; "user" in intermediary rules is an online user;
 * and rules made under an Act do not push the Act out of a framework question.
 */
import { describe, expect, it } from 'vitest';
import { indexSections, openDb } from '../src/db/index.js';
import { actedOnInThePassive } from '../src/decide/index.js';
import { MEASURE_DOMAIN, TITLE_CARRIES_DOMAIN } from '../src/rubric/measures.js';
import { withParentActs } from '../src/cell/index.js';

describe('a subject in the passive is acted on', () => {
  it('reads "has to be registered" as done to the subscriber', () => {
    const q = 'the subscriber (all types, pre-paid as well as post-paid) has to be registered and authenticated';
    expect(actedOnInThePassive(q, 'the subscriber')).toBe(true);
    expect(actedOnInThePassive('the user shall be verified before access', 'the user')).toBe(true);
  });
  it('does not read an active duty that way', () => {
    expect(actedOnInThePassive('the licensee shall register every subscriber', 'the licensee')).toBe(false);
    expect(actedOnInThePassive('the provider must verify the user', 'the provider')).toBe(false);
  });
});

describe('an online service', () => {
  it('includes an intermediary, and lets the title carry it for online identity', () => {
    const d = MEASURE_DOMAIN['user-identity']!;
    expect(d.test('Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021')).toBe(true);
    expect(d.test('Customs Act 1901')).toBe(false);
    expect(TITLE_CARRIES_DOMAIN.has('user-identity')).toBe(true);
    expect(TITLE_CARRIES_DOMAIN.has('sim-registration')).toBe(false);
  });
});

describe('rules bring their Act into a framework question', () => {
  it('puts the parent Act ahead of its rules, with its own provisions on the subject', () => {
    const db = openDb(':memory:');
    db.prepare('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)').run('XXX', 'X', '["en"]');
    const add = (id: number, title: string, kind: string, parent: number | null = null) =>
      db.prepare(
        `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at, made_under_instrument_id, status)
         VALUES (?, 'XXX', ?, ?, ?, 'portal', '2026-09-26', ?, 'in-force')`,
      ).run(id, title, kind, `https://example.gov/${id}`, parent);
    const section = (doc: number, heading: string, text: string) => {
      db.prepare(
        `INSERT OR IGNORE INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
         VALUES (?, ?, ?, 'h', 'text/html', 1, 200, '2026-09-26')`,
      ).run(doc, doc, `https://example.gov/${doc}`);
      db.prepare(`INSERT INTO section (document_id, ordinal, heading_path, text, char_start, char_end) VALUES (?, 0, ?, ?, 0, 1)`)
        .run(doc, heading, text);
      indexSections(db, doc);
    };
    add(1, 'The Information Technology Act, 2000', 'act');
    add(2, 'Intermediary Guidelines Rules, 2021', 'rule', 1);
    add(3, 'Some Other Act, 1990', 'act');
    section(1, 'Section 79 — Exemption from liability of intermediary', 'An intermediary shall not be liable for any third party information.');
    section(2, 'Rule 3', 'An intermediary shall observe due diligence.');
    section(3, 'Section 1', 'Short title.');
    const list = [
      { instrumentId: 3, title: 'Some Other Act, 1990', url: '', sectionIds: [] },
      { instrumentId: 2, title: 'Intermediary Guidelines Rules, 2021', url: '', sectionIds: [] },
    ];
    const got = withParentActs(db, 'XXX', ['intermediary liability'], new Set([1, 2, 3]), list);
    expect(got.map((c) => c.instrumentId)).toEqual([3, 1, 2]);
    expect(got[1]!.sectionIds).toHaveLength(1);
    // Already present, or not in force: nothing added.
    expect(withParentActs(db, 'XXX', ['intermediary'], new Set([2, 3]), list).map((c) => c.instrumentId)).toEqual([3, 2]);
    // Already on the list but further down: moved up, once, keeping what it brought.
    const act = { instrumentId: 1, title: 'The Information Technology Act, 2000', url: 'u', sectionIds: [] as number[] };
    const moved = withParentActs(db, 'XXX', ['intermediary liability'], new Set([1, 2, 3]), [...list, act]);
    expect(moved.map((c) => c.instrumentId)).toEqual([3, 1, 2]);
    expect(moved[1]!.url).toBe('u');
    expect(moved[1]!.sectionIds).toHaveLength(1);
  });
});
