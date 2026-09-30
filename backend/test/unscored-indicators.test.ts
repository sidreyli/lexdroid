/**
 * The seven indicators that had no scoring rule.
 *
 * Three of them are one question asked of three sectors, one compares a customs threshold with a
 * line drawn in dollars, two are readable from law as far as law goes, and one is not readable
 * from law at all and says so. The point of these tests is that each is answered the way its own
 * band text is written, and that the one that cannot be answered is declared rather than guessed.
 */
import { describe, expect, it } from 'vitest';
import { decide, NOT_IN_LAW, UNREACHABLE_BANDS, __rules, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { inUsd, moneyIn, type FxRates } from '../src/decide/currency.js';
import { indicator, loadRubric } from '../src/rubric/index.js';
import type { Finding } from '../src/read/index.js';

const RATES: FxRates = {
  base: 'USD',
  asOf: '2026-01-02',
  source: 'a test',
  fetchedAt: '2026-01-02T00:00:00.000Z',
  usdPer: { SGD: 0.75, MYR: 0.24, AUD: 0.66 },
};

function finding(over: Partial<Finding>): Finding {
  return {
    indicatorId: '', measure: null, dutyBearer: 'a foreign person', dutyAct: 'may not hold',
    dutyForce: 'requires', placeWords: null, exceptionWords: null, locatedData: null,
    informationWords: null, keepingWords: null, roleWords: null, definingWords: 'not more than 30%',
    subjectWords: 'the telecommunications sector',
    borderWords: null,
    imposingWords: 'may not hold', prescribingWords: null, dutyBearerKind: 'organisation',
    quote: 'a foreign person may not hold more than 30% of the shares', requirement: 'r',
    sectorScope: 'specific', sector: 'broadcasting', dataScope: 'non-personal', dataDescription: null,
    scopeUnstated: false, appliesOnlyToGovernmentData: false, mandatory: true, countriesNamed: [],
    statedPeriod: null, authorisation: 'none', authorisingWords: null, ...over,
  };
}

function ev(indicatorId: string, measure: string, over: Partial<Finding> = {}, n = 1): Evidence {
  return {
    finding: finding({ indicatorId, measure, ...over }),
    sectionId: n, instrumentId: n, instrumentTitle: `Act ${n}`, headingPath: 'Part 1',
    citation: 'https://example.gov/act#s1', amendsAnotherAct: false,
  };
}

const surfaced = (n = 1): SurfacedInstrument[] => [{ instrumentId: n, instrumentTitle: `Act ${n}`, rank: 1 }];

function score(id: string, evidence: Evidence[], economy = 'SGP'): number | null {
  return decide({
    indicator: indicator(id),
    economy,
    evidence,
    surfaced: surfaced(evidence[0]?.instrumentId ?? 1),
    coverage: { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 },
    rates: RATES,
  }).score;
}

describe('every indicator can now be answered or says why not', () => {
  it('has a rule, a framework reading, or a declaration', () => {
    const orphans = loadRubric()
      .indicators.filter((i) => !__rules[i.id] && i.shape !== 'framework' && !NOT_IN_LAW[i.id])
      .map((i) => i.id);
    expect(orphans).toEqual([]);
  });
});

describe('the foreign-equity ladder', () => {
  // 3.1's subject is a sector relevant to digital trade, which the words or the title must name.
  const e31 = (measure: string, over: Partial<Finding> = {}, n = 1) =>
    ev('3.1', measure, { subjectWords: over.sector ?? 'broadcasting', ...over }, n);

  it('scores a ban at the top of 3.1', () => {
    expect(score('3.1', [e31('foreign-equity-ban', { definingWords: 'no shares may be held by a foreign person' })])).toBe(1);
  });

  it('scores one minority limit in one sector at 0.8', () => {
    expect(score('3.1', [e31('foreign-equity-minority')])).toBe(0.8);
  });

  it('promotes minority limits in two sectors to the top band, as 3.1 counts sectors', () => {
    const two = [e31('foreign-equity-minority', { sector: 'broadcasting' }, 1), e31('foreign-equity-minority', { sector: 'banking' }, 2)];
    expect(score('3.1', two)).toBe(1);
  });

  it('leaves two minority limits in the same sector at 0.8', () => {
    const same = [e31('foreign-equity-minority', { sector: 'broadcasting' }, 1), e31('foreign-equity-minority', { sector: 'broadcasting' }, 2)];
    expect(score('3.1', same)).toBe(0.8);
  });

  it('scores a controlling stake, and a limit that bites only on state-owned firms, at 0.5', () => {
    expect(score('3.1', [e31('foreign-equity-controlling')])).toBe(0.5);
    expect(score('3.1', [e31('foreign-equity-state-owned-only')])).toBe(0.5);
  });

  it('scores nothing found at zero', () => {
    expect(score('3.1', [])).toBe(0);
  });

  it('does not count a cap in a sector unrelated to digital trade', () => {
    expect(score('3.1', [e31('foreign-equity-minority', { sector: 'airports', subjectWords: 'an airport-operator company' })])).toBe(0);
  });

  it('counts measures rather than sectors for 5.2, which is one sector already', () => {
    const one = [ev('5.2', 'telecom-equity-minority', { sector: 'telecommunications' })];
    const two = [
      ev('5.2', 'telecom-equity-minority', { sector: 'telecommunications' }, 1),
      ev('5.2', 'telecom-equity-minority', { sector: 'telecommunications' }, 2),
    ];
    expect(score('5.2', one)).toBe(0.8);
    expect(score('5.2', two)).toBe(1);
  });

  // The subject is given per call: 12.01 is the e-commerce rung of the same ladder, and the file's
  // default names the telecommunications sector, which is 5.2's.
  it("puts a ban in 12.01's top band, whose ladder starts at a minority stake", () => {
    const online = { subjectWords: 'an online marketplace' };
    expect(score('12.01', [ev('12.01', 'ecommerce-equity-ban', { ...online, definingWords: 'no shares may be held by a foreign person' })])).toBe(1);
    expect(score('12.01', [ev('12.01', 'ecommerce-equity-minority', online)])).toBe(1);
    expect(score('12.01', [ev('12.01', 'ecommerce-equity-controlling', online)])).toBe(0.5);
  });

  it("does not count a telecom cap under 3.1, which carves that sector out", () => {
    const telecom = [ev('3.1', 'foreign-equity-minority', { sector: 'the telecommunications sector' })];
    const d = decide({
      indicator: indicator('3.1'),
      economy: 'SGP',
      evidence: telecom,
      surfaced: surfaced(),
      coverage: { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 },
      rates: RATES,
    });
    expect(d.score).toBe(0);
    expect(d.excluded).toHaveLength(1);
    expect(d.excluded[0]?.reason).toMatch(/telecom/i);
  });
});

describe('the de minimis, compared with 200 US dollars', () => {
  // Every threshold below is one on goods arriving, which is what a de minimis is, so each carries
  // the words that say so. The measure is declared `crossesBorder`, and a figure in a revenue
  // statute with nothing crossing is a threshold but not this one.
  const threshold = (words: string, n = 1): Evidence =>
    ev(
      '12.5',
      'de-minimis-threshold',
      {
        definingWords: words,
        dutyForce: 'permits',
        imposingWords: null,
        borderWords: 'goods imported into the economy',
      },
      n,
    );

  it('scores 0.5 for a threshold below the line', () => {
    expect(score('12.5', [threshold('goods not exceeding RM500 in value')], 'MYS')).toBe(0.5);
  });

  it('scores 0 for a threshold at or above it', () => {
    expect(score('12.5', [threshold('goods not exceeding S$400 in value')], 'SGP')).toBe(0);
  });

  it('reads a bare symbol as the economy’s own money', () => {
    expect(score('12.5', [threshold('a customs value not exceeding $1,000')], 'AUS')).toBe(0);
  });

  it('takes the lowest of several thresholds', () => {
    const both = [threshold('not exceeding S$400', 1), threshold('not exceeding S$100', 2)];
    expect(score('12.5', both)).toBe(0.5);
  });

  it('holds a threshold it has no rate for, rather than reporting no threshold', () => {
    const d = decide({
      indicator: indicator('12.5'),
      economy: 'MYS',
      evidence: [threshold('goods not exceeding RM500 in value')],
      surfaced: surfaced(),
      coverage: { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 },
      rates: null,
    });
    expect(d.state).toBe('unresolved');
    expect(d.held[0]?.reason).toMatch(/no exchange rate/i);
  });

  it('holds a threshold the provision states no figure for', () => {
    const d = decide({
      indicator: indicator('12.5'),
      economy: 'SGP',
      evidence: [threshold('such value as may be prescribed')],
      surfaced: surfaced(),
      coverage: { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 },
      rates: RATES,
    });
    expect(d.held[0]?.reason).toMatch(/states no figure/i);
  });

  it('will not report "no de minimis" off a cell that read nothing governing', () => {
    const d = decide({
      indicator: indicator('12.5'),
      economy: 'SGP',
      evidence: [],
      surfaced: surfaced(),
      coverage: { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 },
      rates: RATES,
    });
    expect(d.state).toBe('unresolved');
  });
});

describe('investment screening, as far as law shows it', () => {
  const mechanism = (n: number): Evidence =>
    ev('3.4', 'investment-screening', { definingWords: 'the approval of the Minister', dutyForce: 'permits', imposingWords: null }, n);

  it('scores two mechanisms at 0.5 and one at 0.25', () => {
    expect(score('3.4', [mechanism(1), mechanism(2)])).toBe(0.5);
    expect(score('3.4', [mechanism(1)])).toBe(0.25);
    expect(score('3.4', [])).toBe(0);
  });

  it('declares the top band out of reach rather than approximating it', () => {
    expect(UNREACHABLE_BANDS['3.4']?.[1]).toMatch(/decided case/i);
  });

  // 3.4's own exception: "Anti-trust measures related to M&A are not considered a restriction,
  // unless discriminatory." An ordinary merger-clearance duty under a competition act, applying
  // alike to any acquirer, is not a screening mechanism just because it sits beside genuine ones.
  const competitionAct = (n: number): Evidence => ({
    ...ev(
      '3.4',
      'investment-screening',
      {
        dutyBearer: 'a business operator',
        quote: 'a business operator that will carry out a merger that may create a monopoly must be authorised by the Committee',
      },
      n,
    ),
    instrumentTitle: 'Trade Competition Act',
  });

  it('does not count an ordinary merger-clearance duty under a competition act', () => {
    expect(score('3.4', [competitionAct(1)])).toBe(0);
  });

  it('does not let a competition act inflate a real mechanism into two', () => {
    expect(score('3.4', [mechanism(1), competitionAct(2)])).toBe(0.25);
  });

  it('still counts a competition act review that treats a foreign acquirer differently from a local one', () => {
    const discriminatory: Evidence = {
      ...ev('3.4', 'investment-screening', {
        quote: 'a merger involving a foreign acquirer requires additional clearance not required of a local acquirer',
      }, 1),
      instrumentTitle: 'Trade Competition Act',
    };
    expect(score('3.4', [discriminatory])).toBe(0.25);
  });

  // Mongolia's own merger-clearance procedure names the same exception in its own language:
  // "ЖУРАМ БАТЛАХ ТУХАЙ (өрсөлдөгчийн хувьцааг худалдан авахад дүгнэлт гаргах)" is "Procedure for
  // issuing an opinion on acquiring a competitor's shares", the identical shape as Thailand's and
  // Singapore's Competition Acts, applying alike to any acquirer.
  const mongolianCompetitionAct = (n: number): Evidence => ({
    ...ev(
      '3.4',
      'investment-screening',
      { dutyBearer: 'Төрийн захиргааны байгууллага', quote: 'хувьцаа худалдан авахыг' },
      n,
    ),
    instrumentTitle: 'ЖУРАМ БАТЛАХ ТУХАЙ (өрсөлдөгчийн хувьцааг худалдан авахад дүгнэлт гаргах)',
  });

  it('does not count an ordinary merger-clearance duty under a Mongolian competition procedure', () => {
    expect(score('3.4', [mongolianCompetitionAct(1)])).toBe(0);
  });

  // Russia's own antimonopoly law names the same exception in its own language: Федеральный закон
  // № 135-ФЗ "О защите конкуренции" ("On the protection of competition") requires the antimonopoly
  // authority's pre-approval of transactions with shares or assets of a financial organisation --
  // the identical shape as Thailand's, Singapore's and Mongolia's ordinary merger-clearance regimes,
  // applying alike to any acquirer.
  const russianCompetitionAct = (n: number): Evidence => ({
    ...ev(
      '3.4',
      'investment-screening',
      {
        dutyBearer: 'финансовая организация',
        quote: 'с предварительного согласия антимонопольного органа осуществляются следующие сделки с акциями (долями), активами финансовой организации',
      },
      n,
    ),
    instrumentTitle: 'Федеральный закон от 26.07.2006 № 135-ФЗ "О защите конкуренции"',
  });

  it('does not count an ordinary merger-clearance duty under Russia\'s own competition law', () => {
    expect(score('3.4', [russianCompetitionAct(1)])).toBe(0);
  });
});

describe('blocking and filtering', () => {
  const measure = (token: string): Evidence =>
    ev('9.1', token, { definingWords: 'the website', dutyForce: 'permits', imposingWords: null });

  it('puts blocking above filtering', () => {
    expect(score('9.1', [measure('content-blocking')])).toBe(1);
    expect(score('9.1', [measure('content-filtering')])).toBe(0.5);
    expect(score('9.1', [])).toBe(0);
  });
});

describe('the indicator that law cannot answer', () => {
  it('declares 5.3 rather than leaving it looking unfinished', () => {
    const d = decide({
      indicator: indicator('5.3'),
      economy: 'SGP',
      evidence: [],
      surfaced: surfaced(),
      coverage: { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 },
      rates: RATES,
    });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
    expect(d.decidingFact).toMatch(/not answerable from legislation/i);
    expect(d.rationale).toBe(NOT_IN_LAW['5.3']);
  });
});

describe('money read out of a provision', () => {
  it('reads the figure and the currency the provision names', () => {
    expect(moneyIn('not exceeding S$400', 'SGP')).toEqual({ amount: 400, currency: 'SGD', assumedCurrency: false });
    expect(moneyIn('not exceeding RM500', 'MYS')).toEqual({ amount: 500, currency: 'MYR', assumedCurrency: false });
    expect(moneyIn('goods valued at ₹5,000', 'IND')).toEqual({ amount: 5000, currency: 'INR', assumedCurrency: false });
    expect(moneyIn('goods valued at 5,000 rupees', 'IND')).toEqual({ amount: 5000, currency: 'INR', assumedCurrency: false });
  });

  it('reads a sum a Thai provision states in Thai digits and the Thai word for baht', () => {
    expect(moneyIn('ราคาไม่เกิน ๑,๕๐๐ บาท', 'THA')).toEqual({ amount: 1500, currency: 'THB', assumedCurrency: false });
    expect(moneyIn('มูลค่าไม่เกิน 1,500บาท', 'THA')).toEqual({ amount: 1500, currency: 'THB', assumedCurrency: false });
    expect(moneyIn('ภายใน ๓๐ วัน ตามมาตรา ๕', 'THA')).toBeNull();
  });

  it('falls back to the economy’s own currency for a bare symbol, and says it did', () => {
    expect(moneyIn('not exceeding $1,000', 'AUS')).toEqual({ amount: 1000, currency: 'AUD', assumedCurrency: true });
    expect(moneyIn('not exceeding 5,000', 'IND')).toEqual({ amount: 5000, currency: 'INR', assumedCurrency: true });
  });

  // The first number anywhere, with a currency found anywhere else, read a citation as the sum.
  it('reads the figure the currency is written against, not a citation', () => {
    expect(moneyIn('Goods under section 3 with a value not exceeding S$400', 'SGP')).toEqual({
      amount: 400,
      currency: 'SGD',
      assumedCurrency: false,
    });
    expect(moneyIn('under section 12(1), not exceeding 1,000 ringgit', 'MYS')).toMatchObject({ amount: 1000, currency: 'MYR' });
    expect(moneyIn('within 30 days, goods not exceeding $1,000 under regulation 4', 'AUS')).toMatchObject({ amount: 1000 });
    expect(moneyIn('not exceeding RM 500', 'MYS')).toMatchObject({ amount: 500, currency: 'MYR' });
    expect(moneyIn('a $400 fine', 'SGP')).toEqual({ amount: 400, currency: 'SGD', assumedCurrency: true });
  });

  it('answers nothing where the quote states two different sums', () => {
    expect(moneyIn('S$400, or S$1,000 for alcohol', 'SGP')).toBeNull();
    expect(moneyIn('under section 3 and regulation 7', 'SGP')).toBeNull();
  });

  it('reads no figure where the provision states none', () => {
    expect(moneyIn('such value as may be prescribed', 'SGP')).toBeNull();
    expect(moneyIn(null, 'SGP')).toBeNull();
  });

  it('converts only what the run has a rate for', () => {
    const thb = { amount: 1500, currency: 'THB', assumedCurrency: false };
    expect(inUsd({ amount: 400, currency: 'SGD', assumedCurrency: false }, RATES)).toBe(300);
    expect(inUsd(thb, RATES)).toBeNull();
    expect(inUsd(thb, null)).toBeNull();
    expect(inUsd({ amount: 50, currency: 'USD', assumedCurrency: false }, null)).toBe(50);
  });
});
