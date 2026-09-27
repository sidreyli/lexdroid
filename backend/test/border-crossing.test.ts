/**
 * Pillar 10 scores restrictions on ICT goods and digital services crossing a border.
 *
 * The pilot run scored Australia a 1 on import bans off consumer product safety bans, a customs
 * detention power and a "Simplified outline" whose whole defining quote was the word "prohibited";
 * Singapore a 1 on export restrictions off hazardous waste, endangered species and food safety.
 * The measures named the restriction and left both facts -- ICT, and a border -- to a gloss.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES, SUBJECTS } from '../src/rubric/measures.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { rejectionFor, __prompt, type Finding } from '../src/read/index.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

const SECTION =
  'A person must not import into Australia any telecommunications equipment of a kind specified ' +
  'in the regulations, except under a permit issued by the Minister.';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '10.1',
    measure: 'ict-import-ban',
    dutyBearer: 'A person',
    dutyAct: 'must not import',
    dutyForce: 'forbids',
    roleWords: null,
    definingWords: 'must not import into Australia',
    subjectWords: 'telecommunications equipment',
    borderWords: 'import into Australia',
    imposingWords: 'must not import',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: 'except under a permit',
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: SECTION,
    requirement: 'Specified telecommunications equipment may not be imported without a permit.',
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

function evidence(over: Partial<Finding> = {}): Evidence {
  return {
    finding: finding(over),
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: 'Telecommunications Act 1997',
    amendsAnotherAct: false,
    headingPath: 'Part 21 > 407 Import of equipment',
    citation: 'https://www.legislation.gov.au/C2004A05145',
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Telecommunications Act 1997', rank: 1 },
];
const coverage = { sectionsRead: 119, sectionsIndexed: 42203, instrumentsConsidered: 25 };

const at = (id: string, evs: Evidence[]) =>
  decide({ indicator: indicator(id), economy: 'AUS', evidence: evs, surfaced, coverage });

describe('a trade measure is defined by the crossing', () => {
  it('declares every pillar 10 import and export measure as one', () => {
    for (const id of ['10.1', '10.2', '10.4']) {
      for (const m of MEASURES[id]!) expect(m.crossesBorder, `${id} ${m.token}`).toBe(true);
    }
  });

  it('holds a provision where nothing enters or leaves', () => {
    // The Competition and Consumer Act's consumer-goods ban: a real prohibition, no border.
    const d = at('10.1', [evidence({ borderWords: null })]);
    expect(d.score).toBe(0);
    expect(d.excluded).toHaveLength(1);
    expect(d.excluded[0]?.reason).toContain('enters or leaves');
  });

  it('scores when something does cross', () => {
    const d = at('10.1', [evidence()]);
    expect(d.score).toBe(0.5);
    expect(d.excluded).toHaveLength(0);
  });

  it('rejects a crossing the provision does not contain', () => {
    const r = rejectionFor(finding({ borderWords: 'exported from Australia' }), SECTION, new Set(['10.1']));
    expect(r).toContain('cross the border');
  });
});

describe('the goods are the defining element', () => {
  it('asks pillar 10 for the goods, as what the provision has to be about', () => {
    // It used to ask for them as the defining words, which is the same question twice: the words
    // that make it a ban and the words naming what is banned are not the same words.
    for (const id of ['10.1', '10.2', '10.4']) {
      expect(SUBJECTS[id], id).toMatch(/goods or services/);
      for (const m of MEASURES[id]!) {
        if (m.offSubject) continue;
        expect(m.defines, `${id} ${m.token}`).toMatch(/brought in|sending out|sent out|limit|licence/);
      }
    }
  });

  it('holds a ban that names no goods at all', () => {
    // The Digital ID Act's "Simplified outline", whose whole defining quote was "prohibited".
    const d = at('10.1', [evidence({ definingWords: null })]);
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain(MEASURES['10.1']![0]!.defines);
  });
});

describe('a restriction on other goods has somewhere true to go', () => {
  it('is a finding, and is not this indicator', () => {
    const d = at('10.1', [evidence({ measure: 'other-import-ban', definingWords: 'any hazardous waste' })]);
    expect(d.score).toBe(0);
    expect(d.excluded).toHaveLength(0);
    expect(d.basis).toHaveLength(0);
  });

  it('is offered to the reader beside the ICT measure it is not', () => {
    const p = __prompt(
      { sectionId: 1, instrumentTitle: 'Customs Act 1901', headingPath: 'Part VI > 50', text: SECTION },
      'Trade Policy',
      [indicator('10.1')],
    );
    expect(p).toContain('other-import-ban');
    expect(p).toContain('ict-import-ban');
  });
});

describe('a ban on goods crossing the border, stated of the goods', () => {
  // "Goods which is absolutely prohibited for import" names no importer because it binds every one.
  const passive = { dutyBearer: null, dutyAct: 'prohibited', quote: SECTION, definingWords: 'must not import into Australia' };

  it('is not held for want of a party', () => {
    const d = at('10.1', [evidence(passive)]);
    expect(d.held).toHaveLength(0);
    expect(d.score).toBeGreaterThan(0);
  });

  it('still is when it does not forbid', () => {
    const d = at('10.1', [evidence({ ...passive, dutyForce: 'requires' })]);
    expect(d.held[0]?.reason).toContain('names no party');
  });
});
