import { describe, expect, it } from 'vitest';
import { quoteIsInSection } from '../src/read/index.js';

/** The floor a phrase is checked against, as rejectionFor passes it. */
const PHRASE = 3;

const SECTION =
  '(2) The Minister may, on the recommendation of the Authority and by notice in the Gazette, '
  + 'declare a class of goods to be prohibited goods for the purposes of this section, and may '
  + 'require an importer of those goods to keep a record of every consignment.';

describe('a phrase that quotes a split verb', () => {
  it('accepts the fragments where the provision says them, in order', () => {
    expect(quoteIsInSection('may... declare', SECTION, PHRASE)).toBe(true);
    expect(quoteIsInSection('may ... require', SECTION, PHRASE)).toBe(true);
    expect(quoteIsInSection('may... require an importer', SECTION, PHRASE)).toBe(true);
  });

  it('refuses fragments the provision does not say', () => {
    expect(quoteIsInSection('may... forfeit', SECTION, PHRASE)).toBe(false);
    expect(quoteIsInSection('shall... declare', SECTION, PHRASE)).toBe(false);
  });

  it('refuses fragments the provision says in the other order', () => {
    expect(quoteIsInSection('declare... Minister', SECTION, PHRASE)).toBe(false);
  });

  it('still refuses a fragment too short to be a word worth following', () => {
    expect(quoteIsInSection('is... of', SECTION, PHRASE)).toBe(false);
  });

  it('will not find a short fragment inside a longer word', () => {
    expect(quoteIsInSection('rec... goods', SECTION, PHRASE)).toBe(false);
  });
});

describe('the snippet gate is not relaxed with it', () => {
  it('still refuses an elided snippet whose gaps do the work', () => {
    expect(quoteIsInSection('The Minister... may... declare', SECTION)).toBe(false);
    expect(quoteIsInSection('may ... require', SECTION)).toBe(false);
  });

  it('still accepts an elided snippet that quotes enough either side', () => {
    expect(quoteIsInSection(
      'The Minister may, on the recommendation of the Authority ... declare a class of goods to be prohibited goods',
      SECTION,
    )).toBe(true);
  });
});
