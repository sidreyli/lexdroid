/**
 * What a zero is allowed to say, on the fourteen indicators where a zero is the good news.
 *
 * Restrictiveness runs 1 worst to 0 best, and on most indicators a zero means nothing was found.
 * On fourteen of them the polarity is flipped -- "Presence of effective protection of trade
 * secrets", "Passive sharing is mandated" -- and there a zero means a provision WAS found and
 * says so. The cell still has to cite it. Reading "was anything found?" off the sign of the score
 * got that backwards: Australia's trade-secrets cell reported effective protection and cited no
 * provision at all, only the instrument it had been read against, which is the record a cell
 * keeps when it found nothing.
 *
 * The second half is what that citation exposed once it existed. Both of 4.1's measures name a
 * trade secret, so naming one cannot be what tells them apart; the rubric separates them by
 * whether the holder is given a remedy. Words copied straight from the subject -- "trade secret"
 * offered as what makes the provision a remedy -- make out the clause, not the remedy.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const tradeSecrets: Indicator = {
  id: '4.1',
  pillarId: 4,
  pillarName: 'Intellectual Property Rights',
  category: 'Lack of effective trade secrets legal framework',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Lack of trade secrets legal framework that is able to provide effective protection', ordinal: 1 },
    { score: 0.5, criterion: 'Limited practice/scope addressing protection of trade secrets OR practices with certain clauses included in the IP law/ relevant law', ordinal: 2 },
    { score: 0, criterion: 'Presence of effective protection of trade secrets protection in any forms', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function finding(over: Partial<Finding>): Finding {
  return {
    indicatorId: '4.1',
    measure: 'trade-secret-protection',
    dutyBearer: 'a person',
    dutyAct: 'is liable',
    dutyForce: 'requires',
    roleWords: null,
    definingWords: 'liable in damages for the unauthorised use',
    subjectWords: 'trade secret',
    borderWords: null,
    imposingWords: 'is liable',
    prescribingWords: null,
    dutyBearerKind: 'individual',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: 'trade secret',
    keepingWords: null,
    authorisingWords: null,
    quote: 'a person who uses a trade secret without consent is liable in damages to the holder',
    requirement: 'The holder may recover damages for misuse.',
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
  } as Finding;
}

function evidence(instrumentId: number, instrumentTitle: string, over: Partial<Finding>): Evidence {
  return {
    finding: finding(over),
    sectionId: instrumentId * 100,
    instrumentId,
    instrumentTitle,
    amendsAnotherAct: false,
    headingPath: 'Part 2 > 18 Misuse of trade secrets',
    citation: 'https://www.legislation.gov.au/C2004A00109#s18',
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Trade Secrets Act 1990', rank: 1 },
];
const coverage = {
  sectionsIndexed: 400,
  sectionsRead: 400,
  queries: 8,
  depth: 40,
  instrumentsConsidered: 12,
} as const;

describe('a zero that means the protection is there', () => {
  it('cites the provision it was decided from, not the instrument it was read against', () => {
    const d = decide({
      indicator: tradeSecrets,
      economy: 'AUS',
      evidence: [evidence(1, 'Trade Secrets Act 1990', {})],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(0);
    // The score says no restriction. The evidence says a provision was found, and both are true.
    expect(d.state).toBe('no-restriction');
    expect(d.basis).toHaveLength(1);
    expect(d.basis[0]?.instrumentTitle).toBe('Trade Secrets Act 1990');
    // Nothing was concluded from silence, so there is no instrument standing in for silence.
    expect(d.absence).toBeNull();
  });

  it('still reports an absence when the band was reached with nothing counted', () => {
    // The same indicator, the same instrument, no qualifying provision: here the zero-equivalent
    // band is the top one, and the cell has only the instrument it read to point at.
    const d = decide({
      indicator: tradeSecrets,
      economy: 'AUS',
      evidence: [],
      surfaced,
      coverage,
    });

    expect(d.basis).toEqual([]);
    expect(d.score).not.toBe(0);
  });
});

describe('telling 4.1 two measures apart', () => {
  it('does not accept the subject copied back as the words giving a remedy', () => {
    // "trade secret" is what the provision is about. Offered as what makes it a remedy, it says
    // only that the provision mentions the subject -- which the weaker measure does too.
    const d = decide({
      indicator: tradeSecrets,
      economy: 'AUS',
      evidence: [
        evidence(1, 'Competition and Consumer Act 2010', {
          definingWords: 'trade secret',
          quote: 'Nothing in this Division requires the giving of information the disclosure of which would reveal a trade secret',
        }),
      ],
      surfaced,
      coverage,
    });

    expect(d.score).not.toBe(0);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('trade secret');
  });

  it('lands on the clause band when a duty of confidence is all that was found', () => {
    const d = decide({
      indicator: tradeSecrets,
      economy: 'AUS',
      evidence: [
        evidence(1, 'Family Law Act 1975', {
          measure: 'trade-secret-clause',
          definingWords: 'obligation not to disclose',
          dutyBearer: 'the confidant',
          quote: 'persons under an obligation not to disclose communications made to them',
        }),
      ],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(0.5);
    expect(d.decidingFact).toContain('confidentiality clauses');
    expect(d.basis).toHaveLength(1);
  });

  it('keeps counting a remedy that says it is one', () => {
    const d = decide({
      indicator: tradeSecrets,
      economy: 'AUS',
      evidence: [evidence(1, 'Trade Secrets Act 1990', { definingWords: 'liable in damages for the unauthorised use' })],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(0);
    expect(d.decidingFact).toContain('remedy');
  });
});
