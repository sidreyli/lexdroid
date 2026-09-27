/**
 * The second question has to be answerable with "no", and a "yes" has to be the provision's own.
 *
 * The pass exists because the first reading is asked which of a pillar's measures a provision is,
 * and always picks the nearest one. Asked about one measure alone, the reader may still hand back
 * our description of it, or words the provision does not contain -- both of which would confirm a
 * label by restating it.
 */
import { describe, expect, it } from 'vitest';
import { confirmedWords, measureOf, rulingOf } from '../src/read/confirm.js';

const MEASURE = measureOf('12.3', 'ecommerce-licence')!;

const SECTION =
  'No person shall carry on the business of selling goods by electronic means unless that person '
  + 'holds a licence granted by the Authority under this section.';

describe('confirming a measure against the provision', () => {
  it('finds the measure where the catalogue defines it', () => {
    expect(MEASURE.token).toBe('ecommerce-licence');
    expect(measureOf('12.3', 'not-a-measure')).toBeUndefined();
  });

  it('keeps words the provision actually carries', () => {
    expect(confirmedWords('holds a licence granted by the Authority', SECTION, MEASURE)).toBe(
      'holds a licence granted by the Authority',
    );
  });

  it('rules out words the provision does not carry', () => {
    expect(confirmedWords('holds a permit issued by the Minister', SECTION, MEASURE)).toBe(null);
  });

  it('rules out our own description handed back', () => {
    expect(confirmedWords(MEASURE.gloss, SECTION, MEASURE)).toBe(null);
    expect(confirmedWords(MEASURE.defines, SECTION, MEASURE)).toBe(null);
  });

  it('treats an empty or absent answer as the ordinary no', () => {
    expect(confirmedWords(null, SECTION, MEASURE)).toBe(null);
    expect(confirmedWords('   ', SECTION, MEASURE)).toBe(null);
    expect(confirmedWords(42, SECTION, MEASURE)).toBe(null);
  });
});

/**
 * "No" and "I could not answer" used to be the same value.
 *
 * Every one of the cases below returned null words and no failure, so the pass banked them as the
 * provision having been read and found not to impose the measure -- the evidence an absence zero
 * is made of. A cell can be scored zero on a provision the engine never managed to answer about.
 */
describe('telling a ruled-out measure from an answer that did not arrive', () => {
  const ruling = (text: string) => rulingOf(text, SECTION, MEASURE);

  it('reads an explicit null as the measure ruled out', () => {
    expect(ruling('{"words": null}')).toEqual({ words: null, failure: null });
  });

  it('reads an empty string as the measure ruled out', () => {
    expect(ruling('{"words": ""}')).toEqual({ words: null, failure: null });
  });

  it('keeps words the provision carries', () => {
    expect(ruling('{"words": "holds a licence granted by the Authority"}').words).toBe(
      'holds a licence granted by the Authority',
    );
  });

  it('fails rather than rules out where the answer is not JSON', () => {
    expect(ruling('I am unable to answer that.').failure).toMatch(/not JSON/);
  });

  it('fails rather than rules out where the answer has no words field', () => {
    expect(ruling('{"answer": "no"}').failure).toMatch(/no words field/);
  });

  it('fails rather than rules out where the words are not text', () => {
    expect(ruling('{"words": ["holds a licence"]}').failure).toMatch(/not text/);
    expect(ruling('{"words": true}').failure).toMatch(/not text/);
  });

  it('fails rather than rules out where the words are not the provision\'s own', () => {
    // A fabricated quote is not a "no" either. The reader answered, but not from this text, and
    // what it answered about cannot be checked.
    expect(ruling('{"words": "holds a permit issued by the Minister"}').failure).toMatch(/not the provision/);
  });

  it('fails rather than rules out where the reader hands back our own description', () => {
    expect(ruling(JSON.stringify({ words: MEASURE.gloss })).failure).toMatch(/not the provision/);
  });
});

/**
 * "None" is the answer "no", written in the wrong type.
 *
 * Malaysia's first confirmation pass asked 1,524 questions and banked 1,132 failures and not one
 * refusal: where the engine meant null it wrote the word, the word is not in the provision, and
 * every one of those refusals was thrown away. The pass contributed nothing to that run's scores.
 */
describe('a refusal written as a word', () => {
  const ruling = (words: unknown) => rulingOf(JSON.stringify({ words }), SECTION, MEASURE);

  it('reads the tokens that stand for null as the ordinary no', () => {
    for (const token of ['none', 'None', 'NULL', 'Null', 'nil', 'N/A', 'no', 'false', '-', 'none.']) {
      const r = ruling(token);
      expect({ token, ...r }).toEqual({ token, words: null, failure: null });
    }
  });

  it('still keeps words the provision carries', () => {
    expect(ruling('holds a licence granted by the Authority').words).toBe(
      'holds a licence granted by the Authority',
    );
  });

  it('still fails on a quote the provision does not carry', () => {
    expect(ruling('holds a permit issued by the Minister').failure).toMatch(/not the provision/);
  });

  it('leaves a provision whose own words are longer than a token alone', () => {
    // Nothing on the list reaches the shortest quote a confirmation accepts, so no real quote can
    // be read as a refusal by being short.
    expect(ruling('not applicable to a licensee').failure).toMatch(/not the provision/);
  });
});
