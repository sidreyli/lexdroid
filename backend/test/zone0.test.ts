/**
 * Zone 0 -- the economy profile, and the search over the corpus it makes possible.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { applyProfile, availableProfiles, loadProfile } from '../src/profile/index.js';
import { ftsQuery, ftsPhrase, fuse } from '../src/index/index.js';

describe('the economy profile', () => {
  it('has one for every economy in scope', () => {
    expect(availableProfiles()).toEqual(expect.arrayContaining(['AUS', 'IND', 'MYS', 'SGP']));
  });

  it('keeps India Central, bilingual and backed by a readable legislation register', () => {
    const p = loadProfile('IND');
    expect(p.name).toBe('India');
    expect(p.officialLanguages).toEqual(expect.arrayContaining(['hi', 'en']));
    expect(p.portals.some((x) => x.url === 'https://indiacode.gov.in' && x.adapter === 'indiacode')).toBe(true);
    const indiaCode = p.portals.find((x) => x.adapter === 'indiacode')!;
    expect(indiaCode.adapterConfig['jurisdiction']).toBe('CENTRAL');
  });

  it('describes the Singapore legal system, its languages and its portals', () => {
    const p = loadProfile('SGP');
    expect(p.legalSystem.family).toBe('common-law');
    expect(p.officialLanguages).toContain('en');
    expect(p.portals.length).toBeGreaterThanOrEqual(5);
    expect(p.portals.some((x) => x.kind === 'legislation-database' && x.adapter === 'sso')).toBe(true);
    expect(p.portals.some((x) => x.kind === 'gazette')).toBe(true);
  });

  it('ranks instrument types, so rank is never confused with coverage', () => {
    // The Malaysia failure in v1: Acts scored below a central-bank circular because the tool had
    // no model of either. An Act outranks a Notice, and a Notice is still evidence.
    const p = loadProfile('SGP');
    const act = p.instrumentTypes.find((t) => t.kind === 'act')!;
    const notice = p.instrumentTypes.find((t) => t.kind === 'notice')!;
    const guideline = p.instrumentTypes.find((t) => t.kind === 'guideline')!;
    expect(act.rank).toBeLessThan(notice.rank);
    expect(act.bindingness).toBe('binding');
    expect(notice.bindingness).toBe('binding-on-licensees');
    expect(guideline.bindingness).toBe('advisory');
  });

  it('writes the economy, its portals and its commitments into the store', () => {
    const db = openDb(':memory:');
    applyProfile(db, loadProfile('SGP'));
    applyProfile(db, loadProfile('SGP')); // idempotent: re-profiling is the normal case

    const economy = db.prepare('SELECT * FROM economy WHERE code = ?').get('SGP') as { name: string; official_languages: string };
    expect(economy.name).toBe('Singapore');
    expect(JSON.parse(economy.official_languages)).toContain('en');

    const portals = db.prepare('SELECT COUNT(*) c FROM portal WHERE economy_code = ?').get('SGP') as { c: number };
    expect(portals.c).toBeGreaterThanOrEqual(5);

    const commitments = db.prepare('SELECT COUNT(*) c FROM commitment WHERE economy_code = ?').get('SGP') as { c: number };
    expect(commitments.c).toBeGreaterThan(0);
    db.close();
  });

  it('writes the India profile without sharing Singapore state', () => {
    const db = openDb(':memory:');
    applyProfile(db, loadProfile('IND'));
    const economy = db.prepare('SELECT name, official_languages FROM economy WHERE code = ?').get('IND') as {
      name: string;
      official_languages: string;
    };
    expect(economy.name).toBe('India');
    expect(JSON.parse(economy.official_languages)).toEqual(['hi', 'en']);
    const portal = db.prepare('SELECT name FROM portal WHERE economy_code = ? AND url = ?')
      .get('IND', 'https://indiacode.gov.in') as { name: string };
    expect(portal.name).toBe('India Code');
    db.close();
  });
});

describe('building a query the index can actually match', () => {
  it('drops terms shorter than a trigram, which cannot match at all', () => {
    // A two-character term returns nothing and says nothing about why. Dropping it here means the
    // rest of the query still runs.
    expect(ftsQuery('to be or in')).toBeNull();
    expect(ftsQuery('data in SG')).toBe('"data"');
  });

  it('quotes every term, because legal text is full of FTS5 syntax', () => {
    // "personal data OR trade secrets" is a phrase in a rubric and an operator in FTS5.
    expect(ftsQuery('personal data OR trade secrets')).toBe('"personal" OR "data" OR "trade" OR "secrets"');
    expect(ftsPhrase('cross-border transfer')).toBe('"cross border transfer"');
  });
});

describe('fusing the two channels', () => {
  it('puts a section both channels found above one either found alone', () => {
    // Agreement between an exact-phrase match and a meaning match is the strongest signal Zone 1
    // has, and it is only visible if the ranks are fused rather than the scores compared.
    const lexical = [
      { sectionId: 1, score: 9, rank: 1, channel: 'lexical' as const, query: 'q' },
      { sectionId: 2, score: 8, rank: 2, channel: 'lexical' as const, query: 'q' },
    ];
    const dense = [
      { sectionId: 3, score: 0.9, rank: 1, channel: 'dense' as const, query: 'q' },
      { sectionId: 2, score: 0.8, rank: 2, channel: 'dense' as const, query: 'q' },
    ];
    const fused = fuse([lexical, dense]);
    expect(fused[0]!.sectionId).toBe(2);
    expect(fused[0]!.channels).toEqual(['dense', 'lexical']);
  });
});
