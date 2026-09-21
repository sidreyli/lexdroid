/**
 * A measure that asks for something its own rubric band does not.
 *
 * 5.7's band 0 reads "Independent telecom authority is established". The measure asked instead for
 * "the words stating the regulator acts independently or takes no direction", which is a different
 * claim and a rarer one: a system shows a regulator's independence by constituting it as a body of
 * its own, and only sometimes by saying it takes no orders. No Australian provision says ACMA is
 * free of direction, because it is not -- the Minister may direct it. Section 6 of its Act
 * establishes it as a listed entity with its own accountable authority and its own officials,
 * which is exactly what the band describes, and the measure could not be satisfied by it.
 *
 * What did satisfy it, in the run of 20 September 2026, was section 30 of the Gene Technology Act
 * 2000: "the Regulator is not subject to direction from anyone". The right words about the wrong
 * regulator, in a cell about telecommunications.
 *
 * So the measure now asks what the band asks. That widening needs two guards, or it admits more
 * than it should: the subject has to be the communications sector, so another regulator's founding
 * section cannot answer, and the words have to establish something, so a definitions entry cannot.
 * Without the second, the cell scored on "ACMA means the Australian Communications and Media
 * Authority" and on a simplified outline -- the right answer reached through nothing.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES, MEASURE_NAMES, SUBJECT_DOMAIN } from '../src/rubric/measures.js';
import { loadRubric } from '../src/rubric/index.js';

const measure = MEASURES['5.7']!.find((m) => m.token === 'independent-telecom-authority')!;
const band = loadRubric().indicators.find((i) => i.id === '5.7')!.bands.find((b) => b.score === 0)!;

describe('the independent telecom authority measure', () => {
  it('asks for what its band asks for', () => {
    expect(band.criterion).toMatch(/established/i);
    expect(measure.defines).toMatch(/establish/i);
    // The old wording, kept out by name: it is a way of showing independence, not the definition.
    expect(measure.defines).not.toMatch(/subject to direction/i);
  });

  it('is made out by words that create a body, not by words that name one', () => {
    const word = MEASURE_NAMES['independent-telecom-authority']!;
    expect(word.test('The Australian Communications and Media Authority is established by this section')).toBe(true);
    expect(word.test('the ACMA is a listed entity')).toBe(true);
    expect(word.test('the Authority is a body corporate')).toBe(true);
    expect(word.test('ACMA means the Australian Communications and Media Authority')).toBe(false);
    expect(word.test('to monitor, and report each year to the Minister on, significant matters')).toBe(false);
  });

  it('is about the communications sector, whichever word the drafter chose for it', () => {
    const domain = SUBJECT_DOMAIN['5.7']!;
    // "communications" and "telecommunications" are not the same word, and the authority this
    // indicator is about is named with the first of them.
    expect(domain.test('Australian Communications and Media Authority')).toBe(true);
    expect(domain.test('the telecommunications regulator')).toBe(true);
    expect(domain.test('a broadcasting authority')).toBe(true);
    // The regulator that answered this cell before, and the two others that were competing to.
    expect(domain.test('the Gene Technology Regulator')).toBe(false);
    expect(domain.test('offshore infrastructure')).toBe(false);
  });
});
