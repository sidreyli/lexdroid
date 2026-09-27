/**
 * A document filed as guidance that says in its own words that it binds, and one that says it
 * does not, and one that only names the power to give guidance.
 */
import { describe, expect, it } from 'vitest';
import { statesItsForce } from '../src/parse/identity.js';
import { moneyIn } from '../src/decide/currency.js';

const doc = (...texts: string[]) => texts.map((text) => ({ text }));

describe('a guidance document that states its own force', () => {
  it('binds where it marks its standards as obligations that must be complied with', () => {
    expect(statesItsForce(doc(
      '3.2 The guidance in this policy document is issued pursuant to section 266 of the FSA.',
      '5.2 For purposes of this policy document – "S" denotes a standard, an obligation, a requirement, specification, direction, condition and any interpretative, supplemental and transitional provisions that must be complied with. Non-compliance may result in enforcement action;',
    ))).toBe(true);
  });

  it('binds where the licence it is made under requires licensees to comply with it', () => {
    expect(statesItsForce(doc(
      '1.2.2 condition 10.2 requires that licensee shall comply with any guidelines issued by the Commission from time to time on matters relating to the registration of end-users.',
    ))).toBe(true);
  });

  it('does not bind for naming only the power to give guidance', () => {
    expect(statesItsForce(doc('These Guidelines are issued pursuant to section 321 of the Securities and Futures Act.'))).toBe(false);
    expect(statesItsForce(doc('3.2 The guidance in this policy document is issued pursuant to section 266 of the FSA.'))).toBe(false);
  });

  it('takes a document that says it does not bind at its word', () => {
    expect(statesItsForce(doc(
      'These guidelines are not legally binding.',
      'Non-compliance may result in enforcement action.',
    ))).toBe(false);
  });
});

describe('a figure however its thousands are grouped', () => {
  it('reads a space-grouped figure as the whole figure', () => {
    expect(moneyIn('For subparagraph 68(1)(f)(iii) of the Act, the amount is $1 000.', 'AUS')).toEqual({ amount: 1000, currency: 'AUD', assumedCurrency: true });
    expect(moneyIn('a value not exceeding $1 000 000', 'AUS')?.amount).toBe(1000000);
  });

  it('reads an Indian lakh-grouped figure as the whole figure', () => {
    expect(moneyIn('goods valued at ₹1,00,000', 'IND')).toEqual({ amount: 100000, currency: 'INR', assumedCurrency: false });
  });

  it('does not join two figures a space separates', () => {
    expect(moneyIn('items 5 and $300', 'AUS')?.amount).toBe(300);
  });
});
