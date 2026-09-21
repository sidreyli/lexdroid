/**
 * A statutory list, quoted the only way a list can be quoted.
 *
 * A provision that defines something in lettered paragraphs puts the letters between the words:
 * "(a) the purpose and character of the dealing; (b) the nature of the copyright material; ...".
 * A reader asked for the words that make out the measure returns the items, in order, joined by
 * the semicolons that are already there. That is a faithful quotation of the provision, and the
 * check refused it, because the markers sit inside the span being matched.
 *
 * It cost a cell in the run of 20 September 2026. Section 113E of Australia's Copyright Act 1968 --
 * "A fair dealing with copyright material does not infringe copyright in the material" -- is the
 * fair dealing model the top band of 4.5 names out loud, and `namesTheModel` in Zone 3 exists to
 * catch exactly it. The provision was retrieved and read; the four fairness factors of s 113E(2)
 * came back complete and in order, with the paragraph letters dropped and one comma missing; the
 * finding was thrown away as words "not in the provision", and the cell scored the middle band on
 * the three-step test instead. Measured over the store, the same shape cost 248 findings.
 *
 * What is loosened is the pointing, and nothing else. The words must still all be there, and still
 * in the provision's order.
 */
import { describe, expect, it } from 'vitest';
import { quoteIsInSection } from '../src/read/index.js';

/** Section 113E of the Copyright Act 1968 (Cth), as the corpus holds it. */
const FAIR_DEALING =
  '113E Fair dealing for purpose of access by persons with a disability (1) A fair dealing with ' +
  'copyright material does not infringe copyright in the material if the dealing is for the purpose ' +
  'of one or more persons with a disability having access to copyright material (whether the dealing ' +
  'is by any of those persons or by another person). (2) The matters to which regard must be had, in ' +
  'determining whether the dealing is a fair dealing for the purposes of this section, include the ' +
  'following matters: (a) the purpose and character of the dealing; (b) the nature of the copyright ' +
  'material; (c) the effect of the dealing upon the potential market for, or value of, the material; ' +
  '(d) if only part of the material is dealt with—the amount and substantiality of the part dealt ' +
  'with, taken in relation to the whole material.';

/** The words the reader returned, verbatim from the run's discard row. */
const AS_RETURNED =
  'the purpose and character of the dealing; the nature of the copyright material; the effect of ' +
  'the dealing upon the potential market for, or value of the material; if only part of the material ' +
  'is dealt with—the amount and substantiality of the part dealt with, taken in relation to the ' +
  'whole material';

const PHRASE = 3;

describe('a list quoted without its paragraph letters', () => {
  it('is found in the provision it was lifted from', () => {
    expect(quoteIsInSection(AS_RETURNED, FAIR_DEALING, PHRASE)).toBe(true);
  });

  it('is found whether the reader keeps the letters, drops them, or repoints the list', () => {
    expect(quoteIsInSection('(a) the purpose and character of the dealing', FAIR_DEALING, PHRASE)).toBe(true);
    expect(quoteIsInSection('the purpose and character of the dealing', FAIR_DEALING, PHRASE)).toBe(true);
    expect(quoteIsInSection('the purpose and character of the dealing, the nature of the copyright material', FAIR_DEALING, PHRASE)).toBe(true);
  });

  it('still refuses words the provision does not contain', () => {
    // The point of the check is unchanged: this is the reader inventing a factor.
    expect(quoteIsInSection('the purpose and character of the broadcast; the nature of the patent', FAIR_DEALING, PHRASE)).toBe(false);
    expect(quoteIsInSection('the effect of the dealing upon the reputation of the author', FAIR_DEALING, PHRASE)).toBe(false);
  });

  it('still refuses the provision’s own words in an order it does not put them in', () => {
    // Order is what makes a quotation a quotation rather than a bag of words, and it still holds.
    expect(
      quoteIsInSection('the nature of the copyright material; the purpose and character of the dealing', FAIR_DEALING, PHRASE),
    ).toBe(false);
  });

  it('does not let punctuation alone carry a quote past the floor', () => {
    // Stripping the pointing must not turn a too-short phrase into a long enough one.
    expect(quoteIsInSection(';;,,', FAIR_DEALING, PHRASE)).toBe(false);
    expect(quoteIsInSection('(a)', FAIR_DEALING, PHRASE)).toBe(false);
  });
});
