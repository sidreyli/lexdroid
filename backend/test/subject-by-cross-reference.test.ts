/**
 * Two ways a provision can be right and be thrown out for how it is drafted.
 *
 * Malaysia's Copyright Act s.13(2) is the country's fair dealing exception. The reader found it,
 * quoted it, and copied "fair dealing" out as the words that make it out. The cell still reported
 * that nothing read establishes a copyright exception, and scored Malaysia into the band named
 * "Lack of copyright legal framework OR lack of copyright exceptions" -- a false statement about a
 * statute we hold in full, arrived at from the statute itself.
 *
 * Two gates did it, one after the other, and each is right about the case it was written for:
 *
 *   the second reading answers about one measure by name, and fair dealing is not the open model
 *   the subject test asks what the provision is about, and this one says "the acts referred to in
 *   subsection (1)"
 *
 * Neither is a finding that the provision is not a copyright exception. The first refuses a label
 * the band rule for 4.5 says out loud it does not go by; the second reads a pointer to another
 * provision of the same Act as though it named another world.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const exceptions: Indicator = {
  id: '4.5',
  pillarId: 4,
  pillarName: 'Intellectual Property Rights',
  category: 'Lack of copyright framework and exceptions',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Lack of copyright legal framework OR lack of copyright exceptions', ordinal: 1 },
    { score: 0.5, criterion: 'Unclear copyright exceptions, such as three-step test', ordinal: 2 },
    { score: 0, criterion: 'Clear copyright exceptions following fair use or fair dealing model', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function ev(
  opts: { definingWords: string; subjectWords: string | null; confirmed?: boolean },
): Evidence {
  const finding = {
    indicatorId: '4.5',
    measure: 'fair-use-exception',
    quote:
      'the right of control under that subsection does not include the right to control the doing of any of the acts referred to in subsection (1) by way of fair dealing',
    subclause: 's 13(2)',
    dutyBearer: 'the person using the work',
    dutyAct: 'does not include the right to control',
    dutyForce: 'declares',
    requirement: 'specific',
    sectorScope: 'all',
    sector: null,
    dataScope: 'non-personal',
    dataDescription: null,
    scopeUnstated: false,
    appliesOnlyToGovernmentData: false,
    mandatory: false,
    countriesNamed: [],
    statedPeriod: null,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    roleWords: null,
    definingWords: opts.definingWords,
    subjectWords: opts.subjectWords,
    borderWords: null,
    imposingWords: null,
    prescribingWords: null,
    dutyBearerKind: 'person',
  } as unknown as Finding;
  return {
    finding,
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: 'Copyright Act 1987',
    headingPath: 'Part III',
    citation: 'https://example.gov/copyright#s13',
    amendsAnotherAct: false,
    ...(opts.confirmed === undefined ? {} : { confirmed: opts.confirmed }),
  } as Evidence;
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Copyright Act 1987', rank: 1 },
];
const coverage = { sectionsRead: 40, sectionsIndexed: 900, instrumentsConsidered: 3 };
const score = (e: Evidence[]) =>
  decide({ indicator: exceptions, economy: 'MYS', evidence: e, surfaced, coverage });

describe('a subject that only points at another provision', () => {
  const xref = 'any of the acts referred to in subsection (1)';

  it('is not a subject belonging to another world', () => {
    const d = score([ev({ definingWords: 'fair dealing', subjectWords: xref })]);
    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(1);
  });

  it('still rules out a subject that names one', () => {
    const d = score([ev({ definingWords: 'fair dealing', subjectWords: 'a banking licence' })]);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded[0]?.reason).toContain('is not the copyright work');
  });

  it('reads the pointer whatever provision it points at, and only a bare one', () => {
    for (const words of [
      'the acts mentioned in paragraph (a)',
      'matters specified in this section',
      'the doing of any of the acts referred to in subsection (1)',
      'requirements of the type described in regulation 4',
    ]) {
      expect(score([ev({ definingWords: 'fair dealing', subjectWords: words })]).score).toBe(0);
    }
    // A subject with a world of its own is still read, even where it goes on to cite a provision.
    const d = score([
      ev({ definingWords: 'fair dealing', subjectWords: 'a banking licence referred to in section 4' }),
    ]);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded[0]?.reason).toContain('is not the copyright work');
  });
});

describe('the second reading refusing the measure it was asked about', () => {
  const xref = 'any of the acts referred to in subsection (1)';

  it('does not discard a provision that states the model in the statute’s own words', () => {
    const d = score([ev({ definingWords: 'fair dealing', subjectWords: xref, confirmed: false })]);
    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(1);
  });

  it('still discards one that does not', () => {
    const d = score([
      ev({ definingWords: 'virtue of this Act', subjectWords: xref, confirmed: false }),
    ]);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded.some((x) => x.reason.includes('alone'))).toBe(true);
  });

  it('leaves a confirmed finding and an unasked one where they were', () => {
    expect(score([ev({ definingWords: 'fair dealing', subjectWords: xref, confirmed: true })]).score).toBe(0);
    expect(score([ev({ definingWords: 'fair dealing', subjectWords: xref })]).score).toBe(0);
  });
});
