/**
 * The two ways a statute writes the same threshold.
 *
 * Australia's de minimis is AUD 1,000 and the run of 20 September 2026 answered "no de minimis
 * found" for it. The provision is in the corpus: section 68 of the Customs Act 1901 excuses from
 * entry for home consumption a consignment "of a value not exceeding $1,000 or such other amount
 * as is prescribed". It was never put in front of the reader -- 160th of 308 on the six questions
 * the cell asked, against a depth of 48 -- and not one Australian finding for the indicator was
 * ever rejected, because none was ever made.
 *
 * The measure asked for a relief: goods under the figure are exempt from duty. That is how
 * Singapore and Malaysia draft it and the question finds them. Australia drafts the clearance
 * instead -- goods under the figure need not be entered or declared, and so nothing is assessed
 * on them -- and the two conventions share no word. The gloss has named informal clearance from
 * the start; nothing asked for it.
 *
 * With the clearance question asked, section 68 is 7th of the depth.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES } from '../src/rubric/measures.js';
import { queriesFor } from '../src/retrieve/index.js';
import type { Indicator } from '../src/rubric/types.js';

const deMinimis = MEASURES['12.5']!.find((m) => m.token === 'de-minimis-threshold')!;

const indicator: Indicator = {
  id: '12.5',
  pillarId: 12,
  pillarName: 'Online Sales and Transactions',
  category: 'Low De Minimis',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'No De Minimis', ordinal: 1 },
    { score: 0.5, criterion: 'De Minimis below < 200 USD', ordinal: 2 },
    { score: 0, criterion: 'De Minimis ≥ 200 USD', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

describe('the de minimis measure', () => {
  it('asks for the relief and for the clearance, which are the same threshold', () => {
    const asked = [deMinimis.gloss, ...(deMinimis.alsoAsked ?? [])].join(' ').toLowerCase();
    expect(asked).toMatch(/exempt/);
    expect(asked).toMatch(/entry for home consumption|import declaration/);
  });

  it('names no economy and no instrument in either', () => {
    // A question fitted to one statute book finds one statute book. Measured before it was kept:
    // a phrasing built round Australia's word "consignment" put its section 68 fifth and pushed
    // Singapore's Imports Relief Order out for the Hire-Purchase Act, so it was not kept.
    for (const q of [deMinimis.gloss, ...(deMinimis.alsoAsked ?? [])]) {
      expect(q).not.toMatch(/Australia|Singapore|Malaysia|Customs Act|Goods and Services Tax/i);
    }
  });

  it('carries both into the questions the cell asks', () => {
    const qs = queriesFor(indicator);
    expect(qs.filter((q) => /stated amount/.test(q))).toHaveLength(2);
  });

  it('still asks the thing itself, not only the two shapes of it', () => {
    expect(queriesFor(indicator)).toContain(deMinimis.gloss.replace(/\s+/g, ' ').trim());
  });
});
