/**
 * A licence to sell online is a licence to sell, not a licence held by someone who is online.
 *
 * 12.3 asks whether an e-commerce provider needs a licence. Its subject domain was the pillar's
 * "online", and that word is satisfied by every modern regulated activity: Malaysia's cell was
 * decided by a licence for "network facilities or network service or applications service" and
 * Singapore's by one for "providing any type of digital token service". Both are licences a
 * business trading online may well need. Neither is a licence to trade, which is what the
 * indicator's own exception says -- licences for other aspects of the business "are not captured".
 *
 * So the measure declares a narrower subject than its indicator: the words have to name the
 * commerce as well as the channel. The cases below are the two halves of that sentence, not a list
 * of instruments: a subject that is trade but not online fails, a subject that is online but not
 * trade fails, and only both together pass.
 */
import { describe, expect, it } from 'vitest';
import { MEASURE_DOMAIN, SUBJECT_DOMAIN } from '../src/rubric/measures.js';

const domain = MEASURE_DOMAIN['ecommerce-licence']!;

describe('the subject a licence to sell online must name', () => {
  it('is declared by the measure, not inherited from the pillar', () => {
    expect(domain).toBeDefined();
    expect(domain.source).not.toBe(SUBJECT_DOMAIN['12.3']!.source);
  });

  it('turns away a licence for the machinery the trade runs over', () => {
    for (const subject of [
      'network facilities or network service or applications service',
      'licensed applications service providers and licensed network service providers',
      'network services',
    ]) {
      expect(domain.test(subject)).toBe(false);
    }
  });

  it('turns away a licence for another activity that happens to be online', () => {
    for (const subject of [
      'providing any type of digital token service',
      'regulated online communication service',
      'online safety',
      'cyber security service',
      'online content',
    ]) {
      expect(domain.test(subject)).toBe(false);
    }
  });

  it('keeps a subject that names the trade and the channel together', () => {
    for (const subject of [
      'online marketplace',
      'supply of goods or services through a website or in an online marketplace',
      'e-commerce service',
      'electronic marketplace',
      'commercial transactions through the use of electronic means',
      'retail website',
    ]) {
      expect(domain.test(subject)).toBe(true);
    }
  });

  it('needs both halves: trade offline, or online without trade, is neither', () => {
    expect(domain.test('the sale of liquor on licensed premises')).toBe(false);
    expect(domain.test('an auctioneer selling at a public auction')).toBe(false);
    expect(domain.test('an online location')).toBe(false);
  });

  it('is asked of this measure only, so no other indicator moves', () => {
    const others = Object.keys(MEASURE_DOMAIN).filter((k) => k !== 'ecommerce-licence');
    expect(others).not.toContain('ecommerce-licence');
    expect(SUBJECT_DOMAIN['12.3']!.source).toContain('online');
  });
});
