/**
 * The one thing a provision has to say to be a given measure.
 *
 * Pillar 6 asks for the place and 7.4 asks for the role, and both were written after those
 * pillars were read wrongly. Sixty-three of the seventy-four measures had no such question at
 * all, so a provision could be filed under one of them on resemblance. This is that question
 * asked of every measure, and these tests hold the contract in place as measures are added.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES } from '../src/rubric/measures.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { rejectionFor, __prompt, type Finding } from '../src/read/index.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

const SECTION =
  'Every company shall keep and retain its accounting records at a place within Singapore for a ' +
  'period of not less than 5 years.';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '6.2',
    measure: 'local-storage',
    dutyBearer: 'Every company',
    dutyAct: 'shall keep and retain',
    dutyForce: 'requires',
    roleWords: null,
    definingWords: 'at a place within Singapore',
    subjectWords: null,
    borderWords: null,
    imposingWords: 'shall keep and retain',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: 'within Singapore',
    exceptionWords: null,
    locatedData: 'its accounting records',
    informationWords: 'accounting records',
    keepingWords: 'shall keep and retain its accounting records at a place within Singapore',
    authorisingWords: null,
    quote: SECTION,
    requirement: 'Accounting records must be kept in Singapore.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'non-personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: '5 years',
    authorisation: 'unstated',
    ...over,
  };
}

function evidence(over: Partial<Finding> = {}): Evidence {
  return {
    finding: finding(over),
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: 'Companies Act 1967',
    amendsAnotherAct: false,
    headingPath: 'Part VI > 199 Accounting records',
    citation: 'https://sso.agc.gov.sg/Act/CoA1967#pr199-',
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Companies Act 1967', rank: 1 },
];
const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };

describe('every measure says what makes it out', () => {
  it('declares a defining element, in words that ask for words', () => {
    for (const [id, measures] of Object.entries(MEASURES)) {
      for (const m of measures) {
        expect(m.defines.length, `${id} ${m.token}`).toBeGreaterThan(10);
        expect(m.defines, `${id} ${m.token}`).toContain('words');
      }
    }
  });

  it('says something different from the gloss, so the reader is asked twice over', () => {
    // The gloss describes the measure; this names the words a provision has to carry to be it.
    for (const measures of Object.values(MEASURES)) {
      for (const m of measures) expect(m.defines).not.toBe(m.gloss);
    }
  });

  it('puts it in front of the reader beside the measure it belongs to', () => {
    const p = __prompt(
      { sectionId: 1, instrumentTitle: 'Companies Act 1967', headingPath: 'Part VI > 199', text: SECTION },
      'Cross-border Data Policies',
      [indicator('6.2')],
    );
    expect(p).toContain('made out by:');
    expect(p).toContain(MEASURES['6.2']![0]!.defines);
  });
});

describe('a finding that does not carry those words', () => {
  it('is held, not scored, and the hold says what was missing', () => {
    const d = decide({
      indicator: indicator('6.2'),
      economy: 'SGP',
      evidence: [evidence({ definingWords: null })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.held).toHaveLength(1);
    expect(d.held[0]?.reason).toContain(MEASURES['6.2']![0]!.defines);
  });

  it('scores when it does carry them', () => {
    // Half a band, not a whole one: accounting records are non-personal, which is 6.2's second
    // band. The point of the test is that nothing is held.
    const d = decide({
      indicator: indicator('6.2'),
      economy: 'SGP',
      evidence: [evidence()],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0.5);
    expect(d.held).toHaveLength(0);
  });

  it('is rejected outright when the words are not in the provision', () => {
    const r = rejectionFor(
      finding({ definingWords: 'at a place within Malaysia' }),
      SECTION,
      new Set(['6.1', '6.2', '6.3', '6.4']),
    );
    expect(r).toContain('are not in the provision');
    expect(r).toContain('local-storage');
  });

  it('is not rejected for leaving them out, because that is Zone 3’s call', () => {
    // A null is an honest answer about the provision. Dropping it here would lose the finding;
    // holding it in Zone 3 keeps it on the record under whatever indicator it does belong to.
    expect(rejectionFor(finding({ definingWords: null }), SECTION, new Set(['6.2']))).toBeNull();
  });
});
