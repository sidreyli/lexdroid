/**
 * Pillars 6 and 8, where a score turned on words the rules could not see.
 *
 * A copy of a report put out for fifteen days so that those affected could read it was counted as
 * a second local storage measure. A Thai notice binding every "service provider" to verify its
 * users was held because the provider is an Internet access provider only by the notice's own
 * definition, and the online domains spoke only English.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence } from '../src/decide/index.js';
import { type Finding } from '../src/read/index.js';
import { definitionIn } from '../src/parse/identity.js';
import { MEASURE_DOMAIN } from '../src/rubric/measures.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

function evidence(sectionId: number, instrumentId: number, instrumentTitle: string, over: Partial<Finding>): Evidence {
  return {
    finding: {
      indicatorId: '6.2',
      measure: 'local-storage',
      dutyBearer: 'every company',
      dutyAct: 'must keep',
      dutyForce: 'requires',
      roleWords: null,
      definingWords: 'kept at a place in Singapore',
      subjectWords: 'accounting records',
      borderWords: null,
      imposingWords: 'must',
      prescribingWords: null,
      dutyBearerKind: 'organisation',
      scopeUnstated: false,
      placeWords: 'in Singapore',
      exceptionWords: null,
      locatedData: 'accounting records',
      informationWords: 'records',
      keepingWords: 'must keep',
      authorisingWords: null,
      quote: 'the accounting records must be kept at a place in Singapore',
      requirement: 'Records kept in the economy.',
      sectorScope: 'specific',
      sector: 'companies',
      dataScope: 'non-personal',
      dataDescription: null,
      appliesOnlyToGovernmentData: false,
      mandatory: true,
      countriesNamed: [],
      statedPeriod: null,
      authorisation: 'none',
      ...over,
    },
    sectionId,
    instrumentId,
    instrumentTitle,
    amendsAnotherAct: false,
    headingPath: 'x',
    citation: 'https://example.gov/x',
  };
}

const coverage = { sectionsRead: 10, sectionsIndexed: 100, instrumentsConsidered: 5 };
const at = (evs: Evidence[]) => decide({ indicator: indicator('6.2'), economy: 'SGP', evidence: evs, coverage });

describe('a copy put out for inspection for a few days', () => {
  const records = evidence(1, 1, 'Companies Act', {});
  const notice = evidence(2, 2, 'Payment Services Act', {
    dutyBearer: 'the transferor and the transferee',
    quote:
      'the transferor and the transferee must keep at their respective offices in Singapore, for inspection by any person that may be affected by the transfer, a copy of the report',
    definingWords: 'at their respective offices in Singapore',
    locatedData: 'a copy of the report',
    sector: 'payment services',
    statedPeriod: '15 days',
  });

  it('is not a second place the data must be kept', () => {
    expect(at([records, notice]).score).toBe(0.5);
  });

  it('while a register open to inspection with no end still is', () => {
    const register = evidence(3, 3, 'Securities Act', {
      quote: 'must keep a register of its members at its registered office in Singapore, open to inspection by any member',
      sector: 'securities',
    });
    expect(at([records, register]).score).toBe(1);
  });
});

describe('a term the instrument defines', () => {
  it('is read to the end of its entry, in either language', () => {
    const th = 'ข้อ ๔ ในประกาศนี้ "ผู้ให้บริการ" หมายความว่า ผู้ให้บริการอินเทอร์เน็ต "ผู้ใช้บริการ" หมายความว่า ผู้ใช้บริการของผู้ให้บริการ';
    expect(definitionIn(th, 'ผู้ให้บริการ')).toBe('ผู้ให้บริการอินเทอร์เน็ต');
    expect(definitionIn('"service provider" means a provider of access to the Internet;', 'the service provider')).toMatch(/access to the Internet/);
    expect(definitionIn(th, 'บริษัท')).toBeNull();
  });
});

describe('the online domains read Thai', () => {
  it('an Internet provider and material on a computer system', () => {
    expect(MEASURE_DOMAIN['user-identity']!.test('ผู้ให้บริการอินเทอร์เน็ต')).toBe(true);
    expect(MEASURE_DOMAIN['content-removal']!.test('ข้อมูลคอมพิวเตอร์')).toBe(true);
    expect(MEASURE_DOMAIN['content-removal']!.test('ข้อมูลส่วนบุคคล')).toBe(false);
    expect(MEASURE_DOMAIN['user-monitoring']!.test('ธนาคารพาณิชย์')).toBe(false);
  });
});

describe('a Thai ban on processing data outside the Kingdom', () => {
  const quote = 'ห้ามมิให้บริษัทข้อมูลเครดิตประมวลผลข้อมูลภายนอกราชอาณาจักร';
  const ban = evidence(4, 4, 'พระราชบัญญัติการประกอบธุรกิจข้อมูลเครดิต', {
    indicatorId: '6.1',
    measure: 'transfer-ban',
    quote,
    dutyBearer: 'บริษัทข้อมูลเครดิต',
    dutyAct: 'ห้ามมิให้...ประมวลผลข้อมูล',
    dutyForce: 'forbids',
    placeWords: 'ภายนอกราชอาณาจักร',
    definingWords: 'ภายนอกราชอาณาจักร',
    borderWords: 'ภายนอกราชอาณาจักร',
    keepingWords: 'ภายนอกราชอาณาจักร',
    imposingWords: 'ห้ามมิให้',
    locatedData: null,
    informationWords: null,
    subjectWords: 'ข้อมูล',
    sector: 'บริษัทข้อมูลเครดิต',
    dataScope: 'all',
  });

  it('names its data as the subject, calls it information in Thai, and names the Kingdom', () => {
    expect(decide({ indicator: indicator('6.1'), economy: 'THA', evidence: [ban], coverage }).score).toBe(0.5);
  });
});
