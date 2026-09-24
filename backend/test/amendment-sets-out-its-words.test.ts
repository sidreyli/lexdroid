import { describe, it, expect } from 'vitest';
import { amendsAnotherAct, insertsTheQuotedWords, amendsWhat } from '../src/parse/identity.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

// Malaysia's Act A1727 section 6, which inserted the duties ESCAP scores for seven cells.
const INSERTING = `6. The principal Act is amended in Part II by inserting after
section 12 the following division:
“Division 1A
Accountability of personal data
Appointment of data protection officer
12A. (1) A data controller shall appoint one or more
data protection officers who shall be accountable to the
data controller for the compliance with this Act.
Data breach notification
12B. (1) Where a data controller has reason to believe that
a personal data breach has occurred, the data controller shall,
as soon as practicable, notify the Commissioner.”.`;

const DELETING = '10. Paragraph 48(e) of the principal Act is deleted.';

describe('an amending provision that sets out the words it inserts', () => {
  it('is still an amending provision', () => {
    expect(amendsAnotherAct(INSERTING)).toBe(true);
  });

  it('leaves a bare deletion where it already was: not read as amending at all', () => {
    // `amendsAnotherAct` looks for "is amended", so a provision that only deletes is not caught by
    // it and never was. Recorded here because it is the one shape this rule does not reach: such a
    // provision carries no duty to build a finding on, so nothing turns on it today.
    expect(amendsAnotherAct(DELETING)).toBe(false);
    expect(insertsTheQuotedWords(DELETING, 'Paragraph 48(e) of the principal Act is deleted')).toBe(false);
  });

  it('admits a span the page happened to break a line in the middle of', () => {
    // The defect this is for: the check was a raw `indexOf`, and the reader quotes a span of words
    // rather than a span of a PDF. Every quote in the fixture above stops short of a line break,
    // so the test passed while the store did not -- Malaysia's 7.4 scored zero because the one
    // finding that answered it quoted "A data controller shall appoint one or more data protection
    // officers" and the page puts a newline between "more" and "data". Missing by that one
    // character, the gate in `decide` read a section setting out four subsections of new duties as
    // an instruction setting out nothing.
    expect(insertsTheQuotedWords(INSERTING, 'A data controller shall appoint one or more data protection officers')).toBe(true);
    expect(insertsTheQuotedWords(INSERTING, 'a personal data breach has occurred, the data controller shall, as soon as practicable')).toBe(true);
  });

  it('admits words taken from inside the passage it enacts', () => {
    expect(insertsTheQuotedWords(INSERTING, 'shall appoint one or more')).toBe(true);
    expect(insertsTheQuotedWords(INSERTING, 'notify the Commissioner')).toBe(true);
  });

  it('does not admit the instruction itself', () => {
    expect(insertsTheQuotedWords(INSERTING, 'The principal Act is amended in Part II')).toBe(false);
  });

  it('does not admit words that are not in the provision at all', () => {
    expect(insertsTheQuotedWords(INSERTING, 'a data controller shall obtain consent')).toBe(false);
    expect(insertsTheQuotedWords(INSERTING, null)).toBe(false);
  });
});

describe('the Act an amendment says it amends', () => {
  it('reads the naming clause, with the principal’s own identifier', () => {
    expect(
      amendsWhat([
        { text: 'An Act to amend the Personal Data Protection Act 2010.' },
        { text: '2. The Personal Data Protection Act 2010 [Act 709], which is referred to as the “principal Act” in this Act, is amended by substituting for the words “data user”.' },
      ]),
    ).toEqual({ name: 'Personal Data Protection Act 2010', officialNumber: 'Act 709' });
  });

  it('reads the subsidiary voice, which names the instrument before the change', () => {
    expect(
      amendsWhat([{ text: '2. The Sales Tax (Persons Exempted From Payment Of Tax) Order 2018 [P.U. (A) 210/2018] is amended in the Schedule.' }]),
    ).toEqual({ name: 'Sales Tax (Persons Exempted From Payment Of Tax) Order 2018', officialNumber: 'P.U. (A) 210/2018' });
  });

  it('says nothing where an Act merely cites another Act', () => {
    // An Act's opening sections cite other Acts for definitions and for appeal tribunals; the
    // first bracketed number in a head is as often one of those as it is a principal.
    expect(
      amendsWhat([{ text: '3. In this Act, unless the context otherwise requires, “company” has the meaning assigned to it under the Companies Act 2016 [Act 777].' }]),
    ).toBeNull();
    expect(amendsWhat([{ text: 'An Act to provide for the licensing of cyber security service providers.' }])).toBeNull();
    expect(amendsWhat([])).toBeNull();
  });
});

describe('what the decision does with words an amendment inserts', () => {
  const conditional: Indicator = {
    id: '6.4', pillarId: 6, pillarName: 'Cross-border Data Policies',
    category: 'Conditional flow regimes',
    exception: 'Not score data localization measure applied to government data.',
    criteriaText: '...',
    bands: [
      { score: 1, criterion: 'Conditions for all sectors or personal data', ordinal: 1 },
      { score: 0.5, criterion: 'Conditions for specific data or non-personal data', ordinal: 2 },
      { score: 0, criterion: 'No condition', ordinal: 3 },
    ],
    shape: 'provision', shapeBasis: 'test', provenance: { document: 'test', locator: 'test' },
  };

  function transferCondition(): Finding {
    return {
      indicatorId: '6.4', measure: 'transfer-condition',
      dutyBearer: 'a data controller', dutyAct: 'must not transfer', dutyForce: 'forbids',
      roleWords: null, definingWords: 'unless the recipient is bound by comparable protection',
      subjectWords: null, borderWords: 'outside Malaysia',
      imposingWords: 'must not transfer', prescribingWords: null,
      dutyBearerKind: 'organisation', scopeUnstated: false,
      placeWords: 'outside Malaysia', exceptionWords: null,
      locatedData: 'personal data', informationWords: 'personal data',
      keepingWords: 'must not transfer any personal data outside Malaysia',
      authorisingWords: null,
      quote: 'a data controller must not transfer any personal data outside Malaysia unless the recipient is bound by comparable protection',
      requirement: 'Transfers abroad are conditional.',
      sectorScope: 'all', sector: null, dataScope: 'personal', dataDescription: null,
      appliesOnlyToGovernmentData: false, mandatory: true, countriesNamed: [],
      statedPeriod: null, authorisation: 'unstated',
    };
  }

  const base: Evidence = {
    finding: transferCondition(), sectionId: 900, instrumentId: 9,
    instrumentTitle: 'Personal Data Protection (Amendment) Act 2024',
    amendsAnotherAct: true, headingPath: 'Part II > 6',
    citation: 'https://x/9', bindingness: 'binding',
  };
  const surfaced: SurfacedInstrument[] = [{ instrumentId: 9, instrumentTitle: 'X', rank: 1 }];
  const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };
  const answer = (e: Evidence) =>
    decide({ indicator: conditional, economy: 'MYS', evidence: [e], surfaced, governing: [9], coverage });

  it('rules out an instruction that sets out nothing, as it always did', () => {
    const d = answer(base);
    expect(d.state).toBe('no-restriction');
    expect(d.excluded.map((h) => h.reason).join(' ')).toContain('without setting out the words it inserts');
  });

  it('counts the words the amendment enacts', () => {
    const d = answer({ ...base, insertsTheQuotedWords: true });
    expect(d.state).toBe('restricted');
    expect(d.basis.length).toBe(1);
  });

  it('cites them as the principal Act’s, naming the instrument that inserted them', () => {
    const d = answer({
      ...base,
      insertsTheQuotedWords: true,
      citedAs: 'Personal Data Protection Act 2010, as amended by Personal Data Protection (Amendment) Act 2024',
    });
    expect(d.rationale).toContain('Personal Data Protection Act 2010, as amended by');
  });
});
