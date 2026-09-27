import { describe, it, expect } from 'vitest';
import { statedName, namesMatch, identityMismatch, namesAnInstrument, amendsAnotherAct } from '../src/parse/identity.js';

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

  it('reads a plural and its singular as the same word', () => {
    // Three of Malaysia's ten rejected documents were rejected over an "s". The Destitute Persons
    // Act is filed as "DESTITUTE PERSON'S ACT 1977" and is the same Act either way.
    expect(namesMatch('Destitute Persons Act 1977', "DESTITUTE PERSON'S ACT 1977")).toBe(true);
    expect(namesMatch('Labuan Offshore Trusts Act', 'LABUAN OFFSHORES TRUSTS ACT 1996')).toBe(true);
  });
});

describe('a filed title that is not a legal title', () => {
  it('is not asked to contradict anything', () => {
    // Malaysia's data protection portal filed a regulation under its own site theme. A page title
    // is not an instrument name, so it cannot say the document is a different instrument.
    expect(namesAnInstrument('Wordpress Revolutionize')).toBe(false);
    expect(
      identityMismatch(
        s('1. (1) These regulations may be cited as the Personal Data Protection Regulations 2013.'),
        'Wordpress Revolutionize',
      ),
    ).toBeNull();
  });

  it('leaves a real title to be checked as before', () => {
    expect(namesAnInstrument('WITNESS PROTECTION ACT 2009')).toBe(true);
    expect(namesAnInstrument('Peraturan Peraturan Perlindungan Data Peribadi 2013')).toBe(true);
  });

  it('does not check a title the register only guessed at', () => {
    expect(
      identityMismatch(
        s('1. (1) This Act may be cited as the Judicial Appointments Commission Act 2009.'),
        'Act 695 Reprint 2019 rules',
        { titleProvisional: true },
      ),
    ).toBeNull();
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

describe('a name the drafting writes differently from the register', () => {
  it('keeps the bracketed part, which is what tells a family of instruments apart', () => {
    expect(
      statedName(s('1. (1) This order may be cited as the Personal Data Protection\n(Class of Data Users) (Amendment) Order 2016.')),
    ).toBe('Personal Data Protection (Class of Data Users) (Amendment) Order 2016');
  });

  it('stops at the name, not at the commencement the same sentence runs into', () => {
    expect(
      statedName(s('1. This Act may be cited as the Ports (Privatization) Act 1990 and shall come into force on a date to be appointed.')),
    ).toBe('Ports (Privatization) Act 1990');
  });

  it('reads one spelling against the other', () => {
    expect(namesMatch('Ports (Privatization) Act 1990', 'PORTS (PRIVATISATION) ACT 1990')).toBe(true);
    expect(namesMatch('Salvation Army (Incorporation) Act 1956', 'SALVATION ARMY (INCORPORATED) ACT 1956')).toBe(true);
    expect(namesMatch('Goods and Services Tax (Repeal) Act 2018', 'GOODS AND SERVICES (REPEAL) ACT 2018')).toBe(true);
  });

  it('still holds two Acts apart where only the opening of a word agrees', () => {
    expect(
      namesMatch('Arbitration Act 2005', 'CONVENTION ON THE RECOGNITION AND ENFORCEMENT OF FOREIGN ARBITRAL AWARDS ACT 1985'),
    ).toBe(false);
  });

  it('holds apart two Acts of the same name from different years', () => {
    // The comparison drops every number, so a 1968 Act and a 1998 Act of the same name were the
    // same instrument, and a document filed under one was accepted as the other. The year an Act
    // is named for is part of its name.
    expect(namesMatch('Copyright Act 1968', 'COPYRIGHT ACT 1998')).toBe(false);
    expect(namesMatch('Akta Hak Cipta 1987', 'AKTA HAK CIPTA 1997')).toBe(false);
    expect(namesMatch('Copyright Act 1968', 'COPYRIGHT ACT 1968')).toBe(true);
  });

  it('does not read a number no statute book could be dated by as a year', () => {
    // A Malaysian Order whose name the parser recovered as "Order/2063". The parse is wrong; the
    // filing is not, and refusing the document would lose a real instrument over it.
    expect(
      namesMatch(
        'Maintenance Orders (Facilities for Enforcement) (Extension of the Act) Order/2063',
        'MAINTENANCE ORDERS (FACILITIES FOR ENFORCEMENT) (EXTENSION OF THE ACT) ORDER 2004',
      ),
    ).toBe(true);
  });

  it('says nothing about a year where only one name states one', () => {
    // A register entry that gives no year is not a contradiction, and a revised edition prints a
    // later date somewhere else in the name without changing which Act it is.
    expect(namesMatch('Labuan Offshore Trusts Act', 'LABUAN OFFSHORES TRUSTS ACT 1996')).toBe(true);
    expect(namesMatch('Copyright Act 1987', 'COPYRIGHT ACT 1987 (REVISED 2006)')).toBe(true);
  });
});
