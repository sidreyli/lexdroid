/**
 * What a provision is about, as opposed to what it does.
 *
 * Every case below is a real reading from the twelve-pillar run, and every one of them answered
 * every question correctly. The Competition Commission really must open an account with a bank in
 * Malaysia; the Kenaf and Tobacco Board really does issue licences; the Competition and Consumer
 * Act really does ban goods from being imported. Each scored the maximum on an indicator about
 * something else, because nothing had ever asked what the provision was about.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { MEASURES, SUBJECTS } from '../src/rubric/measures.js';
import { loadRubric } from '../src/rubric/index.js';
import type { Finding } from '../src/read/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '12.3',
    measure: 'ecommerce-licence',
    dutyBearer: 'a person',
    dutyAct: 'shall hold a licence',
    dutyForce: 'requires',
    roleWords: null,
    definingWords: 'a licence',
    subjectWords: 'the sale of goods online',
    borderWords: null,
    imposingWords: 'shall hold a licence',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'a person shall hold a licence to sell goods online',
    requirement: 'Selling online requires a licence.',
    sectorScope: 'all',
    sector: null,
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
  { instrumentId: 1, instrumentTitle: 'Electronic Commerce Act 2006', rank: 1 },
];
const coverage = { sectionsRead: 24, sectionsIndexed: 19000, instrumentsConsidered: 8 };

function at(id: string, over: Partial<Finding> = {}) {
  const evidence: Evidence[] = [
    {
      finding: finding({ indicatorId: id, ...over }),
      sectionId: 1,
      instrumentId: 1,
      instrumentTitle: 'Electronic Commerce Act 2006',
      amendsAnotherAct: false,
      headingPath: 'Part II > 5',
      citation: 'https://example.gov.my/eca#s5',
    },
  ];
  return decide({ indicator: indicator(id), economy: 'MYS', evidence, surfaced, coverage });
}

describe('a provision that does the right thing to the wrong subject', () => {
  it('scores an e-commerce licence that says what is being licensed', () => {
    expect(at('12.3').score).toBe(1);
  });

  it('holds the Kenaf and Tobacco Board licence, which names no online selling', () => {
    const d = at('12.3', {
      quote: 'A licence, an approval or a certificate of authorization may be issued subject to such conditions',
      dutyBearer: 'the Board',
      definingWords: 'a licence, an approval or a certificate of authorization',
      subjectWords: null,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain(SUBJECTS['12.3']);
  });

  it('holds a commission’s own bank account, which names no online payment', () => {
    const d = at('12.4.1', {
      measure: 'local-bank-account',
      quote: 'The Commission shall open and maintain an account or accounts with such bank or banks in Malaysia',
      dutyBearer: 'the Commission',
      dutyBearerKind: 'government',
      definingWords: 'an account or accounts with such bank or banks in Malaysia',
      subjectWords: null,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain(SUBJECTS['12.4.1']);
  });

  // The subject answered with the measure's own words is not refused for being those words --
  // sixty of the eighty measures define themselves by naming their subject. It is refused when
  // the words name nothing in this indicator's world, which is what the domain test asks.
  it('holds a subject whose words belong to another world, however they were arrived at', () => {
    const d = at('12.3', {
      definingWords: 'a licence, an approval or a certificate of authorization',
      subjectWords: 'a licence, an approval or a certificate',
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('is not the online selling');
  });

  it('lets through a subject given in the measure own words, where it is in the domain', () => {
    const d = at('12.3', {
      definingWords: 'a licence to sell goods online',
      subjectWords: 'a licence to sell goods online',
    });
    expect(d.score).toBe(1);
  });

  it('holds a subject answered with the party bound', () => {
    const d = at('12.3', { dutyBearer: 'the Board', subjectWords: 'the Board' });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('naming the party bound');
  });

  it('leaves pillars 6 and 7 alone, where the subject is already asked three other ways', () => {
    for (const id of ['6.1', '6.2', '6.3', '6.4', '7.3', '7.4', '7.5']) {
      expect(SUBJECTS[id], id).toBeUndefined();
    }
  });

  it('declares a subject for every other indicator the rubric gives measures to', () => {
    for (const id of Object.keys(MEASURES)) {
      if (id.startsWith('6.') || id.startsWith('7.')) continue;
      expect(SUBJECTS[id], id).toBeTruthy();
    }
  });

  it('lets a catch-all measure record a restriction on something this indicator does not score', () => {
    // 10.1's other-import-ban exists to say "a ban, and not on ICT". Holding it for naming no ICT
    // goods would discard the very findings it was written to keep.
    const ban = MEASURES['10.1']?.find((m) => m.token === 'other-import-ban');
    expect(ban?.offSubject).toBe(true);
  });
});
