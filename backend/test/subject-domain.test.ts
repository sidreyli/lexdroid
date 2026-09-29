/**
 * The subject has to be the one the indicator asks about.
 *
 * A broadcasting licence and an auctioneer's commission both scored the e-commerce licensing cell,
 * and the Bretton Woods Agreements Act scored online payments. Each reading names a real subject,
 * copied from a real provision, belonging to another world -- so the answer is checked against the
 * question rather than merely being present.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

function indicator(id: string, bands: { score: number; criterion: string }[]): Indicator {
  return {
    id,
    pillarId: 12,
    pillarName: 'Online Sales and Transactions',
    category: 'test',
    exception: null,
    criteriaText: '...',
    bands: bands.map((b, n) => ({ ...b, ordinal: n + 1 })),
    shape: 'provision',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
  };
}

const licensing = indicator('12.3', [
  { score: 1, criterion: 'Any license for e-commerce providers' },
  { score: 0, criterion: 'No license' },
]);

const ceiling = indicator('12.4.5', [
  { score: 1, criterion: 'Ceiling on the amount of an electronic payment' },
  { score: 0, criterion: 'No restriction' },
]);

function ev(indicatorId: string, measure: string, subjectWords: string | null): Evidence {
  const finding = {
    indicatorId,
    measure,
    quote: 'a person must hold a licence',
    subclause: 's 8',
    dutyBearer: 'a person',
    dutyAct: 'must hold',
    dutyForce: 'requires',
    requirement: 'specific',
    sectorScope: 'specific',
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
    definingWords: 'licence to sell online',
    subjectWords,
    borderWords: null,
    imposingWords: 'must hold a licence',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
  } as unknown as Finding;
  return {
    finding,
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: 'Act 1',
    headingPath: 'Part 1',
    citation: 'https://example.gov/act#s1',
    amendsAnotherAct: false,
  };
}

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'Act 1', rank: 1 }];
const coverage = { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 };

const score = (ind: Indicator, e: Evidence[]) =>
  decide({ indicator: ind, economy: 'SGP', evidence: e, surfaced, coverage });

describe('a subject outside the indicator’s domain', () => {
  it('holds a licence whose subject is a bank rather than online selling', () => {
    const d = score(licensing, [ev('12.3', 'ecommerce-licence', 'bank')]);
    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded[0]?.reason).toContain('is not the online selling');
  });

  it('scores the same licence where the subject names the online service', () => {
    expect(score(licensing, [ev('12.3', 'ecommerce-licence', 'an online marketplace')]).score).toBe(1);
  });

  it('takes the payment instrument as naming the payment, and legal tender as not', () => {
    // A ceiling is an amount (statesAnAmount), so the provision here states one.
    const capped = (subject: string): Evidence => {
      const e = ev('12.4.5', 'payment-ceiling', subject);
      return { ...e, finding: { ...e.finding, quote: 'the value held must not exceed $5,000' } };
    };
    expect(score(ceiling, [capped('stored value facility')]).score).toBe(1);
    expect(score(ceiling, [capped('note, coin or token')]).score).toBe(0);
  });

  it('leaves a reading that predates the question alone', () => {
    expect(score(licensing, [ev('12.3', 'ecommerce-licence', null)]).score).toBe(0);
  });
});

describe('a bare digital word does not name the payment domain', () => {
  // A Mongolian customs rule banning the posting of "цахим мөнгө" (e-money) and an e-invoicing
  // receipt were both filed under pillar-12.4 measures on nothing more than a bare digital/
  // electronic stem in the subject -- PAYMENT used to inherit ONLINE's "digital"/"цахим"/
  // "электронн" wholesale. The instrument has to name an actual payment instrument or service.
  const restriction = indicator('12.4.7', [
    { score: 1, criterion: 'A restriction on making or receiving a payment' },
    { score: 0, criterion: 'No restriction' },
  ]);
  const restricts = (subject: string): Evidence => {
    const e = ev('12.4.7', 'other-payment-restriction', subject);
    return { ...e, finding: { ...e.finding, quote: 'a person must not transfer more than the stated amount', definingWords: 'must not transfer more than the stated amount' } };
  };

  it('holds a restriction whose subject is only a bare digital record', () => {
    const d = score(restriction, [restricts('a digital record')]);
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('is not');
  });

  it('scores the same restriction where the subject names a payment instrument', () => {
    expect(score(restriction, [restricts('a digital currency')]).score).toBe(1);
    expect(score(restriction, [restricts('a payment service')]).score).toBe(1);
  });

  // "electronic money" is a real payment instrument, named in full -- not the bare "electronic"
  // this describe block is about excluding. Malaysia's and Thailand's own ceilings on it (title:
  // "ELECTRONIC MONEY ... EXEMPTION ORDER"; Thai: "เงินอิเล็กทรอนิกส์") were lost when
  // ONLINE.source came out, because neither language's explicit payment list had named it yet.
  it('still scores "electronic money" and its Thai equivalent, named in full', () => {
    expect(score(restriction, [restricts('electronic money')]).score).toBe(1);
    expect(score(restriction, [restricts('เงินอิเล็กทรอนิกส์')]).score).toBe(1);
  });
});

describe('goods named by their tariff code', () => {
  const tradeDefence = { ...indicator('1.4', [
    { score: 1, criterion: 'More than three measures' },
    { score: 0.75, criterion: 'Three measures' },
    { score: 0.5, criterion: 'Two measures' },
    { score: 0.25, criterion: 'One measure' },
    { score: 0, criterion: 'No measure' },
  ]), pillarId: 1 };
  const duty = (codes?: string[]): Evidence => {
    const e = ev('1.4', 'trade-defence-measure', 'industrial laser machines');
    return {
      ...e,
      finding: { ...e.finding, dutyBearer: 'the importer', quote: 'there shall be levied an anti-dumping duty on industrial laser machines', imposingWords: 'there shall be levied', definingWords: 'there shall be levied an anti-dumping duty' },
      ...(codes ? { ictTariffCodes: codes } : {}),
    };
  };

  it('counts a duty on goods whose name is no ICT word, where the provision states an ICT code', () => {
    expect(score(tradeDefence, [duty(['845690'])]).score).toBeGreaterThan(0);
  });

  it('does not count the same duty where the provision states no ICT code', () => {
    expect(score(tradeDefence, [duty()]).score).toBe(0);
  });

  // The notice as it is written: the State lays the duty, in the present tense, by declaring it.
  const laid = (dutyAct: string): Evidence => {
    const e = duty(['845690']);
    return {
      ...e,
      finding: {
        ...e.finding,
        dutyBearer: 'the Central Government',
        dutyBearerKind: 'government',
        dutyAct,
        dutyForce: 'declares',
        quote: `the Central Government hereby ${dutyAct} on the subject goods an anti-dumping duty`,
        definingWords: `${dutyAct} on the subject goods an anti-dumping duty`,
      },
    };
  };

  it('counts the words laying the duty, though the State says them and they declare', () => {
    expect(score(tradeDefence, [laid('imposes')]).score).toBeGreaterThan(0);
  });

  it('does not count a duty the provision only refers to as laid already', () => {
    expect(score(tradeDefence, [laid('had imposed')]).score).toBe(0);
  });
});
