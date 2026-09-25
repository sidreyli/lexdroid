/**
 * A quotation spelt the other way is still the provision's words.
 *
 * The defect: section 22 of Australia's Payment Systems (Regulation) Act 1998 is headed "Holder of
 * stored value must be an ADI or be authorised or exempted under this Part". The reader filed it
 * under the payment licence measure and quoted the exception as "authorized or exempted"; the
 * quote check refused the finding as words not in the provision, and 12.4.4 answered that no
 * licence is required.
 */
import { describe, expect, it } from 'vitest';
import { quoteIsInSection } from '../src/read/index.js';

const S22 =
  'A person who is not an ADI must not hold stored value unless the person is authorised or exempted under this Part.';

describe('the quote check and spelling', () => {
  it('accepts -ize for -ise and -yze for -yse, either way round', () => {
    expect(quoteIsInSection('authorized or exempted', S22, 3)).toBe(true);
    expect(quoteIsInSection('the data was analysed', 'the data was analyzed by the Authority', 3)).toBe(true);
    expect(quoteIsInSection('any organisation', 'any organization that holds personal data', 3)).toBe(true);
  });

  it('still refuses a different word', () => {
    expect(quoteIsInSection('authorized or licensed', S22, 3)).toBe(false);
    expect(quoteIsInSection('authority', S22, 3)).toBe(false);
  });
});
