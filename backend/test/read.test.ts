/**
 * What the reader is asked, and what it has to be able to show.
 *
 * The defect these tests were written for: section 78 of the Telecommunications Act, a power for
 * the regulator to require information, was labelled a duty to appoint a data protection officer
 * and scored a cell. The old self-check -- name the words that impose the measure -- passed it,
 * because the quote contains the word "officer".
 *
 * The fix is not a filter on the label. It is a different question, asked first: whom does the
 * provision bind, and what must they do. So these tests are about the shape of the question.
 */
import { describe, expect, it } from 'vitest';
import { rejectionFor, quoteIsInSection, __coerce, type Finding } from '../src/read/index.js';
import { MEASURES, INDICATOR_OF_MEASURE } from '../src/rubric/measures.js';

const SECTION =
  'The Authority may, for the purposes of this Act, by notice in writing require any licensee to ' +
  'furnish to an officer of the Authority such information as the Authority may require.';

const pillar7 = new Set(['7.1', '7.2', '7.3', '7.4', '7.5']);

function finding(over: Partial<Finding>): Finding {
  return {
    indicatorId: '7.5',
    measure: 'government-access',
    dutyBearer: 'The Authority',
    dutyAct: 'may',
    dutyForce: 'permits',
    roleWords: null,
    dutyBearerKind: 'organisation',
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'The Authority may, for the purposes of this Act, by notice in writing require any licensee to furnish',
    requirement: 'The regulator may demand information from a licensee.',
    sectorScope: 'specific',
    sector: 'telecommunications',
    dataScope: 'all',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    authorisation: 'none',
    ...over,
  };
}

describe('the vocabulary a finding is answered in', () => {
  it('names the party every measure is borne by', () => {
    // Without this, a gloss says what a measure does and nothing says whom it binds -- which is
    // the whole distance between a regulator demanding information and an organisation appointing
    // a compliance officer.
    for (const [indicatorId, measures] of Object.entries(MEASURES)) {
      for (const m of measures) {
        expect(m.actor.length, `${indicatorId} ${m.token} has no actor`).toBeGreaterThan(10);
      }
    }
  });

  it('describes the officer requirement as a duty, not as its acronym', () => {
    // A provision imposing it rarely uses the phrase. Singapore's is headed "Compliance with Act".
    // The gloss is also a retrieval query, so an acronym here is useless twice over.
    const dpo = MEASURES['7.4']?.find((m) => m.token === 'data-protection-officer');
    expect(dpo?.gloss).toMatch(/appoint or designate/i);
    expect(dpo?.gloss).not.toMatch(/\bDPO\b/);
  });

  it('puts the state on one side of the government-access measure and the regulated party on the other', () => {
    expect(MEASURES['7.5']?.[0]?.actor).toMatch(/authority|government/i);
    expect(MEASURES['7.4']?.[0]?.actor).toMatch(/organisation/i);
  });
});

describe('what a finding must be able to show', () => {
  it('accepts a duty whose party and act are both in the quote', () => {
    expect(rejectionFor(finding({}), SECTION, pillar7)).toBeNull();
  });

  it('rejects a party the provision does not name', () => {
    // The failing shape: the reading asserts an organisation is bound when the sentence binds the
    // regulator. It cannot quote the organisation, because there is not one.
    const reason = rejectionFor(
      finding({ indicatorId: '7.4', measure: 'data-protection-officer', dutyBearer: 'an organisation' }),
      SECTION,
      pillar7,
    );
    expect(reason).toMatch(/an organisation/);
    expect(reason).toMatch(/bear the duty/);
  });

  it('lets a finding say the provision names no party, rather than inventing one', () => {
    // A passive duty puts the thing kept in the subject position. Naming nobody is an answer the
    // reader is allowed to give; Zone 3 holds it, which is where that judgement belongs.
    expect(rejectionFor(finding({ dutyBearer: null }), SECTION, pillar7)).toBeNull();
  });

  it('rejects an act the provision does not impose', () => {
    const reason = rejectionFor(finding({ dutyAct: 'shall appoint' }), SECTION, pillar7);
    expect(reason).toMatch(/shall appoint/);
  });

  it('rejects a quote that is not in the provision at all', () => {
    const reason = rejectionFor(finding({ quote: 'The licensee shall appoint a data protection officer' }), SECTION, pillar7);
    expect(reason).toBe('the quoted words are not in the provision');
  });

  it('rejects an indicator from another pillar', () => {
    expect(rejectionFor(finding({ indicatorId: '6.2' }), SECTION, pillar7)).toMatch(/not an indicator/);
  });

  it('rejects a finding that named no measure this indicator recognises', () => {
    expect(rejectionFor(finding({ measure: null }), SECTION, pillar7)).toMatch(/no measure/);
  });

  // A place claimed but not quoted is the same failure as a duty claimed but not quoted, and it
  // matters more here: pillar 6's measures are defined by where something has to be, so the place
  // is the whole of the claim rather than one field of it.
  it('rejects a place the provision does not name', () => {
    expect(rejectionFor(finding({ placeWords: 'within Singapore' }), SECTION, pillar7)).toMatch(
      /state the place.*not in the provision/,
    );
  });

  // Section 199 of the Companies Act, the provision Singapore's local storage indicator turns on.
  // The reader quoted the operative words tightly and named a party the Act states a few words
  // earlier. Checking the party against the quoted span alone threw the whole finding away.
  it('accepts a party the provision names outside the span the reader quoted', () => {
    const section =
      'If accounting and other records are kept by the company at a place outside Singapore ' +
      'there must be sent to and kept at a place in Singapore such statements and returns as ' +
      'will enable to be prepared true and fair financial statements.';
    const reason = rejectionFor(
      finding({
        quote: 'must be sent to and kept at a place in Singapore',
        dutyBearer: 'the company',
        dutyAct: 'must be sent to and kept',
        placeWords: 'at a place in Singapore',
      }),
      section,
      pillar7,
    );
    expect(reason).toBeNull();
  });

  // And a party the provision does not name is still rejected, which is the whole point of asking.
  // The Cybersecurity Act says "critical information infrastructure"; this says "crisis".
  it('still rejects a party the provision does not name at all', () => {
    const section =
      'The owner of a provider-owned critical information infrastructure must report any incident.';
    const reason = rejectionFor(
      finding({
        quote: 'must report any incident',
        dutyBearer: 'the owner of a provider-owned crisis information infrastructure',
        dutyAct: 'must report',
      }),
      section,
      pillar7,
    );
    expect(reason).toMatch(/bear the duty.*not in the provision/);
  });

  it('accepts a finding that names no place, which is most of them', () => {
    expect(rejectionFor(finding({ placeWords: null }), SECTION, pillar7)).toBeNull();
  });

  it('rejects words said to name information that the provision does not carry', () => {
    expect(rejectionFor(finding({ informationWords: 'any personal data' }), SECTION, pillar7)).toMatch(
      /name information.*not in the provision/,
    );
  });

  it('rejects words said to keep the data in place that the provision does not carry', () => {
    expect(rejectionFor(finding({ keepingWords: 'shall be kept in Singapore' }), SECTION, pillar7)).toMatch(
      /keep the data in place.*not in the provision/,
    );
  });
});

describe('the quote check', () => {
  it('forgives typography and nothing else', () => {
    expect(quoteIsInSection('the Authority’s notice', 'served the Authority’s notice on it')).toBe(true);
    expect(quoteIsInSection("the Authority's notice", 'served the Authority’s notice on it')).toBe(true);
    expect(quoteIsInSection('the Authority notice', 'served the Authority’s notice on it')).toBe(false);
  });

  it('will not accept a fragment too short to identify anything', () => {
    expect(quoteIsInSection('may', SECTION)).toBe(false);
  });

  it('accepts a quote that skips text, if every part of it is there in order', () => {
    const list =
      'any infrastructure, facility, premises, network or electronic system that: (a) is located ' +
      'in Australia; and (b) is critical to the social or economic stability of Australia';
    expect(quoteIsInSection('any infrastructure, facility ... is located in Australia', list)).toBe(true);
    // In order, not merely present: a quote may not reverse what the provision says.
    expect(quoteIsInSection('is located in Australia ... any infrastructure, facility', list)).toBe(false);
    expect(quoteIsInSection('any infrastructure, facility ... is located in Belgium', list)).toBe(false);
  });

  it('will not let an ellipsis stitch two verbs into a duty', () => {
    const s = 'The Commissioner has the powers conferred by this Act and may require information.';
    expect(quoteIsInSection('The Commissioner... has... powers to require information', s)).toBe(false);
  });
});

describe('filing a finding by its measure', () => {
  const raw = {
    quote: 'An authorised officer of an enforcement agency may authorise the disclosure',
    dutyBearer: 'An authorised officer of an enforcement agency',
    dutyAct: 'may authorise',
    dutyForce: 'permits',
    indicatorId: '7.3',
    measure: 'government-access',
  };

  it('moves a finding to the indicator its measure belongs to, and says where it came from', () => {
    const f = __coerce(raw);
    expect(f?.indicatorId).toBe('7.5');
    expect(f?.measure).toBe('government-access');
    expect(f?.refiledFrom).toEqual({ indicatorId: '7.3', measure: 'government-access' });
  });

  it('leaves a finding alone when the reader filed it where the measure lives', () => {
    const f = __coerce({ ...raw, indicatorId: '7.5' });
    expect(f?.indicatorId).toBe('7.5');
    expect(f?.refiledFrom).toBeUndefined();
  });

  it('keeps the indicator the reader chose when the measure belongs to more than one', () => {
    // 4.2 and 4.6 share both of their measures, and there the reader's own choice is the only
    // thing that can separate them.
    expect(INDICATOR_OF_MEASURE.has('enforcement-procedure')).toBe(false);
    const f = __coerce({ ...raw, indicatorId: '4.2', measure: 'enforcement-procedure' });
    expect(f?.indicatorId).toBe('4.2');
    expect(f?.measure).toBe('enforcement-procedure');
  });

  it('nulls a measure that does not exist where the finding ends up', () => {
    const f = __coerce({ ...raw, indicatorId: '7.3', measure: 'not-a-real-measure' });
    expect(f?.indicatorId).toBe('7.3');
    expect(f?.measure).toBeNull();
  });
});
