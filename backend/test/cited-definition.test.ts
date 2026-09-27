/**
 * Words that define a term, cited as words that impose a duty.
 *
 * Every provision below is real and every quote was really in it. Singapore's online content
 * licensing cell was answered out of the Broadcasting Act's interpretation section; Australia's
 * cybersecurity cell out of a definition that names the section where the appointment is actually
 * made. In both the citation points at the dictionary and the duty is a few pages away.
 */
import { describe, expect, it } from 'vitest';
import { citesADefinition } from '../src/parse/identity.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { loadRubric } from '../src/rubric/index.js';
import type { Finding } from '../src/read/index.js';

const INTERPRETATION = [
  '2. In this Act, unless the context otherwise requires —',
  '“broadcasting licence” means a licence granted under section 8 or 9 for the provision of a',
  'licensable broadcasting service;',
  '“dealer” means a person who manufactures, imports for sale or lets for hire any equipment;',
].join('\n');

const OPERATIVE_WITH_DEFINITION = [
  '12.—(1) A licensee must not provide a licensable broadcasting service except in accordance',
  'with the conditions of its licence.',
  '(2) In this section, “conditions” includes any direction given by the Authority under',
  'section 11;',
].join('\n');

describe('words that define a term', () => {
  it('knows a definition entry from the duty the Act imposes elsewhere', () => {
    expect(citesADefinition(INTERPRETATION, 'a licence granted under section 8 or 9')).toBe(true);
  });

  it('reads the entry that the quoted words actually sit in, not the first in the section', () => {
    expect(citesADefinition(INTERPRETATION, 'a person who manufactures, imports for sale')).toBe(true);
  });

  it('lets an operative duty through, in a section that also defines a term', () => {
    expect(citesADefinition(OPERATIVE_WITH_DEFINITION, 'must not provide a licensable broadcasting service')).toBe(false);
  });

  it('catches a definition buried in the closing subsection of an operative section', () => {
    expect(citesADefinition(OPERATIVE_WITH_DEFINITION, 'any direction given by the Authority')).toBe(true);
  });

  it('says no where the provision defines nothing', () => {
    expect(citesADefinition('5. A person must hold a licence to sell goods online.', 'must hold a licence')).toBe(false);
  });

  it('says no where the words are not in the provision at all, rather than guessing', () => {
    expect(citesADefinition(INTERPRETATION, 'a duty to appoint a data protection officer')).toBe(false);
  });

  it('runs through the lettered paragraphs of the entry, not only its first', () => {
    const list = [
      '52A.—(1) In this Part, unless the context otherwise requires, “intellectual property right” or “IPR” means —',
      '',
      '(a) a patent;',
      '',
      '(b) a trade mark;',
      '',
      '(h) a right in confidential information, trade secret or know‑how;',
      '',
      '(2) Every IPR dispute is capable of settlement by arbitration.',
    ].join('\n');
    expect(citesADefinition(list, 'a right in confidential information, trade secret or know‑how')).toBe(true);
    expect(citesADefinition(list, 'Every IPR dispute is capable of settlement')).toBe(false);
  });
});

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
    definingWords: 'a licence to sell goods online',
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

function at(over: Partial<Evidence> = {}) {
  const evidence: Evidence[] = [
    {
      finding: finding(),
      sectionId: 1,
      instrumentId: 1,
      instrumentTitle: 'Electronic Commerce Act 2006',
      amendsAnotherAct: false,
      headingPath: 'Part I > 2 Interpretation',
      citation: 'https://example.gov.my/eca#s2',
      ...over,
    },
  ];
  return decide({ indicator: indicator('12.3'), economy: 'MYS', evidence, surfaced, coverage });
}

describe('a definition offered as the measure', () => {
  it('does not score, because a definition requires nothing of anybody', () => {
    expect(at({ definesATerm: true }).score).toBe(0);
  });

  it('is held rather than ruled out, because the Act defining a licence is evidence it has one', () => {
    const d = at({ definesATerm: true });
    expect(d.held.some((h) => h.reason.includes('define a term rather than impose a duty'))).toBe(true);
    expect(d.excluded.some((x) => x.reason.includes('define a term'))).toBe(false);
  });

  it('is held before the second reading rules it out, so the refusal is not read as an absence', () => {
    const d = at({ definesATerm: true, confirmed: false });
    expect(d.held.some((h) => h.reason.includes('define a term rather than impose a duty'))).toBe(true);
    expect(d.excluded.some((x) => x.reason.includes('found no words in the provision'))).toBe(false);
  });

  it('leaves a provision that imposes the duty exactly where it was', () => {
    expect(at().score).toBe(1);
  });
});
