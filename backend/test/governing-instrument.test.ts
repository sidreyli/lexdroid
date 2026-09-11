/**
 * Which of two instruments a cell is reported against.
 *
 * Australia's fifty-eight answered cells were drawn from eighteen instruments, and two general
 * statutes controlled thirty-one of them. Its foreign-equity cell is the shape of it: the Foreign
 * Acquisitions and Takeovers Act was retrieved, read, and produced a finding, and the row cited
 * the Corporations Act -- which won because it had more provisions in the search.
 *
 * The register already works out which instruments govern a question, from their titles against
 * the cell's own queries. Zone 3 had never been told. These assert that it is now, and that being
 * told changes nothing else: the evidence is the same evidence, in a different order.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const indicator62: Indicator = {
  id: '6.2',
  pillarId: 6,
  pillarName: 'Cross-border Data Policies',
  category: 'Local storage requirements',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Local storage requirement for all sectors or personal data', ordinal: 1 },
    { score: 0.5, criterion: 'Local storage requirement applied to specific sector', ordinal: 2 },
    { score: 0, criterion: 'No requirement', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '6.2',
    measure: 'local-storage',
    dutyBearer: 'an organisation',
    dutyAct: 'must keep',
    dutyForce: 'requires',
    roleWords: null,
    definingWords: 'kept at a place in Singapore',
    borderWords: null,
    imposingWords: 'must keep',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: 'in Singapore',
    exceptionWords: null,
    locatedData: 'the records',
    informationWords: 'records',
    keepingWords: 'kept at a place in Singapore',
    authorisingWords: null,
    quote: 'must be sent to and kept at a place in Singapore',
    requirement: 'Records must be kept locally.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    authorisation: 'unstated',
    ...over,
  };
}

function evidence(instrumentId: number, instrumentTitle: string): Evidence {
  return {
    finding: finding(),
    sectionId: instrumentId * 100,
    instrumentId,
    instrumentTitle,
    amendsAnotherAct: false,
    headingPath: 'Part III',
    citation: `https://example.gov/${instrumentId}#s1`,
  };
}

const GENERAL = 7;
const GOVERNS = 3;

/** The general statute answered the search more often, which is what made it win. */
const surfaced: SurfacedInstrument[] = [
  { instrumentId: GENERAL, instrumentTitle: 'Corporations Act 2001', rank: 1 },
  { instrumentId: GOVERNS, instrumentTitle: 'Personal Data Protection Act 2012', rank: 9 },
];

const coverage = { sectionsRead: 24, sectionsIndexed: 32591, instrumentsConsidered: 8 };

describe('two instruments, one question', () => {
  it('leads with the instrument the register says governs it', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(GENERAL, 'Corporations Act 2001'), evidence(GOVERNS, 'Personal Data Protection Act 2012')],
      surfaced,
      governing: [GOVERNS],
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.basis[0]?.instrumentTitle).toBe('Personal Data Protection Act 2012');
  });

  it('keeps the general statute on the record rather than dropping it', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(GENERAL, 'Corporations Act 2001'), evidence(GOVERNS, 'Personal Data Protection Act 2012')],
      surfaced,
      governing: [GOVERNS],
      coverage,
    });
    expect(d.basis.map((e) => e.instrumentId).sort()).toEqual([GOVERNS, GENERAL].sort());
  });

  it('scores a general statute that really does impose the measure, when nothing else was read', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(GENERAL, 'Corporations Act 2001')],
      surfaced,
      governing: [GOVERNS],
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.basis[0]?.instrumentTitle).toBe('Corporations Act 2001');
  });

  it('reports a zero against the governing instrument, not the one with the most provisions', () => {
    // Both were read and neither imposes the measure. The Act that governs the subject is the
    // one the absence is a statement about.
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        { ...evidence(GENERAL, 'Corporations Act 2001'), finding: finding({ placeWords: null }) },
        { ...evidence(GENERAL + 1, 'Corporations Act 2001'), finding: finding({ placeWords: null }) },
        { ...evidence(GOVERNS, 'Personal Data Protection Act 2012'), finding: finding({ placeWords: null }) },
      ],
      surfaced: [
        ...surfaced,
        { instrumentId: GENERAL + 1, instrumentTitle: 'Corporations Act 2001', rank: 2 },
      ],
      governing: [GOVERNS],
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.absence?.basis).toBe('governing');
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
  });

  it('falls back to the weight of evidence where the register named no one', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(GENERAL, 'Corporations Act 2001'), evidence(GOVERNS, 'Personal Data Protection Act 2012')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.basis[0]?.instrumentTitle).toBe('Corporations Act 2001');
  });
});
