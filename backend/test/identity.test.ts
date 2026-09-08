import { describe, it, expect } from 'vitest';
import { statedName, namesMatch, identityMismatch, amendsAnotherAct } from '../src/parse/identity.js';

const s = (text: string) => [{ text }];

describe('the name a document gives itself', () => {
  it('reads the older formula', () => {
    expect(statedName(s('1. (1) This Act may be cited as the Witness Protection Act 2009.')))
      .toBe('Witness Protection Act 2009');
  });

  it('reads the modern formula', () => {
    expect(statedName(s('1. This Act is the Privacy Act 1988.'))).toBe('Privacy Act 1988');
  });

  it('is null where the document never says, which is not a failure', () => {
    expect(statedName(s('2. In this Act, unless the context otherwise requires—'))).toBeNull();
  });
});

describe('whether two names are the same instrument', () => {
  // Each side truncates differently: a catalogue title is cut short, a citation provision runs on.
  it('matches a title cut short by the catalogue', () => {
    expect(namesMatch('Measures for the Collection', 'MEASURES FOR THE COLLECTION, ADMINISTRATION AND ENFORCEMENT OF TAX ACT 2024')).toBe(true);
  });

  it('matches a name running on into its commencement words', () => {
    expect(namesMatch('Adoption of Children Act 2022 and comes into operation on a date that the Minister appoints', 'Adoption of Children Act 2022')).toBe(true);
  });

  it('will not match a different Act', () => {
    expect(namesMatch('Judicial Appointments Commission Act 2009', 'WITNESS PROTECTION ACT 2009')).toBe(false);
  });
});

describe('a document filed under the wrong instrument', () => {
  // Malaysia's portal links its Witness Protection Act row to the Act 695 PDF. The text parses and
  // the offsets hold; only the document's own name shows that every citation would be wrong.
  it('is caught, and says what it really is', () => {
    const m = identityMismatch(s('1. (1) This Act may be cited as the Judicial Appointments Commission Act 2009.'), 'WITNESS PROTECTION ACT 2009');
    expect(m?.stated).toBe('Judicial Appointments Commission Act 2009');
    expect(m?.detail).toContain('may be cited under this title');
  });

  it('passes a document that is what it claims', () => {
    expect(identityMismatch(s('1. (1) This Act may be cited as the Whistleblower Protection Act 2010.'), 'WHISTLEBLOWER PROTECTION ACT 2010')).toBeNull();
  });

  it('does not fail a document that never states a name', () => {
    expect(identityMismatch(s('3. The Enactments mentioned in the Schedule are hereby repealed.'), 'PUBLIC AUTHORITIES PROTECTION ACT 1948')).toBeNull();
  });
});

describe('a provision that only instructs an amendment', () => {
  it('is recognised, so the vehicle is not cited in place of the principal Act', () => {
    expect(amendsAnotherAct('28. The principal Act is amended by inserting before section 36 the following section')).toBe(true);
  });

  it('leaves a provision that imposes its own duty alone', () => {
    expect(amendsAnotherAct('32. (1) A licensee shall retain the records for a period of not less than six years.')).toBe(false);
  });
});
