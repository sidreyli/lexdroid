import { describe, expect, it } from 'vitest';
import { rejectionFor } from '../src/read/index.js';
import { MEASURES } from '../src/rubric/measures.js';

const MEASURE = MEASURES['12.3']!.find((m) => m.token === 'ecommerce-licence')!;

const SECTION =
  'No person shall carry on the business of selling goods by electronic means unless that person '
  + 'holds a licence granted by the Authority under this section.';

function finding(definingWords: string) {
  return {
    indicatorId: '12.3', measure: 'ecommerce-licence',
    quote: 'No person shall carry on the business of selling goods by electronic means unless that person holds a licence',
    dutyBearer: 'No person', dutyAct: 'shall carry on', definingWords,
  } as never;
}

const ALLOWED = new Set(['12.3']);

describe('the description of a measure is not an answer about the provision', () => {
  it('names the echo rather than reporting a missing quote', () => {
    const why = rejectionFor(finding(MEASURE.gloss), SECTION, ALLOWED);
    expect(why).toContain("description of it, not the provision's own words");
  });

  it('names it when the description comes back with a word dropped', () => {
    const why = rejectionFor(finding(MEASURE.gloss.replace(/^a /, '')), SECTION, ALLOWED);
    expect(why).toContain("description of it, not the provision's own words");
  });

  it('names it for the line that says what to look for, too', () => {
    const why = rejectionFor(finding(MEASURE.defines), SECTION, ALLOWED);
    expect(why).toContain("description of it, not the provision's own words");
  });

  it('accepts the wording the provision itself uses', () => {
    expect(rejectionFor(finding('holds a licence granted by the Authority'), SECTION, ALLOWED)).toBe(null);
  });

  it('still reports a quote that is simply not there as one that is not there', () => {
    const why = rejectionFor(finding('holds a permit issued by the Minister'), SECTION, ALLOWED);
    expect(why).toContain('are not in the provision');
  });
});
