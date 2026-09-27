/**
 * Which tier of an economy's law the corpus holds.
 *
 * Australia's register publishes Commonwealth law and Malaysia's portals federal law, and that
 * lived only in the notes of whoever wrote the profiles. The profile now says so, with the way the
 * held tier cites the unheld one, and the audit counts those citations.
 */
import { describe, expect, it } from 'vitest';
import { loadProfile, unheldCitations } from '../src/profile/index.js';
import { EconomyProfile } from '../src/profile/types.js';

const tiers = (code: string, text: string) =>
  [...new Set(unheldCitations(loadProfile(code).jurisdictionScope, text).map((c) => c.tier))];

describe('the jurisdiction scope a profile declares', () => {
  it('is declared for every economy this pipeline owns', () => {
    expect(loadProfile('AUS').jurisdictionScope?.held).toBe('Commonwealth');
    expect(loadProfile('MYS').jurisdictionScope?.held).toBe('federal');
    expect(loadProfile('SGP').jurisdictionScope?.notHeld).toEqual([]);
  });

  it('recognises a State Act cited by a Commonwealth instrument', () => {
    expect(tiers('AUS', 'within the meaning of the Independent Commission Against Corruption Act 1988 (NSW)'))
      .toEqual(['State and Territory law']);
  });

  it('does not take a Commonwealth Act for a State one', () => {
    expect(tiers('AUS', 'an interference with privacy under the Privacy Act 1988 (Cth)')).toEqual([]);
    expect(tiers('AUS', 'section 6 of the Privacy Act 1988')).toEqual([]);
  });

  it("recognises the two Borneo States' Ordinances and the Peninsular States' Enactments", () => {
    expect(tiers('MYS', 'in Sabah, the Sabah Labour Ordinance [Cap. 67]')).toEqual(['Sabah and Sarawak Ordinances']);
    expect(tiers('MYS', 'the Sarawak Labour Ordinance [Cap. 76]')).toEqual(['Sabah and Sarawak Ordinances']);
    expect(tiers('MYS', 'the Administration of Muslim Law Enactment 1952 of the State')).toEqual(['State Enactments']);
    expect(tiers('MYS', 'the Kedah Enactment relating to land')).toEqual(['State Enactments']);
  });

  it('does not count a sentence that only names the kinds of law', () => {
    expect(tiers('MYS', 'any Act of Parliament, Ordinance or Enactment')).toEqual([]);
    expect(tiers('MYS', 'the Employment Act 1955 does not apply in Sabah')).toEqual([]);
  });

  it('refuses a pattern that does not compile, rather than failing when the audit runs', () => {
    const p = { ...loadProfile('SGP'), jurisdictionScope: { held: 'national', note: '', notHeld: [{ tier: 'x', note: '', citedAs: ['(unclosed'] }] } };
    expect(EconomyProfile.safeParse(p).success).toBe(false);
  });

  it('reads an undeclared scope as nothing cited, not as an error', () => {
    expect(unheldCitations(null, 'the Sabah Labour Ordinance')).toEqual([]);
  });
});
