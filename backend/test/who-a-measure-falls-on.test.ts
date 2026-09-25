/**
 * Three findings that were right about the provision and wrong about the measure, or the reverse.
 *
 *   A regulator established by statute was ruled out because the reader copied its name, and a name
 *   never says it is established. The provision does.
 *
 *   A duty on the compulsory licensee scored as a restriction on the patentee, whom it protects.
 *
 *   The Act that sets up an anti-dumping regime scored as a trade defence measure on ICT goods,
 *   when it names no goods at all.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const indicator = (id: string, pillarId: number, bands: [number, string][]): Indicator => ({
  id,
  pillarId,
  pillarName: 'test',
  category: 'test',
  exception: null,
  criteriaText: '...',
  bands: bands.map(([score, criterion], n) => ({ score, criterion, ordinal: n + 1 })),
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
});

const regulator = indicator('5.7', 5, [
  [1, 'No independent telecom authority'],
  [0, 'Independent telecom authority is established'],
]);
const enforcement = indicator('4.3', 4, [
  [1, 'For any restriction with high impact'],
  [0.5, 'For any restriction with limited impact'],
  [0, 'No restriction'],
]);
const tradeDefence = indicator('1.4', 1, [
  [1, 'More than three measures'],
  [0.75, 'Three measures'],
  [0.5, 'Two measures'],
  [0.25, 'One measure'],
  [0, 'No measure'],
]);

function ev(indicatorId: string, over: Partial<Finding>, title = 'An Act'): Evidence {
  const finding = {
    indicatorId,
    measure: null,
    quote: '',
    subclause: 's 6',
    dutyBearer: 'a person',
    dutyAct: 'must',
    dutyForce: 'requires',
    requirement: 'specific',
    sectorScope: 'all',
    sector: null,
    dataScope: 'non-personal',
    dataDescription: null,
    scopeUnstated: false,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    roleWords: null,
    definingWords: null,
    subjectWords: null,
    borderWords: null,
    imposingWords: null,
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    ...over,
  } as unknown as Finding;
  return {
    finding,
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: title,
    headingPath: 'Part 1',
    citation: 'https://example.gov/act#s6',
    amendsAnotherAct: false,
  } as Evidence;
}

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'An Act', rank: 1 }];
const coverage = { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 };
const score = (i: Indicator, e: Evidence[]) => decide({ indicator: i, economy: 'AUS', evidence: e, surfaced, coverage });

describe('a regulator named by the reader and established by the provision', () => {
  const established = (definingWords: string, quote: string) =>
    ev('5.7', {
      measure: 'independent-telecom-authority',
      dutyForce: 'declares',
      dutyBearer: 'the Communications Authority',
      definingWords,
      subjectWords: 'Communications Authority',
      quote,
    });

  it('counts where the provision says the body is established, whatever noun was copied', () => {
    const d = score(regulator, [established('Authority', 'The Communications Authority is established by this section.')]);
    expect(d.basis).toHaveLength(1);
    expect(d.score).toBe(0);
  });

  it('still rules out a provision that only names the body', () => {
    const d = score(regulator, [established('Authority', 'The Communications Authority must report to the Minister.')]);
    expect(d.basis).toHaveLength(0);
  });
});

describe('a restriction on enforcing a patent', () => {
  const restriction = (dutyBearer: string) =>
    ev(
      '4.3',
      {
        measure: 'patent-enforcement-restriction',
        dutyBearer,
        definingWords: 'the patented invention',
        subjectWords: 'patented invention',
        imposingWords: 'is not entitled',
        quote: 'is not entitled to an injunction in respect of the patented invention',
      },
      'Patents Act',
    );

  it('is not made out by a duty on the licensee, which protects the patentee', () => {
    for (const bearer of ['the licensee', 'the beneficiary of the compulsory licence']) {
      const d = score(enforcement, [restriction(bearer)]);
      expect(d.basis).toHaveLength(0);
      expect(d.excluded[0]?.reason).toContain('falls on the patentee');
    }
  });

  it('still counts where the patentee is bound', () => {
    const d = score(enforcement, [restriction('the patentee')]);
    expect(d.basis).toHaveLength(1);
  });
});

describe('a trade defence measure on ICT goods', () => {
  const duty = (subjectWords: string) =>
    ev('1.4', {
      measure: 'trade-defence-measure',
      dutyBearer: 'an importer',
      dutyAct: 'shall pay',
      definingWords: 'an anti-dumping duty is imposed',
      imposingWords: 'is imposed',
      borderWords: 'imported',
      subjectWords,
      quote: `An anti-dumping duty is imposed on ${subjectWords} imported from the named country`,
    });

  it('counts where the goods charged are ICT goods', () => {
    expect(score(tradeDefence, [duty('mobile handsets')]).basis).toHaveLength(1);
  });

  it('does not count the regime itself, or duty on goods of another kind', () => {
    expect(score(tradeDefence, [duty('the subject goods')]).basis).toHaveLength(0);
    expect(score(tradeDefence, [duty('newsprint in rolls')]).basis).toHaveLength(0);
  });
});
