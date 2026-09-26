/**
 * An English-word test says nothing about a provision that is not in English.
 *
 * The localisation gates ask the reader's copied words for a word meaning information and a word
 * naming a place. "сведения" is Russian for information and "ສປປ ລາວ" is the Lao PDR, and neither
 * can pass an English list or a capital-letter test. Ruling them out on it built zeros for Russia
 * and Lao out of provisions that say the opposite; they are held, and English is unchanged.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const storage: Indicator = {
  id: '6.2',
  pillarId: 6,
  pillarName: 'test',
  category: 'test',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Data must be stored locally', ordinal: 1 },
    { score: 0, criterion: 'No local storage requirement', ordinal: 2 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function ev(over: Partial<Finding>, sectionLanguage: string | null): Evidence {
  const finding = {
    indicatorId: '6.2',
    measure: 'local-storage',
    quote: '',
    subclause: 'ст. 18',
    dutyBearer: 'оператор',
    dutyAct: 'обязан обеспечить',
    dutyForce: 'requires',
    requirement: 'specific',
    sectorScope: 'all',
    sector: null,
    dataScope: 'personal',
    dataDescription: null,
    scopeUnstated: false,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    placeWords: null,
    exceptionWords: null,
    locatedData: 'персональных данных граждан',
    informationWords: 'сведения',
    keepingWords: 'хранение',
    authorisingWords: null,
    roleWords: null,
    subjectWords: null,
    borderWords: null,
    imposingWords: 'обязан',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    ...over,
    definingWords: over.definingWords ?? over.placeWords ?? null,
  } as unknown as Finding;
  return {
    finding,
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: 'Law',
    headingPath: 'Law',
    citation: 'https://example.test/law#1',
    amendsAnotherAct: false,
    sectionLanguage,
  } as Evidence;
}

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'Law', rank: 1 }];
const coverage = { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 };
const score = (e: Evidence) => decide({ indicator: storage, economy: 'RUS', evidence: [e], surfaced, coverage });

describe('an English-word gate on a provision in another language', () => {
  it('holds a Russian finding whose information word is Russian', () => {
    const d = score(ev({ placeWords: 'на территории Российской Федерации' }, 'ru'));
    expect(d.excluded.map((x) => x.reason).join()).not.toContain('not information');
    expect(d.held.map((x) => x.reason).join()).toContain('not information -- but the provision is in ru');
  });

  it('holds a Lao finding whose place has no capital letter to find', () => {
    const d = score(ev({ placeWords: 'ພາຍໃນ ສປປ ລາວ', informationWords: 'ຂໍ້ມູນ data' }, 'lo'));
    expect(d.held.map((x) => x.reason).join()).toContain('names no country, territory or jurisdiction -- but the provision is in lo');
  });

  it('still rules out an English provision that calls the thing something other than information', () => {
    const d = score(ev({ placeWords: 'in Singapore', informationWords: 'any payment' }, 'en'));
    expect(d.excluded.map((x) => x.reason).join()).toContain('which is not information');
  });
});
