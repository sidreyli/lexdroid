/**
 * Two things India's payment and procurement cells needed, neither of them named for India.
 *
 * A permission or eligibility confined by "only" shuts everyone else out, so it is a requirement
 * and not a declaration; and a payment regulation's title carries the payment domain for the
 * provisions inside it, which say "the funds" and "the transaction" and never "payment" again.
 */
import { describe, expect, it } from 'vitest';
import { confinesPermission } from '../src/decide/index.js';
import { SUBJECT_DOMAIN, TITLE_CARRIES_DOMAIN } from '../src/rubric/measures.js';

describe('a permission confined by "only"', () => {
  it('is read as shutting out everyone outside it', () => {
    const q = (quote: string, dutyAct = '') => confinesPermission({ quote, dutyAct });
    expect(q("only 'Class-I local supplier', as defined under the Order, shall be eligible to bid")).toBe(true);
    expect(q('Settlement in non-INR currencies shall be permitted only for those merchants which have been directly onboarded')).toBe(true);
    expect(q('A licensee may only accept deposits from its members')).toBe(true);
  });

  it('is not every sentence that says "only" or "permitted"', () => {
    const q = (quote: string) => confinesPermission({ quote, dutyAct: '' });
    expect(q('This Part applies only to companies incorporated after the commencement date')).toBe(false);
    expect(q('A person is permitted to import the goods on payment of duty')).toBe(false);
    expect(q('Every bidder shall be eligible to bid.')).toBe(false);
  });
});

describe('a payment regulation names its domain in its title', () => {
  it('knows an aggregator is a payment intermediary', () => {
    const d = SUBJECT_DOMAIN['12.4.1']!;
    expect(d.test('Master Direction on Regulation of Payment Aggregator (PA), 2025')).toBe(true);
    expect(d.test('funds collected on behalf of its merchants')).toBe(false);
  });

  it('lets the title carry it for every online-payment measure, and not for a sector-neutral one', () => {
    for (const m of ['local-bank-account', 'payment-currency', 'payment-ceiling', 'other-payment-restriction']) {
      expect(TITLE_CARRIES_DOMAIN.has(m)).toBe(true);
    }
    expect(TITLE_CARRIES_DOMAIN.has('foreign-exclusion')).toBe(false);
  });
});
