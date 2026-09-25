/**
 * The other half of "affecting all circumstances and sectors".
 *
 * Two of the rubric's bands scale a restriction by reach, and each names two axes: the top band
 * is for one "affecting all circumstances and sectors", the middle for one "affecting to a
 * specific circumstance or sector". Only the sector was ever asked. A restriction that waits on a
 * condition therefore counted as reaching every circumstance, because it named no sector.
 *
 * What that cost is visible across two economies holding the same law. Singapore's Patents Act
 * section 69 withholds damages "against a defendant who proves that at the date of the
 * infringement the defendant was not aware"; Australia's section 123 lets a court "refuse to
 * award damages ... if the defendant satisfies the court" of the same thing. Singapore's took the
 * top band -- the rubric's maximum, high impact across every circumstance and sector -- and
 * Australia's, being discretionary, was excluded and the cell scored no restriction at all. The
 * innocent-infringer defence is in every patent statute of the TRIPS era, so it cannot be the
 * fact that separates two economies, and the band never claimed it was.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const patentEnforcement: Indicator = {
  id: '4.3',
  pillarId: 4,
  pillarName: 'Intellectual Property Rights',
  category: 'Patent enforcement issues: others',
  exception: null,
  criteriaText: '...',
  bands: [
    {
      score: 1,
      criterion:
        'For any restriction with high impact, when the issue affecting all circumstances and sectors, OR more than one measure of category (2)',
      ordinal: 1,
    },
    {
      score: 0.5,
      criterion: 'For any restriction with limited impact, when the issue affecting to a specific circumstance or sector',
      ordinal: 2,
    },
    { score: 0, criterion: 'No restriction', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function evidence(over: Partial<Finding>): Evidence {
  const finding = {
    indicatorId: '4.3',
    measure: 'patent-enforcement-restriction',
    dutyBearer: 'the court',
    dutyAct: 'must not award',
    dutyForce: 'forbids',
    roleWords: null,
    definingWords: 'patent',
    subjectWords: 'patent',
    borderWords: null,
    imposingWords: 'must not award',
    prescribingWords: null,
    dutyBearerKind: 'government',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'damages must not be awarded against a defendant who proves that at the date of the infringement the defendant was not aware',
    requirement: 'Damages are withheld from an unaware infringer.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'non-personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    authorisation: 'none',
    ...over,
  } as Finding;
  return {
    finding,
    sectionId: 900,
    instrumentId: 9,
    instrumentTitle: 'Patents Act 1994',
    amendsAnotherAct: false,
    headingPath: 'Part IX > 69 Restrictions on recovery of damages',
    citation: 'https://sso.agc.gov.sg/Act/PA1994#pr69-',
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 9, instrumentTitle: 'Patents Act 1994', rank: 1 },
];
const coverage = {
  sectionsIndexed: 300,
  sectionsRead: 300,
  queries: 8,
  depth: 40,
  instrumentsConsidered: 12,
} as const;

describe('a restriction that waits on a condition', () => {
  it('does not reach every circumstance merely by naming no sector', () => {
    const d = decide({
      indicator: patentEnforcement,
      economy: 'SGP',
      evidence: [evidence({ conditionWords: 'who proves that the defendant was not aware' })],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(0.5);
    expect(d.decidingFact).toContain('one sector-specific');
  });

  it('still reaches the top band when it applies from the moment it commences', () => {
    const d = decide({
      indicator: patentEnforcement,
      economy: 'SGP',
      evidence: [evidence({ conditionWords: null })],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(1);
    expect(d.decidingFact).toContain('every sector');
  });

  it('counts two conditional restrictions the way it counts two narrow ones', () => {
    // The band's own second route to the top is "more than one measure of category (2)", and the
    // rule counts measures rather than provisions -- so two findings of the same measure are one
    // measure, exactly as two sector-specific findings of it already were. 4.3 declares a single
    // measure, which leaves that route unreachable for this indicator; that is the rubric's own
    // shape and not something this change introduced, and it is recorded here so it stays visible.
    const d = decide({
      indicator: patentEnforcement,
      economy: 'SGP',
      evidence: [
        evidence({ conditionWords: 'who proves that the defendant was not aware' }),
        evidence({
          measure: 'patent-enforcement-restriction',
          conditionWords: 'committed before the decision to allow the amendment',
          quote: 'the court must not award any damages in proceedings for an infringement of the patent committed before the decision to allow the amendment',
        }),
      ],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(0.5);
    expect(d.basis).toHaveLength(2);
  });

  it('leaves a reading banked before the question was asked exactly as it was', () => {
    // Undefined, not null: the field was never put to that reader, and treating its silence as
    // "unconditional" is the only reading that keeps an old run scoring as it scored.
    const d = decide({
      indicator: patentEnforcement,
      economy: 'SGP',
      evidence: [evidence({})],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(1);
  });
});
