/**
 * The catalogue's description of a measure, handed back instead of the provision's words.
 *
 * Rejecting the whole finding for it was throwing away the quote as well, and the quote is the
 * claim. Malaysia's `director-nationality` cell was decided that way: section 196 of the Companies
 * Act 2016 came back quoting "shall ordinarily reside in Malaysia by having a principal place of
 * residence in Malaysia" -- verbatim, from the right provision, under the right measure -- and the
 * finding was discarded because a second field repeated our own description of a residency
 * requirement back at us. The reader was asked twice for one span and failed the second ask.
 *
 * So the rule is now about what the provision shows, not about which field showed it: where the
 * quote carries the word the measure is named by, the quote becomes the defining words. Where it
 * does not, or the measure has no word of its own, nothing has been shown and the echo is still a
 * rejection -- 23 of this run's 105 echoes are recovered and the other 82 stand.
 */
import { describe, expect, it } from 'vitest';
import { rejectionFor } from '../src/read/index.js';
import { MEASURES } from '../src/rubric/measures.js';

const MEASURE = MEASURES['12.3']!.find((m) => m.token === 'ecommerce-licence')!;

const SECTION =
  'No person shall carry on the business of selling goods by electronic means unless that person '
  + 'holds a licence granted by the Authority under this section.';

/** A provision that imposes a duty and never says the word the measure is named by. */
const WORDLESS_SECTION =
  'No person shall carry on the business of selling goods by electronic means unless that person '
  + 'is entered in the roll kept by the Authority under this section.';

function finding(definingWords: string, over = SECTION) {
  const quote = over === SECTION
    ? 'No person shall carry on the business of selling goods by electronic means unless that person holds a licence'
    : 'No person shall carry on the business of selling goods by electronic means unless that person is entered in the roll';
  return {
    indicatorId: '12.3', measure: 'ecommerce-licence',
    quote, dutyBearer: 'No person', dutyAct: 'shall carry on', definingWords,
  } as never;
}

const ALLOWED = new Set(['12.3']);

describe('the description of a measure is not an answer about the provision', () => {
  it('lets the quote stand in for the description, where the quote says the word', () => {
    const f = finding(MEASURE.gloss);
    expect(rejectionFor(f, SECTION, ALLOWED)).toBe(null);
    // And it is the provision's words the rest of the pipeline now tests, not ours.
    expect((f as unknown as { definingWords: string }).definingWords).toBe(
      'No person shall carry on the business of selling goods by electronic means unless that person holds a licence',
    );
  });

  it('does the same for the description with a word dropped, and for the line saying what to look for', () => {
    expect(rejectionFor(finding(MEASURE.gloss.replace(/^a /, '')), SECTION, ALLOWED)).toBe(null);
    expect(rejectionFor(finding(MEASURE.defines), SECTION, ALLOWED)).toBe(null);
  });

  it('still names the echo where the quote never says the word either', () => {
    const why = rejectionFor(finding(MEASURE.gloss, WORDLESS_SECTION), WORDLESS_SECTION, ALLOWED);
    expect(why).toContain("description of it, not the provision's own words");
  });

  it('still names it for a measure that is a description and has no word of its own', () => {
    // "a ban on importing something else" is a description rather than a term of art, so
    // `MEASURE_NAMES` holds nothing for it and there is no word the quote could carry in the
    // description's place.
    const m = MEASURES['10.1']!.find((x) => x.token === 'other-import-ban')!;
    const f = {
      indicatorId: '10.1', measure: 'other-import-ban',
      quote: 'No person shall carry on the business of selling goods by electronic means',
      dutyBearer: 'No person', dutyAct: 'shall carry on', definingWords: m.gloss,
    } as never;
    const why = rejectionFor(f, SECTION, new Set(['10.1']));
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
