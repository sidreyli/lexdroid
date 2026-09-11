/**
 * A quotation that skips over words, and what it is still allowed to prove.
 *
 * Seventy-nine readings in the all-pillar run quoted this way, and every fragment of every one of
 * them was in its provision in order. The gate failed all seventy-nine, which is a gate rejecting
 * correct citations -- so what is asserted here is that they verify, and that a fabricated one
 * still does not.
 */
import { describe, expect, it } from 'vitest';
import { elidedFragments, locateQuote } from '../src/util/locate.js';
import { quoteAppearsIn } from '../src/verify/index.js';

const SECTION =
  'An organisation must not transfer any personal data to a country or territory outside ' +
  'Singapore except in accordance with requirements prescribed under this Act to ensure that ' +
  'the transferred personal data will be accorded a standard of protection.';

describe('an elided quotation', () => {
  it('verifies when every fragment is in the provision, in order', () => {
    const quote =
      'must not transfer any personal data to a country or territory outside Singapore ... ' +
      'in accordance with requirements prescribed under this Act';
    expect(quoteAppearsIn(SECTION, quote)).toBe(true);
  });

  it('accepts the single-character ellipsis as readily as three dots', () => {
    const quote =
      'must not transfer any personal data … in accordance with requirements prescribed under this Act';
    expect(quoteAppearsIn(SECTION, quote)).toBe(true);
  });

  it('fails when a fragment is not there at all', () => {
    const quote =
      'must not transfer any personal data ... to any jurisdiction the Minister has not approved';
    expect(quoteAppearsIn(SECTION, quote)).toBe(false);
  });

  it('fails when the fragments are there but in the other order', () => {
    const quote =
      'in accordance with requirements prescribed under this Act ... ' +
      'must not transfer any personal data to a country or territory outside Singapore';
    expect(quoteAppearsIn(SECTION, quote)).toBe(false);
  });

  it('refuses fragments too short to be evidence, so common words cannot pass the gate', () => {
    expect(elidedFragments('a ... the ... of')).toBeNull();
    expect(quoteAppearsIn(SECTION, 'an ... data ... Act')).toBe(false);
  });

  it('leaves an unbroken quotation checked exactly as before', () => {
    expect(elidedFragments('must not transfer any personal data')).toBeNull();
    expect(quoteAppearsIn(SECTION, 'must not transfer any personal data')).toBe(true);
    expect(quoteAppearsIn(SECTION, 'must not transmit any personal data')).toBe(false);
  });

  it('spans the passage quoted, from the first fragment to the last', () => {
    const quote =
      'must not transfer any personal data to a country or territory outside Singapore ... ' +
      'in accordance with requirements prescribed under this Act';
    const at = locateQuote(SECTION, quote);
    expect(at).not.toBeNull();
    expect(SECTION.slice(at!.start).startsWith('must not transfer')).toBe(true);
    expect(SECTION.slice(0, at!.end).endsWith('prescribed under this Act')).toBe(true);
  });

  it('gives an unlocatable elision no offsets rather than a guess', () => {
    expect(locateQuote(SECTION, 'must not transfer any personal data ... into the Minister’s register')).toBeNull();
  });
});
