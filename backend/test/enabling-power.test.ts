/**
 * A power to require is not a requirement.
 *
 * Australia's 6.1 was scored a top band off two rule-making powers: a list of "examples of
 * conditions that may be prescribed or imposed", and "the Digital ID Rules may make provision in
 * relation to the holding ... of information outside Australia". Both were read as mandatory
 * prohibitions, one of them borne by the Rules themselves. The reader is now asked for the words
 * by which the provision imposes the thing, and a provision that has none is held.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES } from '../src/rubric/measures.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { rejectionFor, __prompt, type Finding } from '../src/read/index.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

const POWER =
  'Examples of conditions that may be prescribed or imposed are conditions to prohibit the entity ' +
  'from storing or accessing, or providing access to, scheme data outside Australia.';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '6.1',
    measure: 'transfer-ban',
    dutyBearer: 'the entity',
    dutyAct: 'prohibit',
    dutyForce: 'forbids',
    roleWords: null,
    definingWords: 'outside Australia',
    imposingWords: null,
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: 'outside Australia',
    exceptionWords: null,
    locatedData: 'scheme data',
    informationWords: 'scheme data',
    keepingWords: 'storing or accessing',
    authorisingWords: null,
    quote: POWER,
    requirement: 'Scheme data may not be stored outside Australia.',
    sectorScope: 'specific',
    sector: 'accredited data users',
    dataScope: 'non-personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: ['Australia'],
    statedPeriod: null,
    authorisation: 'unstated',
    ...over,
  };
}

const evidence = (over: Partial<Finding> = {}): Evidence => ({
  finding: finding(over),
  sectionId: 1,
  instrumentId: 1,
  instrumentTitle: 'Data Availability and Transparency Act 2022',
  amendsAnotherAct: false,
  headingPath: 'Part 5.2 > 77B Conditions of accreditation',
  citation: 'https://www.legislation.gov.au/C2022A00011',
});

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Data Availability and Transparency Act 2022', rank: 1 },
];
const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };

describe('a provision that empowers rather than requires', () => {
  it('is asked about, in the prompt, in the words a power uses', () => {
    const p = __prompt(
      { sectionId: 1, instrumentTitle: 'Data Availability and Transparency Act 2022', headingPath: 'Part 5.2 > 77B', text: POWER },
      'Cross-border Data Policies',
      [indicator('6.1')],
    );
    expect(p).toContain('imposingWords:');
    expect(p).toContain('A power to require is not a');
  });

  it('is held rather than scored, and the hold says why', () => {
    const d = decide({ indicator: indicator('6.1'), economy: 'AUS', evidence: [evidence()], surfaced, coverage });
    expect(d.score).toBe(0);
    expect(d.held).toHaveLength(1);
    expect(d.held[0]?.reason).toContain('empowers another instrument');
  });

  it('scores when the provision does impose the thing itself', () => {
    const quote = 'An accredited entity must not store scheme data outside Australia.';
    const d = decide({
      indicator: indicator('6.1'),
      economy: 'AUS',
      evidence: [evidence({ quote, imposingWords: 'must not store' })],
      surfaced,
      coverage,
    });
    expect(d.score).toBeGreaterThan(0);
    expect(d.held).toHaveLength(0);
  });

  it('is rejected when the imposing words are not in the provision', () => {
    const r = rejectionFor(finding({ imposingWords: 'must not store' }), POWER, new Set(['6.1']));
    expect(r).toContain('said to impose the requirement');
  });
});

describe('pillar 6 asks for the thing, not merely for a place', () => {
  it('separates storage from infrastructure, which asking for a place did not', () => {
    // Every pillar-6 indicator is about place, so a place answered them all alike: a records
    // provision made out the computing-facilities measure.
    const storage = MEASURES['6.2']!.find((m) => m.token === 'local-storage')!;
    const infra = MEASURES['6.3']!.find((m) => m.token === 'local-infrastructure')!;
    expect(storage.defines).toContain('country');
    expect(infra.defines).toContain('computing facilities');
    expect(infra.defines).not.toBe(storage.defines);
  });
});

/**
 * Two ways the question above was wrong, both found by running Australia with it.
 *
 * It assumed every measure is a duty owed by a private party. Fifteen measures across ten
 * indicators are written as powers, and for those the honest answer is nothing -- so the hold
 * swallowed every genuine finding. And it was answered with the enabling words themselves: the
 * DATA Act stem listing conditions that may be prescribed was copied in as the words imposing a
 * transfer ban, which is why the reader is now asked for the enabling words in their own right.
 */
const ACCESS =
  'An authorised officer may require a person to produce a document or record that is in the ' +
  'person’s possession, and the person must comply.';

function accessFinding(over: Partial<Finding> = {}): Finding {
  return finding({
    indicatorId: '7.5',
    measure: 'government-access',
    dutyBearer: 'An authorised officer',
    dutyBearerKind: 'government',
    dutyAct: 'may require a person to produce',
    dutyForce: 'permits',
    definingWords: 'require a person to produce a document or record',
    imposingWords: null,
    prescribingWords: null,
    placeWords: null,
    locatedData: 'a document or record',
    informationWords: 'a document or record',
    keepingWords: null,
    quote: ACCESS,
    requirement: 'An officer may require production of records.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'personal',
    countriesNamed: [],
    authorisation: 'none',
    ...over,
  });
}

describe('a measure the rubric itself writes as a power', () => {
  it('is not held for imposing nothing, because there is nothing for it to impose', () => {
    const d = decide({
      indicator: indicator('7.5'),
      economy: 'AUS',
      evidence: [{ ...evidence(), finding: accessFinding() }],
      surfaced,
      coverage,
    });
    expect(d.held.map((h) => h.reason).join(' ')).not.toContain('empowers another instrument');
    expect(d.score).toBe(1);
  });

  it('asks for the words by which the authority gets the data, not a power to make rules', () => {
    const access = MEASURES['7.5']!.find((m) => m.token === 'government-access')!;
    expect(access.defines).toContain('obtains the data');
    expect(access.defines).toContain('rules');
  });
});

describe('the enabling words, asked in their own right', () => {
  it('is a question in the prompt about what some other instrument may impose', () => {
    const p = __prompt(
      { sectionId: 1, instrumentTitle: 'Data Availability and Transparency Act 2022', headingPath: 'Part 5.2 > 77B', text: POWER },
      'Cross-border Data Policies',
      [indicator('6.1')],
    );
    expect(p).toContain('prescribingWords:');
  });

  it('holds when the same words answer both questions, which is the DATA Act shape', () => {
    const stem = 'Examples of conditions that may be prescribed or imposed';
    const d = decide({
      indicator: indicator('6.1'),
      economy: 'AUS',
      evidence: [evidence({ imposingWords: stem, prescribingWords: stem })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.held[0]?.reason).toContain('empowering another instrument');
  });

  it('scores a provision that does both, imposing a duty and empowering rules about it', () => {
    const quote =
      'An accredited entity must not store scheme data outside Australia, and the Rules may ' +
      'prescribe exceptions to this section.';
    const d = decide({
      indicator: indicator('6.1'),
      economy: 'AUS',
      evidence: [
        evidence({ quote, imposingWords: 'must not store', prescribingWords: 'the Rules may prescribe exceptions' }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBeGreaterThan(0);
    expect(d.held).toHaveLength(0);
  });

  it('is rejected when the enabling words are not in the provision', () => {
    const r = rejectionFor(
      finding({ imposingWords: 'prohibit the entity', prescribingWords: 'the Minister may make regulations' }),
      POWER,
      new Set(['6.1']),
    );
    expect(r).toContain('said to empower another instrument');
  });
});
