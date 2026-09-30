/**
 * Telling an instrument from a headline on a regulator's own website.
 *
 * The defect: 24 of 30 declared sources had never produced an instrument, and the missing
 * documents are the ones pillars 7, 8, 9, 11 and 12 turn on. Reading those sites means
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

/**
 * What a source says it calls the instruments it publishes.
 *
 * "Policy" is not on the shared list, and taking it off was right: it cost three real citations
 * to gain "monetary policy", "skills framework" and "platform list". But a domain registry's
 * binding rules are called policies in all three economies -- the .my registry publishes a
 * Registrant Policy, the .sg one an Acceptable Use Policy and Rules of Registration -- and a
 * treasury's are called Instructions. The word cannot tell those from the privacy policy on the
 * same site, because in the word there is no difference.
 *
 * So the source says, and the saying is scoped to that source. Before this, Singapore had no
 * domain-registry source at all and Malaysia's held only its dispute-resolution rules; three of
 * the corpus gaps behind an unanswerable cell were one missing noun.
 */
describe('the nouns a source declares for its own instruments', () => {
  const REGISTRY = ['policy', 'agreement', 'rule'];

  it('admits what that source calls its instruments', () => {
    expect(instrumentTitle('MYNIC Registrant Policy', REGISTRY)?.kind).toBe('guideline');
    expect(instrumentTitle('Acceptable Use Policy for Registrant', REGISTRY)?.kind).toBe('guideline');
    expect(instrumentTitle('Domain Name Registration Agreement', REGISTRY)?.kind).toBe('guideline');
    expect(instrumentTitle('Treasury Instructions', ['instruction'])?.kind).toBe('guideline');
  });

  it('reaches no source that did not declare it', () => {
    expect(instrumentTitle('MYNIC Registrant Policy')).toBeNull();
    expect(instrumentTitle('Treasury Instructions')).toBeNull();
    // The three the shared list was narrowed to keep out, still out wherever nothing is said.
    expect(instrumentTitle('Malaysia monetary policy')).toBeNull();
    expect(instrumentTitle('Digital skills framework')).toBeNull();
    expect(instrumentTitle('Approved platform list')).toBeNull();
    // A declaration is not narrowed further, and the cost is real: the registry that says its
    // instruments are policies will register any policy on its own site. That is the trade -- it
    // is one site, chosen and written down, rather than every site in the register.
    expect(instrumentTitle('Malaysia monetary policy', REGISTRY)).not.toBeNull();
  });

  it('does not let a source register its own housekeeping under the noun it declared', () => {
    expect(instrumentTitle('Privacy Policy', REGISTRY)).toBeNull();
    expect(instrumentTitle('Privacy policy | ACMA', REGISTRY)).toBeNull();
    expect(instrumentTitle('Cookie Policy', REGISTRY)).toBeNull();
  });

  it('ignores a declaration that is not a word, because a profile typo is not a pattern', () => {
    expect(instrumentTitle('MYNIC Registrant Policy', ['.*'])).toBeNull();
    expect(instrumentTitle('MYNIC Registrant Policy', ['', 'a', 'policy'])?.kind).toBe('guideline');
  });
});

describe('a link that tells you to follow it', () => {
  it('names nothing, however solid the noun it ends on', () => {
    for (const t of [
      'Click to view the Financial Services Act 2013 and Islamic Financial Services Act 2013',
      'Download Guidelines for Dispute Resolution',
      'here for the guide',
      'View the Personal Data Protection Regulations',
      'This Code of Practice',
    ]) {
      expect(instrumentTitle(t), t).toBeNull();
    }
  });

  it('leaves a title that merely starts with the same letters, or the same word', () => {
    expect(instrumentTitle('Goods and Services Tax Act 2014')).not.toBeNull();
    // "Open" and "go" open a real name as often as an instruction, so neither is in the list.
    expect(instrumentTitle('Open Electricity Market Code of Practice')).not.toBeNull();
  });
});
