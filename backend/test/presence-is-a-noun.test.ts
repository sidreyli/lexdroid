/**
 * The word these rules actually use is "presence", and a stem ending in the verb cannot reach it.
 *
 * `present\w*` matches present, presently, presented and presenting. It does not match presence:
 * the stem's seventh letter is t and the noun's is c. Both measures that ask whether a provision
 * requires a business to be here were written that way, so the one word the requirement is most
 * often written with was the one word the vocabulary could not see.
 *
 * auDA's licensing rule 2.4.1 -- "A Person applying for a Licence must: have an Australian
 * Presence" -- was surfaced and read for Australia's 12.7, and the cell was answered "No
 * restriction" against the rubric's "Physical presence required". Across the three economies 485
 * provisions say "presence" without also saying establish, office, branch, subsidiary,
 * incorporate or resident, so for those the stem was the only way in.
 *
 * The list is asked of the reader's own quote, not of the corpus: a finding whose quote does not
 * carry a word making out the measure is excluded as a provision read and found not to impose it.
 * So a finding on that clause could not have survived the gate even had the engine made one, which
 * on this run it did not -- it was shown 2.4.1 and said the measure was not made out. This closes
 * the gate's half of that, and leaves the engine's half to the run.
 */
import { describe, expect, it } from 'vitest';
import { MEASURE_NAMES } from '../src/rubric/measures.js';

const LOCAL_PRESENCE = MEASURE_NAMES['local-presence']!;
const DOMAIN_OR_PRESENCE = MEASURE_NAMES['local-domain-or-presence']!;

describe('the words a requirement to be in the economy is written with', () => {
  it('reaches the noun, not only the verb', () => {
    for (const words of [
      'have an Australian Presence',
      'a local presence is required',
      'must maintain a commercial presence in Malaysia',
      'no physical presence in Singapore',
    ]) {
      expect(LOCAL_PRESENCE.test(words)).toBe(true);
      expect(DOMAIN_OR_PRESENCE.test(words)).toBe(true);
    }
  });

  it('still reaches the verb it always reached', () => {
    for (const words of ['must be present in the economy', 'presently resident here']) {
      expect(LOCAL_PRESENCE.test(words)).toBe(true);
    }
  });

  it('leaves the other words of both measures where they were', () => {
    for (const words of [
      'establish a branch office',
      'a subsidiary incorporated in Australia',
      'a person ordinarily resident in Singapore',
    ]) {
      expect(LOCAL_PRESENCE.test(words)).toBe(true);
    }
    // 12.7 asks about the domain name as well, and 12.8 does not.
    expect(DOMAIN_OR_PRESENCE.test('register a domain name under .au')).toBe(true);
  });

  it('does not turn the measure into one that matches anything', () => {
    for (const words of [
      'the licensee must pay the prescribed fee',
      'a person who contravenes this section commits an offence',
      'the Minister may by order exempt a class of goods',
    ]) {
      expect(LOCAL_PRESENCE.test(words)).toBe(false);
      expect(DOMAIN_OR_PRESENCE.test(words)).toBe(false);
    }
  });
});
