/**
 * A limit the law states is a limit, whatever verb states it.
 *
 * Malaysia's e-money exemption gives its ceiling as a criterion in a schedule -- "a wallet limit
 * not exceeding RM500 per user" -- and that sentence commands nobody. It is also exactly the
 * answer ESCAP records for the cell. The reader read the verb correctly; the gate that drops
 * declaring provisions was asking a ceiling to command something.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { loadRubric } from '../src/rubric/index.js';
import type { Finding } from '../src/read/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '12.4.5',
    measure: 'payment-ceiling',
    dutyBearer: 'the issuer',
    dutyAct: 'not exceeding',
    dutyForce: 'declares',
    roleWords: null,
    definingWords: 'a wallet limit not exceeding RM500 per user',
    subjectWords: 'electronic money',
    borderWords: null,
    imposingWords: 'not exceeding RM500 per user',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'Electronic money which has a wallet limit not exceeding RM500 per user',
    requirement: 'Limited purpose electronic money is capped at RM500 per user.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'non-personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    ...over,
  } as Finding;
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Financial Services (Limited Purpose Electronic Money) (Exemption) Order 2024', rank: 1 },
];
const coverage = { sectionsRead: 24, sectionsIndexed: 19000, instrumentsConsidered: 8 };

function at(id: string, over: Partial<Finding> = {}) {
  const evidence: Evidence[] = [
    {
      finding: finding({ indicatorId: id, ...over }),
      sectionId: 1,
      instrumentId: 1,
      instrumentTitle: 'Financial Services (Limited Purpose Electronic Money) (Exemption) Order 2024',
      amendsAnotherAct: false,
      headingPath: 'Schedule > 1',
      citation: 'https://example.gov.my/lpem#sch1',
    },
  ];
  return decide({ indicator: indicator(id), economy: 'MYS', evidence, surfaced, coverage });
}

describe('a ceiling stated rather than commanded', () => {
  it('scores the wallet limit ESCAP cites, whose sentence obliges nobody', () => {
    expect(at('12.4.5').score).toBe(1);
  });

  it('still holds a deeming rule on a measure that is a command', () => {
    const d = at('6.1', {
      measure: 'transfer-ban',
      dutyAct: 'is taken to be',
      definingWords: 'is taken to be bound by legally enforceable obligations',
      imposingWords: null,
      placeWords: 'outside Singapore',
      subjectWords: 'personal data',
      quote: 'a recipient outside Singapore is taken to be bound by legally enforceable obligations',
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('declares what is the case');
  });
});
