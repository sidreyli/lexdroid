/**
 * Telling an instrument from a headline on a regulator's own website.
 *
 * The defect: 24 of 30 declared sources had never produced an instrument, and the missing
 * documents are the ones ESCAP cites for pillars 7, 8, 9, 11 and 12. Reading those sites means
 * separating a code of practice from a press release, and the words do not do it -- "Act now,
 * defend against vicious cybercriminals" carries the noun and is not an Act.
 */
import { describe, expect, it } from 'vitest';
import { instrumentTitle, kindOf } from '../src/discover/titles.js';

describe('a link that names an instrument', () => {
  it('accepts a title whose noun sits where the drafting puts it', () => {
    expect(instrumentTitle('Customs Act 1901')?.kind).toBe('act');
    expect(instrumentTitle('Payment Services Regulations 2019')?.kind).toBe('regulation');
    expect(instrumentTitle('Advisory Guidelines on Data Protection')?.kind).toBe('guideline');
    // The gazette number and the year are part of the citation, not the end of the name.
    expect(instrumentTitle('Companies Act (Act 777) 2016')?.kind).toBe('act');
    expect(instrumentTitle('Official Secrets Act No.88 1972')?.kind).toBe('act');
  });

  it('rejects a headline that happens to carry the same nouns', () => {
    // Both were registered as instruments before this test existed.
    expect(instrumentTitle('Act now defend against vicious cybercriminals')).toBeNull();
    expect(instrumentTitle('remote code execution vulnerability found log4j2 library')).toBeNull();
    expect(instrumentTitle('PM launches Singapore cybersecurity strategy')).toBeNull();
    expect(instrumentTitle('CSA publishes recommended standard for mobile applications')).toBeNull();
  });

  it('rejects a page about an instrument, which is not the instrument', () => {
    expect(instrumentTitle('Understanding Competition Act')).toBeNull();
    expect(instrumentTitle('Enforcement of the Act')).toBeNull();
    expect(instrumentTitle('Amendments to Regulations under the Personal Data Protection Act')).toBeNull();
    // And the site's own housekeeping, which every regulator publishes and none of it binds.
    expect(instrumentTitle('macOS setup guide')).toBeNull();
    expect(instrumentTitle('Scheduled system maintenance service interruption notice')).toBeNull();
  });

  it('reads the kind from the most binding word in the name', () => {
    // An Act and the Regulations made under it are not interchangeable candidates, and the
    // shortlist holds half its list for Acts on the strength of this.
    expect(kindOf('Personal Data Protection (Amendment) Regulations 2021')).toBe('regulation');
    expect(kindOf('MAS Notice 626')).toBe('notice');
    expect(kindOf('Cybersecurity Code of Practice')).toBe('guideline');
  });
});
