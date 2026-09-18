/**
 * A lettered paragraph is not a sentence: it borrows its verb from the words before the colon.
 *
 * The reader is shown the paragraph, so it cannot see the stem. Australia's 6.1 was decided by
 * "prohibit the entity from storing or accessing, or providing access to, scheme data outside
 * Australia" -- paragraph (e) of a list whose stem reads "Examples of conditions that may be
 * prescribed or imposed are conditions to do any of the following:". Nothing is prohibited. The
 * Digital ID Act answered the same cell the same way, under the stem "the Digital ID Rules may:".
 * Both came back with the verb "prohibit", force "forbids" and mandatory true, which is a fair
 * reading of the words shown and a wrong reading of the law.
 *
 * So the question is asked where the whole section is in hand, and asked of drafting form: walk
 * back to the colon, take the stem, read its last modal. A power to prohibit is a real and
 * reportable fact about an economy; it is not a prohibition, and these bands count measures in
 * force.
 */
import { describe, expect, it } from 'vitest';
import { inheritsAPower } from '../src/parse/identity.js';

describe('a list item under a stem that only confers a power', () => {
  it('is a menu of what another instrument may say, not a rule', () => {
    const s =
      'Conditions of accreditation (1) The rules may prescribe conditions of accreditation. ' +
      '(3) Examples of conditions that may be prescribed or imposed are conditions to do any of the following: ' +
      '(a) limit the individuals who may collect and use data; ' +
      '(b) prohibit the entity from storing scheme data outside Australia.';
    expect(inheritsAPower(s, 'prohibit the entity from storing scheme data outside Australia')).toBe(true);
  });

  it('is still a power when the stem empowers rules rather than describing examples', () => {
    const s =
      'Holding etc. information outside Australia (2) Without limiting subsection (1), the Digital ID Rules may: ' +
      '(a) prohibit the holding, storing, handling or transferring of such information outside Australia; and ' +
      '(b) empower the Regulator to grant exemptions.';
    expect(inheritsAPower(s, 'prohibit the holding, storing, handling or transferring of such information outside Australia')).toBe(true);
  });

  it('reads the stem and not the paragraph, so a paragraph saying "must not" is still a power', () => {
    // The words the Minister's order may one day use are not the words of a statute in force.
    const s =
      '(2) The Minister may, by order in the Gazette, amend the Sixth Schedule, which may include the following matters: ' +
      '(a) any exception to section 30C(1); ' +
      '(c) the types of information that the Registrar or the Authority must not disclose.';
    expect(inheritsAPower(s, 'the Registrar or the Authority must not disclose')).toBe(true);
  });
});

describe('a list item under a stem that imposes', () => {
  it('is a duty in both its limbs', () => {
    const s =
      '4.2 Requirements to be satisfied before service is activated. ' +
      '(1) The carriage service provider must not activate the prepaid mobile carriage service unless the provider has: ' +
      '(a) obtained information from the customer in accordance with section 4.3; and ' +
      '(b) verified the identity of the customer in accordance with section 4.4.';
    expect(inheritsAPower(s, 'verified the identity of the customer in accordance with section 4.4')).toBe(false);
  });

  it('leaves an ordinary provision alone, colon or no colon', () => {
    const s =
      '60 Keeping of financial records (1) The ADI must keep the records: (a) in the English language; and ' +
      '(b) either (i) in Australia; or (ii) in another country if APRA gives written approval.';
    expect(inheritsAPower(s, 'in Australia')).toBe(false);
    expect(inheritsAPower('A data provider must store the information in Australia.', 'must store the information in Australia')).toBe(false);
  });

  it('does not reach past the end of the list it opened', () => {
    // A later sentence is not governed by an earlier stem, however permissive that stem was.
    const s =
      'The Minister may make regulations for the following matters: (a) fees; (b) forms. ' +
      'A provider must store the information in Australia.';
    expect(inheritsAPower(s, 'must store the information in Australia')).toBe(false);
  });

  it('says nothing about words it cannot find', () => {
    expect(inheritsAPower('Some provision text.', 'words that are not there')).toBe(false);
    expect(inheritsAPower('Some provision text.', null)).toBe(false);
  });
});
