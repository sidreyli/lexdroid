/**
 * Bands that are proportions, and provisions that state none.
 *
 * 3.1, 5.2 and 12.01 descend the same ladder: no shares at all, a minority, a controlling but not
 * a full stake, no limit. In the twelve-pillar run all three economies reached the top rung of all
 * three indicators, and every cell reported the same sentence -- because the rung was taken from
 * the label the reader chose and never from the words of the provision.
 *
 * Each quote below is from that run.
 */
import { describe, expect, it } from 'vitest';
import { decide, statedProportion, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { loadRubric } from '../src/rubric/index.js';
import type { Finding } from '../src/read/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '3.1',
    measure: 'foreign-equity-ban',
    dutyBearer: 'a foreign person',
    dutyAct: 'may not hold',
    dutyForce: 'forbids',
    roleWords: null,
    definingWords: 'no shares in a licensee may be held by a foreign person',
    subjectWords: 'a data centre operator',
    borderWords: null,
    imposingWords: 'may not hold',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'no shares in a licensee may be held by a foreign person',
    requirement: 'Foreign ownership is prohibited.',
    sectorScope: 'specific',
    sector: 'data centres',
    dataScope: 'non-personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    authorisation: 'unstated',
    ...over,
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Foreign Acquisitions and Takeovers Act 1975', rank: 1 },
];
const coverage = { sectionsRead: 24, sectionsIndexed: 32591, instrumentsConsidered: 8 };

function at(id: string, over: Partial<Finding> = {}) {
  const evidence: Evidence[] = [
    {
      finding: finding({ indicatorId: id, ...over }),
      sectionId: 1,
      instrumentId: 1,
      instrumentTitle: 'Foreign Acquisitions and Takeovers Act 1975',
      amendsAnotherAct: false,
      headingPath: 'Part 3 > 55',
      citation: 'https://legislation.gov.au/fata#s55',
    },
  ];
  return decide({ indicator: indicator(id), economy: 'AUS', evidence, surfaced, coverage });
}

describe('reading a proportion out of the provision', () => {
  it('finds a total exclusion', () => {
    expect(statedProportion('no shares may be held by a foreign person')).toBe('none');
    expect(statedProportion('the company must be wholly owned by citizens')).toBe('none');
    expect(statedProportion('a foreign person must not hold any shares in the licensee')).toBe('none');
  });

  it('finds a figure, from either end', () => {
    expect(statedProportion('not more than 30% of the shares')).toBe('some');
    expect(statedProportion('at least 70 per cent must be held by citizens')).toBe('some');
    expect(statedProportion('no individual shall hold more than ten per cent of interest in shares')).toBe('some');
    expect(statedProportion('a majority of the shares')).toBe('some');
  });

  it('finds none where the provision states none', () => {
    expect(statedProportion('must hold an Australian financial services licence')).toBeNull();
    expect(statedProportion('limitation on ownership of certain licensees')).toBeNull();
    expect(
      statedProportion('The shareholding of the company shall comply with relevant Malaysian foreign investment restrictions'),
    ).toBeNull();
    expect(statedProportion(null)).toBeNull();
  });
});

describe('a band that is a proportion', () => {
  it('scores a ban the provision actually states', () => {
    expect(at('3.1').score).toBe(1);
  });

  for (const [id, measure] of [
    ['3.1', 'foreign-equity-ban'],
    ['5.2', 'telecom-equity-ban'],
    ['12.01', 'ecommerce-equity-ban'],
  ] as const) {
    it(`holds ${id} where the provision states no proportion`, () => {
      const d = at(id, {
        measure,
        definingWords: 'The shareholding of the company shall comply with relevant Malaysian foreign investment restrictions',
        quote: 'The shareholding of the company shall comply with relevant Malaysian foreign investment restrictions',
      });
      expect(d.score).toBe(0);
      expect(d.held[0]?.reason).toContain('states no proportion');
    });
  }

  it('does not call a stated figure a total exclusion', () => {
    // "No individual shall hold more than ten per cent" was filed as a ban in Malaysia. It is a
    // limit: some shares may be held. Which rung that is the figure alone does not say.
    const d = at('5.2', {
      measure: 'telecom-equity-ban',
      definingWords: 'ten per cent of interest in shares of a licensed person',
      quote: 'No individual shall hold more than ten per cent of interest in shares of a licensed person',
    });
    expect(d.score).not.toBe(1);
  });
  // The other half of the same band: the proportion is what a foreign person may hold. Malaysia's
  // telecom equity cell was decided by the Financial Services Act, which caps every shareholder.
  it('rules out a limit that binds every holder alike, whatever proportion it states', () => {
    const d = at('5.2', {
      measure: 'telecom-equity-controlling',
      dutyBearer: 'no person',
      definingWords: 'more than fifty per cent',
      subjectWords: 'a licensed person',
      quote: 'no person shall acquire any interest in shares of a licensed person by which he would hold more than fifty per cent',
    });
    expect(d.score).toBe(0);
    expect(d.excluded.some((e) => e.reason.includes('limits what anyone may hold'))).toBe(true);
  });

  it('keeps a limit stated as a floor on the share that must stay in local hands', () => {
    const d = at('3.1', {
      measure: 'foreign-equity-minority',
      dutyBearer: 'the licensee',
      definingWords: 'at least 51% of the shares are held by Malaysian citizens',
      subjectWords: 'a data centre operator',
      quote: 'the licensee must ensure at least 51% of the shares are held by Malaysian citizens',
    });
    expect(d.excluded.some((e) => e.reason.includes('limits what anyone may hold'))).toBe(false);
  });
});
