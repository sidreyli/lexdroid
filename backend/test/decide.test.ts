/**
 * Zone 3, and in particular what a zero is allowed to say.
 *
 * More than half of every economy's rows in ESCAP's own database score zero, and none of their
 * zeros is a silence: Australia 2.2 scores 0 citing the Commonwealth Procurement Rules 2024 and
 * states that no source-code or encryption condition is found in them. A zero that names nothing
 * is an assertion, and their reviewers rejected assertions across the fifteen graded submissions.
 *
 * The risk in fixing that is worse than the defect: naming an irrelevant instrument as "the
 * governing instrument" would be a confident false claim where there had merely been silence. So
 * the two strengths of claim are separated here and tested apart.
 */
import { describe, expect, it } from 'vitest';
import {
  decide,
  refile,
  confinesPermission,
  type Evidence,
  type FrameworkEvidence,
  type SurfacedInstrument,
  __rules,
} from '../src/decide/index.js';
import { MEASURES, SUBJECT_DOMAIN } from '../src/rubric/measures.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const indicator62: Indicator = {
  id: '6.2',
  pillarId: 6,
  pillarName: 'Cross-border Data Policies',
  category: 'Local storage requirements',
  exception: 'Not score data localization measure applied to government data.',
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

const indicator61: Indicator = {
  id: '6.1',
  pillarId: 6,
  pillarName: 'Cross-border Data Policies',
  category: 'Data localisation and transfer bans',
  exception: 'Not score data localization measure applied to government data.',
  criteriaText: '...',
  bands: [
    {
      score: 1,
      criterion:
        'Ban and/or local processing requirement for all sectors or personal data, OR more than one measure in category (2)',
      ordinal: 1,
    },
    { score: 0.5, criterion: 'Ban applied to specific sector, specific data or non-personal data', ordinal: 2 },
    { score: 0, criterion: 'No requirement', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

const indicator64: Indicator = {
  id: '6.4',
  pillarId: 6,
  pillarName: 'Cross-border Data Policies',
  category: 'Conditional flow regimes',
  exception: 'Not score data localization measure applied to government data.',
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Conditions for all sectors or personal data', ordinal: 1 },
    { score: 0.5, criterion: 'Conditions for specific data or non-personal data', ordinal: 2 },
    { score: 0, criterion: 'No condition', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '6.4',
    measure: 'transfer-condition',
    dutyBearer: 'an organisation',
    dutyAct: 'must not transfer',
    dutyForce: 'forbids',
    roleWords: null,
    definingWords: 'outside Singapore',
    subjectWords: null,
    borderWords: 'outside Singapore',
    imposingWords: 'must not transfer',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: 'outside Singapore',
    exceptionWords: null,
    locatedData: 'personal data',
    informationWords: 'personal data',
    keepingWords: 'must not transfer any personal data to a country outside Singapore',
    authorisingWords: null,
    quote: 'an organisation must not transfer any personal data to a country outside Singapore',
    requirement: 'Transfers abroad are conditional.',
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

function evidence(instrumentId: number, instrumentTitle: string, over: Partial<Finding> = {}): Evidence {
  return {
    finding: finding(over),
    sectionId: instrumentId * 100,
    instrumentId,
    instrumentTitle,
    amendsAnotherAct: false,
    headingPath: 'Part III > 26 Transfer outside Singapore',
    citation: 'https://sso.agc.gov.sg/Act/PDPA2012#pr26-',
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 9, instrumentTitle: 'Maintenance of Parents Act 1995', rank: 1 },
  { instrumentId: 1, instrumentTitle: 'Personal Data Protection Act 2012', rank: 2 },
];

const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };

describe('a cell that scores zero', () => {
  it('names the instrument that governs the area, when one was read', () => {
    // The PDPA is not top of the search, but it is where the reader found this pillar's
    // requirements -- so it is the Act that plainly regulates the subject, and the zero is a
    // statement about it rather than about the search.
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(1, 'Personal Data Protection Act 2012')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.state).toBe('no-restriction');
    expect(d.absence?.basis).toBe('governing');
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
    expect(d.rationale).toContain('Personal Data Protection Act 2012 regulates this area');
    expect(d.rationale).toContain('imposes no local storage requirements');
  });

  it('prefers an instrument that bears on this indicator over one that bears on the pillar', () => {
    // A pillar is not always one subject. Australia's content-safety Act genuinely regulates part
    // of pillar 12 and so passed a pillar-wide test for all of it, standing as the instrument
    // governing payment-security standards while the reader had found no provision of it bearing
    // on that question and had found provisions in eight other instruments that did.
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(9, 'Maintenance of Parents Act 1995', { indicatorId: '6.1', measure: 'transfer-ban' }),
        evidence(9, 'Maintenance of Parents Act 1995', { indicatorId: '6.1', measure: 'transfer-ban' }),
        // Bears on the indicator, and did not survive the second reading -- which is how a cell
        // with evidence for its own question still scores zero.
        { ...evidence(1, 'Personal Data Protection Act 2012', { indicatorId: '6.2' }), confirmed: false },
      ],
      surfaced,
      coverage,
    });
    // Ranked first in the search and holding twice the pillar evidence, and still not it.
    expect(d.absence?.basis).toBe('governing');
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
  });

  it('falls back to the pillar when nothing bears on the indicator itself', () => {
    // The weaker signal is still worth more than a title match, so it is ordered behind the
    // indicator's own evidence rather than discarded.
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(1, 'Personal Data Protection Act 2012', { indicatorId: '6.1', measure: 'transfer-ban' })],
      // no finding bears on 6.2 itself, so the pillar's evidence decides
      surfaced,
      coverage,
    });
    expect(d.absence?.basis).toBe('governing');
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
  });

  it('will not call the top search result the governing instrument', () => {
    // The failure this guards against. With no pillar evidence anywhere, the highest-ranked hit
    // for a data-localisation search was the Maintenance of Parents Act; reporting that as the
    // Act governing data localisation would be a confident false claim in place of a silence.
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [],
      surfaced,
      coverage,
    });
    expect(d.absence?.basis).toBe('surfaced');
    expect(d.absence?.instrumentTitle).toBe('Maintenance of Parents Act 1995');
    expect(d.rationale).toContain('No instrument in the corpus was found to regulate this area');
    expect(d.rationale).not.toContain('regulates this area --');
  });

  it('prefers the instrument this pillar was actually found in, not the best-ranked one', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(1, 'Personal Data Protection Act 2012'),
        evidence(1, 'Personal Data Protection Act 2012', { indicatorId: '6.1', measure: 'transfer-ban' }),
        evidence(9, 'Maintenance of Parents Act 1995', { indicatorId: '6.1', measure: 'transfer-ban' }),
      ],
      surfaced,
      coverage,
    });
    // Two findings against one: the Act with more of this pillar's requirements in it governs.
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
    expect(d.absence?.pillarFindings).toBe(2);
  });

  it('reports no absence when nothing was searched', () => {
    const d = decide({ indicator: indicator62, economy: 'SGP', evidence: [], surfaced: [], coverage });
    expect(d.absence).toBeNull();
  });

  it('stays unresolved, not zero, when nothing was read', () => {
    // The difference between a finding of absence and a failure to look. An economy with no
    // requirement and an economy nobody looked at produce the same silence, and only one is a
    // finding -- v1 certified 852 Australian documents as clean negatives this way.
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [],
      surfaced,
      coverage: { ...coverage, sectionsRead: 0 },
    });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
    expect(d.absence).toBeNull();
  });
});

describe('a cell that scores above zero', () => {
  it('reports no absence, because there is none', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(1, 'Personal Data Protection Act 2012', { indicatorId: '6.2', measure: 'local-storage' })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.absence).toBeNull();
    expect(d.rationale.startsWith('"')).toBe(true);
  });
});

/**
 * Measured, not invented. Widening the search from titles to tables of contents surfaced Acts the
 * shortlist had never reached, and three of them scored cells they have nothing to do with: a
 * power to make regulations about "the import, storage or supply of essential construction
 * materials" was read as a duty to process data locally, and section 5 of the Telecommunications
 * Act -- a power to attach conditions to a licence -- was read as a local storage requirement, a
 * local infrastructure requirement and a transfer condition, in three different cells.
 *
 * What every one of them lacks is a place. Pillar 6's bands are all locational, so a provision
 * that never says where anything has to be has not made out one of these measures, whatever its
 * language resembles.
 */
/**
 * The one distinction in this pillar that the reader cannot be asked to make, because it is a
 * question about the rubric rather than about the document.
 */
describe('a prohibition that carries a way through', () => {
  const spread = (id: string, category: string, bands: Indicator['bands']): Indicator => ({
    ...indicator62,
    id,
    category,
    bands,
  });
  const i61 = spread('6.1', 'Bans on cross-border data flows', [
    { score: 1, criterion: 'Ban and/or local processing requirement for all sectors or personal data', ordinal: 1 },
    { score: 0.5, criterion: 'Ban applied to specific sector', ordinal: 2 },
    { score: 0, criterion: 'No requirement', ordinal: 3 },
  ]);
  const i64 = spread('6.4', 'Conditional cross-border data flows', [
    { score: 1, criterion: 'Conditions for all sectors or personal data', ordinal: 1 },
    { score: 0.5, criterion: 'Conditions for specific data', ordinal: 2 },
    { score: 0, criterion: 'No condition', ordinal: 3 },
  ]);

  // Section 26 of the PDPA, verbatim. ESCAP scores Singapore 0 on 6.1 and 1 on 6.4 from this
  // sentence, and the reader filed it as a ban because the prohibition is its louder half.
  const section26 = evidence(1, 'Personal Data Protection Act 2012', {
    indicatorId: '6.1',
    measure: 'transfer-ban',
    quote:
      'An organisation must not transfer any personal data to a country or territory outside ' +
      'Singapore except in accordance with requirements prescribed under this Act',
    dutyBearer: 'An organisation',
    dutyAct: 'must not transfer',
    placeWords: 'outside Singapore',
    exceptionWords: 'except in accordance with requirements prescribed under this Act',
  });

  const decideWith = (indicator: Indicator) =>
    decide({ indicator, economy: 'SGP', evidence: [section26], surfaced, coverage });

  it('is not a ban', () => {
    expect(decideWith(i61).score).toBe(0);
  });

  it('is a conditional regime, and scores as one', () => {
    expect(decideWith(i64).score).toBe(1);
  });

  it('is a requirement where the words imposing it are a mandate, though the quote only sets the scene', () => {
    // Thailand's PDPA s.28, as the reader filed it: quoted from the clause that describes the
    // transfer, which permits, with "ต้องมี" -- must have -- as the words imposing the duty.
    const scene = evidence(1, 'พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562', {
      indicatorId: '6.4',
      measure: 'transfer-condition',
      quote: 'ในกรณีที่ผู้ควบคุมข้อมูลส่วนบุคคลส่งหรือโอนข้อมูลส่วนบุคคลไปยังต่างประเทศ',
      dutyAct: 'ส่งหรือโอน',
      dutyForce: 'permits',
      imposingWords: 'ต้องมี',
      definingWords: 'ต้องมีมาตรฐานการคุ้มครองข้อมูลส่วนบุคคลที่เพียงพอ',
      placeWords: 'ต่างประเทศ',
      borderWords: 'ต่างประเทศ',
    });
    expect(decide({ indicator: i64, economy: 'THA', evidence: [scene], surfaced, coverage }).score).toBe(1);
    // And not where the mandate is waived, or belongs to some other duty than the one defined.
    const waived = { ...scene, finding: { ...scene.finding, imposingWords: 'ไม่ต้อง', definingWords: 'ไม่ต้องมี' } };
    expect(decide({ indicator: i64, economy: 'THA', evidence: [waived], surfaced, coverage }).score).toBe(0);
    const elsewhere = { ...scene, finding: { ...scene.finding, definingWords: 'มาตรฐานที่เพียงพอ' } };
    expect(decide({ indicator: i64, economy: 'THA', evidence: [elsewhere], surfaced, coverage }).score).toBe(0);
  });

  it('stays a ban when nothing lets the transfer happen', () => {
    const outright = {
      ...section26,
      finding: { ...section26.finding, exceptionWords: null },
    };
    const d = decide({ indicator: i61, economy: 'SGP', evidence: [outright], surfaced, coverage });
    expect(d.score).toBe(1);
  });
});

/**
 * 6.4 asks for a condition, and the reader kept answering with the place.
 *
 * Of 758 findings on this measure, 447 gave the condition question the place words verbatim --
 * "overseas", "outside Malaysia", "across national borders". The check meant to establish the
 * condition was free to pass, which is how transfers of a business under the Corporations Act and
 * a loss company's tax position under the Income Tax Assessment Act came to score a data cell.
 */
describe('what makes a transfer conditional', () => {
  const conditional = (over: Partial<Finding>) =>
    decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [evidence(1, 'Personal Data Protection Act 2012', over)],
      surfaced,
      coverage,
    });

  it('holds a finding whose condition is only the place the data goes', () => {
    const d = conditional({ definingWords: 'outside Singapore', placeWords: 'outside Singapore', exceptionWords: null });
    expect(d.score).toBe(0);
    expect(d.excluded.map((h) => h.reason)).toContain(
      'the words said to state the condition only name where the data goes, which is no condition',
    );
  });

  it('takes a condition carved out as an exception, which is how section 26 states one', () => {
    const d = conditional({
      definingWords: 'outside Singapore',
      placeWords: 'outside Singapore',
      exceptionWords: 'except in accordance with requirements prescribed under this Act',
    });
    expect(d.score).toBe(1);
    expect(d.excluded).toHaveLength(0);
  });

  it('takes a condition worded around the place, rather than reading the overlap as a repeat', () => {
    // Regulation 10: "before transferring ... outside Singapore, take appropriate steps". The
    // condition names the place because that is what it applies to, and it is still a condition.
    const d = conditional({
      definingWords: 'before transferring personal data outside Singapore, take appropriate steps',
      placeWords: 'outside Singapore',
      exceptionWords: null,
    });
    expect(d.score).toBe(1);
  });
});

/**
 * 7.5 scores a power exercisable without a court order, so what the power needs first is the fact
 * the whole cell turns on -- and it was the least anchored field in the reading.
 */
describe('what a government access power needs first', () => {
  const i75: Indicator = {
    ...indicator62,
    id: '7.5',
    pillarId: 7,
    category: 'Government access to data',
    exception: null,
    bands: [
      { score: 1, criterion: 'For any measure that allows government to access data without court orders', ordinal: 1 },
      { score: 0, criterion: 'No measure', ordinal: 2 },
    ],
  };
  const power = (over: Partial<Finding>) =>
    decide({
      indicator: i75,
      economy: 'SGP',
      evidence: [
        evidence(3, 'Criminal Procedure Code 2010', {
          indicatorId: '7.5',
          measure: 'government-access',
          quote: 'a police officer may at any time require any person to produce any document or other thing',
          dutyBearer: 'a police officer',
          dutyAct: 'may at any time require',
          dutyBearerKind: 'government',
          locatedData: null,
          informationWords: null,
          ...over,
        }),
      ],
      surfaced,
      coverage,
    });

  // The provision conditions the power on nothing, so there are no words to point at. That is a
  // finding of absence and it scores; the same reading called "unstated" and held emptied this
  // cell between two runs of the identical corpus.
  it('needs nothing, when the provision names nothing it needs', () => {
    expect(power({ authorisingWords: null, authorisation: 'unstated' }).score).toBe(1);
  });

  it('needs a court order when the provision says so, and does not score', () => {
    const d = power({
      quote: 'a police officer may, on the order of a court, require any person to produce any document',
      dutyAct: 'may',
      authorisingWords: 'on the order of a court',
      authorisation: 'court-order',
    });
    expect(d.score).toBe(0);
    expect(d.held[0]?.reason).toContain('court order');
  });

  it('scores where an official rather than a court authorises it', () => {
    const d = power({
      quote: 'the Public Prosecutor may by order authorise a police officer to require any person to produce any document',
      dutyBearer: 'the Public Prosecutor',
      dutyAct: 'may by order authorise',
      authorisingWords: 'the Public Prosecutor may by order authorise',
      authorisation: 'internal',
    });
    expect(d.score).toBe(1);
  });

  // Mongolia's Civil Code gives a contracting party "мэдээлэл авах эрхтэй" -- a right to receive
  // information from the other side -- and it led the cell's basis as a government power. The
  // measure's actor is the State; a private party's own entitlement is not it.
  it('is not made out by a private party’s own right to receive information', () => {
    const d = power({
      quote: 'мэдээлэл авах эрхтэй',
      dutyBearer: 'нөгөө тал',
      dutyAct: 'мэдээлэл авах эрхтэй',
      dutyForce: 'permits',
      dutyBearerKind: 'individual',
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('is not the State');
  });
});

// ESCAP's guide, on 6.1 and 6.2: a horizontal requirement "will get a higher score than a
// requirement that applies only to a specific sector ... or specific data types (such as
// accounting data and health records)". On 6.4 it says the opposite in as many words: score 1 "if
// the conditional flow regime applies horizontally across all sectors (even if it only applies to
// non-personal or specific data types)". The band text on the methodology sheet is the same for
// both; the guide is where the difference is written down.
describe('what counts as reaching broadly, which is not one test', () => {
  // Section 199 of the Companies Act: every company in the economy, and only its accounting
  // records.
  const accountingRecords = {
    measure: 'local-storage',
    quote:
      'If accounting and other records are kept by the company at a place outside Singapore ' +
      'there must be sent to and kept at a place in Singapore',
    dutyBearer: 'the company',
    dutyAct: 'must be sent to and kept',
    placeWords: 'at a place in Singapore',
    locatedData: 'accounting and other records',
    informationWords: 'accounting and other records',
    keepingWords: 'must be sent to and kept at a place in Singapore',
    sectorScope: 'all',
    dataScope: 'specific-category',
  } satisfies Partial<Finding>;

  it('puts a duty on every sector but only one kind of record in the middle band of 6.2', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(12, 'Companies Act 1967', { ...accountingRecords, indicatorId: '6.2' })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0.5);
    expect(d.excluded).toHaveLength(0);
  });

  // The mirror on the other axis. Australia's motor-vehicle repair scheme binds only its own
  // members and the data really is about an individual, so "personal" must not carry it alone.
  const schemePersonalData = {
    measure: 'local-storage',
    quote: 'the data provider must store the information in Australia or an external Territory',
    dutyBearer: 'the data provider',
    dutyAct: 'must store',
    placeWords: 'in Australia',
    locatedData: 'sensitive information about an individual',
    informationWords: 'sensitive information',
    keepingWords: 'must store the information in Australia',
    sectorScope: 'specific',
    sector: 'motor vehicle service and repair information sharing scheme',
    dataScope: 'personal',
  } satisfies Partial<Finding>;

  it('keeps a duty on one scheme out of the top band of 6.2 though the data is personal', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'AUS',
      evidence: [evidence(12, 'Competition and Consumer Act 2010', { ...schemePersonalData, indicatorId: '6.2' })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0.5);
  });

  it('puts the same duty in the top band of 6.4, where personal data alone carries it', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'AUS',
      evidence: [
        evidence(12, 'Competition and Consumer Act 2010', {
          ...schemePersonalData,
          indicatorId: '6.4',
          measure: 'transfer-condition',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('still reaches the top band of 6.2 on two narrow measures in different instruments', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'AUS',
      evidence: [
        evidence(12, 'Competition and Consumer Act 2010', { ...schemePersonalData, indicatorId: '6.2' }),
        evidence(13, 'My Health Records Act 2012', { ...schemePersonalData, indicatorId: '6.2' }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  // One section that bans holding data abroad and processing it abroad is one requirement, not
  // two, so it must not satisfy "more than one measure in category (2)" on its own.
  it('counts one section read under two measure labels as one measure', () => {
    // Section 77 of the My Health Records Act bans holding records abroad and processing them
    // abroad in the same breath. One requirement, read twice.
    const section = evidence(13, 'My Health Records Act 2012', {
      indicatorId: '6.1',
      measure: 'transfer-ban',
      quote:
        'must not: (a) hold the records, or take the records, outside Australia; or (b) process or handle the information relating to the records outside Australia',
      dutyBearer: 'the System Operator',
      dutyAct: 'must not hold or take',
      dutyForce: 'forbids',
      placeWords: 'outside Australia',
      exceptionWords: null,
      locatedData: 'the records',
      informationWords: 'records',
      keepingWords: 'must not: (a) hold the records, or take the records, outside Australia',
      sectorScope: 'specific',
      sector: 'my health record system',
      dataScope: 'specific-category',
    });
    const d = decide({
      indicator: indicator61,
      economy: 'AUS',
      evidence: [
        section,
        { ...section, finding: { ...section.finding, measure: 'local-processing' } },
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0.5);
  });

  it('puts the same shape in the top band of 6.4, where the guide says sectors alone are enough', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [
        evidence(12, 'Companies Act 1967', {
          ...accountingRecords,
          indicatorId: '6.4',
          measure: 'transfer-condition',
          exceptionWords: 'kept by the company at a place outside Singapore',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });
});

describe('a measure about where data must be', () => {
  const licenceClause = {
    indicatorId: '6.2',
    measure: 'local-storage',
    quote: 'subject to such conditions as the Authority may impose and specify in the licence',
    dutyBearer: 'the Authority',
    dutyAct: 'may impose',
    placeWords: null,
  } satisfies Partial<Finding>;

  it('is not made out by a provision that names no place', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(4, 'Telecommunications Act 1999', licenceClause)],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded).toHaveLength(1);
    expect(d.excluded[0]?.reason).toContain('names no place');
  });

  // Section 13N of the Income Tax Act, verbatim. It names a place and a duty, and what has to be
  // in Singapore is a trustee company.
  it('is not made out by a place with no data in it', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(7, 'Income Tax Act 1947', {
          indicatorId: '6.2',
          measure: 'local-storage',
          quote: 'administered by a trustee company in Singapore',
          dutyBearer: 'a trustee company',
          dutyAct: 'administered',
          placeWords: 'in Singapore',
          locatedData: null,
          informationWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('no data that has to be there');
  });

  // Section 10 of the Biological Agents and Toxins Act, verbatim. A duty, a place, and a thing
  // that must be in it -- and the thing is a virus.
  it('is not made out by a place holding something that is not information', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(9, 'Biological Agents and Toxins Act 2005', {
          indicatorId: '6.2',
          measure: 'local-storage',
          quote:
            'the person to whom the permit to import the First Schedule biological agent has been ' +
            'granted must ensure that the First Schedule biological agent is stored at a place ' +
            'which is safe and secure',
          dutyBearer: 'the person to whom the permit',
          dutyAct: 'must ensure',
          placeWords: 'at a place which is safe and secure',
          locatedData: 'the First Schedule biological agent',
          informationWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('never calls that thing information');
  });

  // Section 47A of the Banking Act, verbatim. A place, data, and a word for information -- and the
  // place belongs to the bank.
  it('is not made out by a place that describes the party rather than the data', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(10, 'Banking Act 1970', {
          indicatorId: '6.2',
          measure: 'local-storage',
          quote:
            'a requirement that the policies and procedures provide that the branch or office must ' +
            'protect all customer information of the bank in Singapore against unauthorised ' +
            'disclosure, retention or use',
          dutyBearer: 'the branch or office',
          dutyAct: 'must protect',
          placeWords: 'in Singapore',
          locatedData: 'all customer information of the bank',
          informationWords: 'information',
          keepingWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('never says the data has to be there');
  });

  // Section 13N of the Income Tax Act, verbatim, as the reader returned it: "any income" bound by
  // the duty, "any income" located by it. Nobody is required to do anything.
  it('is not made out by a duty whose bearer is the thing itself', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(11, 'Income Tax Act 1947', {
          indicatorId: '6.2',
          measure: 'local-storage',
          quote: 'any income of the kinds referred to in section 13(1)(zd) accrued in or derived from Singapore',
          dutyBearer: 'any income',
          dutyAct: 'accrued in or derived from',
          placeWords: 'in or derived from Singapore',
          locatedData: 'any income',
          informationWords: 'income',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('binds no one');
  });

  // Section 82A(5) of Malaysia's Income Tax Act: "All documents that relate to any income in
  // Malaysia shall be kept and retained in Malaysia." The party is "Every person", earlier on.
  it('is made out by a passive duty once the reader names who has to keep the records', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'MYS',
      evidence: [
        evidence(12, 'Income Tax Act 1967', {
          indicatorId: '6.2',
          measure: 'local-storage',
          quote: 'All documents that relate to any income in Malaysia shall be kept and retained in Malaysia',
          dutyBearer: 'Every person',
          dutyAct: 'shall be kept and retained',
          placeWords: 'in Malaysia',
          locatedData: 'All documents',
          informationWords: 'documents',
          keepingWords: 'shall be kept and retained in Malaysia',
          dataScope: 'specific-category',
          sectorScope: 'all',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.excluded).toHaveLength(0);
    expect(d.score).toBeGreaterThan(0);
  });

  // Sections 191, 199 and 397 of the Companies Act each say where a company keeps its own records.
  // That is one local storage measure written three times, and the top band asks for more than one.
  it('counts several provisions of one Act as one measure, not several', () => {
    const provision = (sectionId: number, words: string) => ({
      ...evidence(20, 'Companies Act 1967', {
        indicatorId: '6.2',
        measure: 'local-storage',
        quote: words,
        dutyBearer: 'the company',
        dutyAct: 'must keep',
        placeWords: 'in Singapore',
        locatedData: 'the records',
        informationWords: 'records',
        keepingWords: words,
        dataScope: 'specific-category',
        sectorScope: 'all',
      }),
      sectionId,
    });
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        provision(191, 'must be kept at the registered office of the public company'),
        provision(199, 'must be sent to and kept at a place in Singapore'),
        provision(397, 'must keep at its registered office in Singapore'),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0.5);
  });

  // Malaysia's customs, excise and income tax record duties bind different populations under
  // different schemes, so they are the separate measures the top band is written for.
  it('counts provisions of separate Acts as separate measures', () => {
    const act = (instrumentId: number, title: string) =>
      evidence(instrumentId, title, {
        indicatorId: '6.2',
        measure: 'local-storage',
        quote: 'kept in Malaysia',
        dutyBearer: 'Every person',
        dutyAct: 'shall keep',
        placeWords: 'in Malaysia',
        locatedData: 'the records',
        informationWords: 'records',
        keepingWords: 'kept in Malaysia',
        dataScope: 'specific-category',
        sectorScope: 'all',
      });
    const d = decide({
      indicator: indicator62,
      economy: 'MYS',
      evidence: [act(30, 'CUSTOMS ACT 1967'), act(31, 'EXCISE ACT 1976'), act(32, 'INCOME TAX ACT 1967')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('holds the same provision when the reader can find no party in it', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'MYS',
      evidence: [
        evidence(12, 'Income Tax Act 1967', {
          indicatorId: '6.2',
          measure: 'local-storage',
          quote: 'All documents that relate to any income in Malaysia shall be kept and retained in Malaysia',
          dutyBearer: null,
          dutyAct: 'shall be kept and retained',
          placeWords: 'in Malaysia',
          locatedData: 'All documents',
          informationWords: 'documents',
          keepingWords: 'shall be kept and retained in Malaysia',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.held[0]?.reason).toContain('names no party');
  });

  it('is made out by the same shape of provision once it says where', () => {
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [
        evidence(1, 'Personal Data Protection Act 2012', {
          ...licenceClause,
          quote: 'must keep the personal data within Singapore',
          dutyBearer: 'must keep',
          dutyAct: 'must keep',
          placeWords: 'within Singapore',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.excluded).toHaveLength(0);
  });
});

/**
 * The line between 6.1 and 6.4, which ESCAP's own internal guide devotes a question to.
 *
 * These are the two provisions that carried Singapore's 6.1 to a top band it does not deserve,
 * once the tax exemption stopped carrying it. Both are quoted as the reader returned them.
 */
describe('a prohibition, and the two things that are not one', () => {
  // Regulation 10 of the Personal Data Protection Regulations 2021. It names a duty, a place and
  // personal data, so every locational test it faces it passes. What it does not do is forbid the
  // transfer: it is the step to be taken so that the transfer may lawfully happen, which is 6.4.
  it('files a step to be taken before transferring under the conditional regime, not the ban', () => {
    const asBan = decide({
      indicator: indicator61,
      economy: 'SGP',
      evidence: [
        evidence(1, 'Personal Data Protection Regulations 2021', {
          indicatorId: '6.1',
          measure: 'transfer-ban',
          quote:
            'a transferring organisation must, before transferring an individual’s personal data to a country or territory outside Singapore, take appropriate steps',
          dutyBearer: 'a transferring organisation',
          dutyAct: 'must, before transferring',
          dutyForce: 'requires',
          placeWords: 'outside Singapore',
          definingWords: 'must, before transferring an individual’s personal data ... take appropriate steps',
          locatedData: 'an individual’s personal data',
          informationWords: 'personal data',
          exceptionWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(asBan.score).toBe(0);

    const asCondition = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [
        evidence(1, 'Personal Data Protection Regulations 2021', {
          indicatorId: '6.1',
          measure: 'transfer-ban',
          quote:
            'a transferring organisation must, before transferring an individual’s personal data to a country or territory outside Singapore, take appropriate steps',
          dutyBearer: 'a transferring organisation',
          dutyAct: 'must, before transferring',
          dutyForce: 'requires',
          placeWords: 'outside Singapore',
          definingWords: 'must, before transferring an individual’s personal data ... take appropriate steps',
          locatedData: 'an individual’s personal data',
          informationWords: 'personal data',
          exceptionWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(asCondition.score).toBe(1);
  });

  // Regulation 12 of the same instrument. A deeming rule: it says when a recipient abroad counts
  // as bound, so that regulation 10's step is satisfied. It requires nothing of anybody.
  it('holds a provision that declares something to be so rather than requiring an act', () => {
    const d = decide({
      indicator: indicator61,
      economy: 'SGP',
      evidence: [
        evidence(2, 'Personal Data Protection Regulations 2021', {
          indicatorId: '6.1',
          measure: 'transfer-ban',
          quote:
            'a recipient of an individual’s personal data in a country or territory outside Singapore is taken to be bound by legally enforceable obligations to provide a standard of protection',
          dutyBearer: 'a recipient of an individual’s personal data',
          dutyAct: 'is taken to be bound by legally enforceable obligations to provide a standard of protection',
          dutyForce: 'declares',
          placeWords: 'in a country or territory outside Singapore',
          locatedData: 'personal data',
          informationWords: 'personal data',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('rather than requiring anyone to do anything');
  });

  // The rule is not about pillar 6. Section 16P of the Electronic Transactions Act is the same
  // shape in the other direction, and it was scoring 6.4 in the run that found this.
  it('holds a declaration wherever it appears, not only under the ban', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [
        evidence(3, 'Electronic Transactions Act 2010', {
          indicatorId: '6.4',
          measure: 'transfer-condition',
          quote:
            'An electronic transferable record is not to be denied legal effect, validity or enforceability solely on the ground that it was issued or used outside Singapore',
          dutyBearer: 'An electronic transferable record',
          dutyAct: 'is not to be denied legal effect, validity or enforceability',
          dutyForce: 'declares',
          placeWords: 'outside Singapore',
          locatedData: 'An electronic transferable record',
          informationWords: 'record',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
  });

  // A refiled finding faces the tests of the indicator it lands in. Section 20 of the Personal
  // Data Protection Act -- "an organisation must inform the individual of the purposes" -- was
  // labelled a transfer ban by the reader, and once the verb refiled it into the conditional
  // regime it faced no locational test at all, because the indicator it came from is the only one
  // whose rubric knows the word "transfer-ban". It names no place. It is not a flow measure.
  it('holds a refiled finding where nothing leaves the economy, under the indicator it was refiled into', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [
        evidence(5, 'Personal Data Protection Act 2012', {
          indicatorId: '6.1',
          measure: 'transfer-ban',
          quote:
            'an organisation must inform the individual of — (a) the purposes for the collection, use or disclosure of the personal data',
          dutyBearer: 'an organisation',
          dutyAct: 'must inform',
          dutyForce: 'requires',
          placeWords: null,
          borderWords: null,
          locatedData: 'the personal data',
          informationWords: 'personal data',
          exceptionWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('enters or leaves the economy');
  });

  // The record has to hold the decision's own inputs, or the score cannot be re-derived from it
  // months later -- which is the whole claim the verification makes. A finding the rubric moves
  // between two indicators used to be written to the store under the one the reader named, so the
  // cell that acted on it did not have it: Singapore's conditional flow regime scored 1 live and
  // 0 on re-derivation from its own record.
  it('carries the reader’s own filing with a finding the rubric moves', () => {
    const read = {
      ...finding({
        indicatorId: '6.1',
        measure: 'transfer-ban',
        dutyAct: 'must, before transferring',
        dutyForce: 'requires',
      }),
    };
    const filed = refile(read);
    expect(filed.indicatorId).toBe('6.4');
    expect(filed.measure).toBe('transfer-condition');
    expect(filed.refiledFrom).toEqual({ indicatorId: '6.1', measure: 'transfer-ban' });
    // And a finding the rubric leaves alone is returned untouched, with nothing added to it.
    const plain = finding({ indicatorId: '6.2', measure: 'local-storage' });
    expect(refile(plain)).toBe(plain);
    expect(refile(plain).refiledFrom).toBeUndefined();
  });

  // A duty that says only where records must be kept is storage, and 6.2's own measure asks for
  // exactly that. An insurer's accounting records "must be kept ... in Australia" scored 6.1's top
  // band as a second local processing measure.
  it('files a duty only to keep something in the economy as storage, not processing', () => {
    const kept = refile(
      finding({ indicatorId: '6.1', measure: 'local-processing', dutyAct: 'must be kept', quote: 'must be kept: ... in Australia' }),
    );
    expect(kept.indicatorId).toBe('6.2');
    expect(kept.measure).toBe('local-storage');
    expect(kept.refiledFrom).toEqual({ indicatorId: '6.1', measure: 'local-processing' });
    // One that names processing as well as holding stays a processing measure.
    const both = finding({
      indicatorId: '6.1',
      measure: 'local-processing',
      dutyAct: 'must not hold the records, or process or handle the information relating to the records, outside Australia',
    });
    expect(refile(both)).toBe(both);
  });

  // A condition on moving currency is a condition on a transfer, and not on a transfer of data.
  it('does not count a condition on a transfer of something other than data', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'IND',
      evidence: [
        evidence(6, 'A Hypothetical Currency Regulation', {
          indicatorId: '6.4',
          measure: 'transfer-condition',
          quote: 'no person shall, without the general or special permission of the Reserve Bank, export or send out of India any foreign currency',
          dutyBearer: 'person',
          dutyAct: 'shall not export',
          dutyForce: 'forbids',
          subjectWords: 'foreign currency',
          placeWords: 'out of India',
          borderWords: 'out of India',
          exceptionWords: 'without the general or special permission of the Reserve Bank',
          definingWords: 'without the general or special permission of the Reserve Bank',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
  });

  // "May transfer" is the permission, "only if" the words the reader copied as the condition. Apart,
  // neither shows "only" beside the permission, and the rule was ruled out as a bare power.
  it('reads a permission and the condition confining it together', () => {
    expect(confinesPermission({ dutyAct: 'may transfer', quote: 'may transfer', definingWords: 'only if' })).toBe(true);
    expect(confinesPermission({ dutyAct: 'may transfer', quote: 'may transfer', definingWords: null })).toBe(false);
  });

  // And the provision that genuinely is a ban still is one.
  it('still scores an outright prohibition', () => {
    const d = decide({
      indicator: indicator61,
      economy: 'SGP',
      evidence: [
        evidence(4, 'A Hypothetical Act', {
          indicatorId: '6.1',
          measure: 'transfer-ban',
          quote: 'An organisation must not transfer any personal data outside Singapore',
          dutyBearer: 'An organisation',
          dutyAct: 'must not transfer',
          dutyForce: 'forbids',
          placeWords: 'outside Singapore',
          locatedData: 'any personal data',
          informationWords: 'personal data',
          exceptionWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });
});

describe('which sentence the row leads with', () => {
  const i73: Indicator = {
    ...indicator62,
    id: '7.3',
    pillarId: 7,
    category: 'Data retention',
    exception: null,
    bands: [
      { score: 1, criterion: 'Minimum period of data retention requirement', ordinal: 1 },
      { score: 0, criterion: 'No data retention requirement', ordinal: 2 },
    ],
  };
  const i74: Indicator = {
    ...indicator62,
    id: '7.4',
    pillarId: 7,
    category: 'Data protection officer',
    exception: null,
    bands: [
      { score: 1, criterion: 'DPO and DPIA OR only DPO requirement, applied to all sectors', ordinal: 1 },
      { score: 0.5, criterion: 'DPO requirement applied to a specific sector', ordinal: 2 },
      { score: 0, criterion: 'No requirement', ordinal: 3 },
    ],
  };

  const retention = (over: Partial<Finding>): Partial<Finding> => ({
    indicatorId: '7.3',
    measure: 'minimum-retention',
    definingWords: 'a period of not less than 5 years',
    placeWords: null,
    locatedData: null,
    informationWords: null,
    dataScope: 'non-personal',
    ...over,
  });

  it('leads with the duty that states the period the band asks for', () => {
    // Both are duties to keep, so both count. Only one shows the band's own test in its own
    // words, and that is the sentence a reviewer should meet first.
    const d = decide({
      indicator: i73,
      economy: 'SGP',
      evidence: [
        evidence(5, 'Building and Construction Authority Act 1999', retention({
          quote: 'The Authority must keep a register of licensees',
          dutyBearer: 'The Authority', dutyAct: 'must keep', dutyForce: 'requires',
          sectorScope: 'specific', sector: 'construction', statedPeriod: null,
        })),
        evidence(6, 'Cybersecurity Act 2018', retention({
          quote: 'A licensee must retain the records for a period of 3 years',
          dutyBearer: 'A licensee', dutyAct: 'must retain', dutyForce: 'requires',
          sectorScope: 'specific', sector: 'cybersecurity', statedPeriod: '3 years',
        })),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.basis[0]!.instrumentTitle).toBe('Cybersecurity Act 2018');
    expect(d.rationale).toContain('must retain the records for a period of 3 years');
    // The other duty still counted, and is still on the record.
    expect(d.basis).toHaveLength(2);
  });

  it('will not lead with a power to appoint in place of a duty to designate', () => {
    // The Commission "may appoint" its own Commissioner: a permission, and the reader marked it
    // mandatory anyway. What answers this indicator is the duty on the organisation.
    const officer = (over: Partial<Finding>): Partial<Finding> => ({
      indicatorId: '7.4',
      measure: 'data-protection-officer',
      placeWords: null,
      locatedData: null,
      informationWords: null,
      dataScope: 'all',
      ...over,
    });
    const d = decide({
      indicator: i74,
      economy: 'SGP',
      evidence: [
        evidence(1, 'Personal Data Protection Act 2012', officer({
          quote: 'The Commission may appoint the Commissioner for Personal Data Protection',
          dutyBearer: 'The Commission', dutyAct: 'may appoint', dutyForce: 'permits',
          roleWords: 'the Commissioner for Personal Data Protection', mandatory: true,
        })),
        evidence(1, 'Personal Data Protection Act 2012', officer({
          quote: 'An organisation must designate one or more individuals',
          dutyBearer: 'An organisation', dutyAct: 'must designate', dutyForce: 'requires',
          roleWords: 'one or more individuals',
        })),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.basis).toHaveLength(1);
    expect(d.basis[0]!.finding.quote).toContain('must designate');
    expect(d.excluded.map((h) => h.reason)).toContain('the provision permits rather than requires');
  });

  it('will not count a duty that appoints nobody', () => {
    // Both of these scored this indicator in Malaysia. Neither puts anyone in a position: one is
    // about obtaining consent and the other is a right the data subject holds.
    const officer = (over: Partial<Finding>): Partial<Finding> => ({
      indicatorId: '7.4',
      measure: 'data-protection-officer',
      placeWords: null,
      locatedData: null,
      informationWords: null,
      dataScope: 'all',
      ...over,
    });
    const d = decide({
      indicator: i74,
      economy: 'MYS',
      evidence: [
        evidence(1, 'Data Sharing Act 2025', officer({
          quote: 'the data recipient shall ensure that the consent of the data provider is obtained',
          dutyBearer: 'the data recipient', dutyAct: 'shall ensure', dutyForce: 'requires',
        })),
        evidence(2, 'Personal Data Protection Act 2010', officer({
          quote: 'A data subject shall be given access to his personal data',
          dutyBearer: 'A data subject', dutyAct: 'shall be given', dutyForce: 'requires',
        })),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded).toHaveLength(2);
    expect(d.excluded[0]!.reason).toContain('appoints no one');
  });

  it('will not count the State appointing its own regulator', () => {
    // Section 47 of Malaysia's Act does put a person in a position, and the position is the
    // Commissioner's. The duty is the Minister's, and this indicator asks what the regulated must do.
    const d = decide({
      indicator: i74,
      economy: 'MYS',
      evidence: [
        evidence(1, 'Personal Data Protection Act 2010', {
          indicatorId: '7.4',
          measure: 'data-protection-officer',
          placeWords: null,
          locatedData: null,
          informationWords: null,
          dataScope: 'all',
          quote: 'The Minister shall appoint any person as the Personal Data Protection Commissioner',
          dutyBearer: 'The Minister', dutyAct: 'shall appoint', dutyForce: 'requires',
          roleWords: 'any person as the Personal Data Protection Commissioner',
          dutyBearerKind: 'government',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded[0]!.reason).toContain('which is the State');
  });

  it('will not count an officer whose role names nothing about data', () => {
    // Mongolia's Insurance Act art. 55: a generic compliance officer for insurance supervision,
    // not a data protection officer. Nothing in the quote or the role mentions data or information.
    const d = decide({
      indicator: i74,
      economy: 'MNG',
      evidence: [
        evidence(1, 'Insurance Act', {
          indicatorId: '7.4',
          measure: 'data-protection-officer',
          placeWords: null,
          locatedData: null,
          informationWords: null,
          dataScope: 'all',
          quote: 'the insurer shall appoint an authorised official responsible for compliance',
          dutyBearer: 'the insurer', dutyAct: 'shall appoint', dutyForce: 'requires',
          roleWords: 'an authorised official responsible for compliance',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(0);
    expect(d.excluded[0]!.reason).toContain('not one named for data or information');
  });

  it('still counts a designated individual where the Act itself is the data protection one', () => {
    // Singapore's own s.11(3): "must designate one or more individuals" never repeats "data" in
    // the sentence; the Act it sits in is the Personal Data Protection Act.
    const d = decide({
      indicator: i74,
      economy: 'SGP',
      evidence: [
        evidence(1, 'Personal Data Protection Act 2012', {
          indicatorId: '7.4',
          measure: 'data-protection-officer',
          placeWords: null,
          locatedData: null,
          informationWords: null,
          dataScope: 'all',
          quote: 'An organisation must designate one or more individuals',
          dutyBearer: 'An organisation', dutyAct: 'must designate', dutyForce: 'requires',
          roleWords: 'one or more individuals',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.basis).toHaveLength(1);
  });
});

describe('a framework indicator, which asks about instruments rather than provisions', () => {
  const i72: Indicator = {
    ...indicator62,
    id: '7.2',
    pillarId: 7,
    category: 'Cybersecurity framework',
    exception: null,
    bands: [
      { score: 0, criterion: 'Dedicated cybersecurity legal framework (horizontal)', ordinal: 3 },
      { score: 0.5, criterion: 'Cybersecurity provisions within a wider law', ordinal: 2 },
      { score: 1, criterion: 'No framework', ordinal: 1 },
    ],
    shape: 'framework',
  };
  const examined = { instrumentsIndexed: 2, instrumentsConsidered: 2, sectionsIndexed: 0, sectionsRead: 0 };

  const instrument = (over: Partial<FrameworkEvidence>): FrameworkEvidence => ({
    instrumentId: 1,
    instrumentTitle: 'Personal Data Protection Act 2010',
    citation: 'https://example.gov/act',
    bindingness: null,
    establishesFramework: true,
    frameworkShown: true,
    horizontal: true,
    dedicated: true,
    dedicatedShown: true,
    sectoralShown: false,
    sector: null,
    quote: 'An Act to regulate the processing of personal data',
    ...over,
  });

  it('will not call an Act dedicated to a subject its own opening never claims', () => {
    // Malaysia's data protection Act came back as its dedicated cybersecurity framework, with the
    // Cyber Security Act examined beside it. An Act says what it is for, and this one says
    // something else, so the words meant to show dedication were not in it to copy.
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [
        instrument({ dedicatedShown: false }),
        instrument({
          instrumentId: 2,
          instrumentTitle: 'Cyber Security Act 2024',
          quote: 'An Act relating to national cyber security',
        }),
      ],
      coverage: examined,
    });
    expect(d.decidingFact).toContain('Cyber Security Act 2024');
    expect(d.decidingFact).not.toContain('Personal Data Protection Act');
  });

  it('does not report a framework absent while a candidate for it went unread', () => {
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [instrument({ establishesFramework: false })],
      coverage: { ...examined, instrumentsConsidered: 1, frameworkUnread: 1 },
    });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
    expect(d.decidingFact).toContain('could not be read');
  });

  it('still finds a framework when another candidate went unread', () => {
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [instrument({})],
      coverage: { ...examined, instrumentsConsidered: 1, frameworkUnread: 1 },
    });
    expect(d.score).toBe(0);
  });

  it('falls to the middle band when no instrument is dedicated to the subject at all', () => {
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [instrument({ dedicatedShown: false })],
      coverage: examined,
    });
    expect(d.score).toBe(0.5);
    expect(d.decidingFact).toContain('limited in reach or subject');
  });

  it('will not call an Act sectoral without the words that confine it to a sector', () => {
    // Malaysia's Cyber Security Act was read as sectoral and Singapore's near-identical one as
    // country-wide. Reach asserted with nothing quoted behind it is held, not taken.
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [instrument({ horizontal: false, sectoralShown: false })],
      coverage: examined,
    });
    expect(d.score).toBe(0);
  });

  it('takes the sectoral claim where the confining words are shown', () => {
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [instrument({ horizontal: false, sectoralShown: true })],
      coverage: examined,
    });
    expect(d.score).toBe(0.5);
  });

  it('takes the confining words over the reader calling the same instrument horizontal', () => {
    // An Act whose opening confines it to listed critical sectors, reported horizontal anyway.
    // The words are in the instrument and the flag is an assertion, so the words decide.
    const d = decide({
      indicator: i72,
      economy: 'MYS',
      evidence: [],
      frameworkEvidence: [instrument({ horizontal: true, sectoralShown: true })],
      coverage: examined,
    });
    expect(d.score).toBe(0.5);
    expect(d.decidingFact).toContain('limited in reach');
  });

  it('still reads an instrument as general where no confining words were found', () => {
    const d = decide({
      indicator: i72,
      economy: 'SGP',
      evidence: [],
      frameworkEvidence: [instrument({ horizontal: true, sectoralShown: false })],
      coverage: examined,
    });
    expect(d.score).toBe(0);
  });

  // 12.9 has two bands and no middle. A sectoral consumer protection law is still a consumer
  // protection law, so it clears; under the old fixed ordinals it would have asked for a band 3
  // this indicator does not have.
  const i129: Indicator = {
    ...i72,
    id: '12.9',
    pillarId: 12,
    category: 'Lack of legal framework for online consumer protection',
    bands: [
      { score: 0, criterion: 'Consumer protection law applicable to online commerce', ordinal: 2 },
      { score: 1, criterion: 'No consumer protection legal framework applicable to online commerce', ordinal: 1 },
    ],
  };

  it('scores a two-band framework indicator without a middle band to fall into', () => {
    const d = decide({
      indicator: i129,
      economy: 'SGP',
      evidence: [],
      frameworkEvidence: [
        instrument({ instrumentTitle: 'Consumer Protection (Fair Trading) Act 2003', horizontal: false, sectoralShown: true }),
      ],
      coverage: examined,
    });
    expect(d.score).toBe(0);
    expect(d.decidingFact).toContain('without regard to its reach');
  });

  it('scores the top band when nothing examined establishes the framework', () => {
    const d = decide({
      indicator: i129,
      economy: 'SGP',
      evidence: [],
      frameworkEvidence: [instrument({ establishesFramework: false })],
      coverage: examined,
    });
    expect(d.score).toBe(1);
    expect(d.frameworkBasis).toHaveLength(0);
  });
});

/* ---------------------------------------------------------------------------------------------
 * Pillar 12. Eleven of its indicators ask only whether a restriction exists, and three do more:
 * 12.2 requires two things at once, 12.6 and 12.7 rank two different measures into two bands.
 * Those three are where a rule can be got wrong, so they are what is tested.
 * ------------------------------------------------------------------------------------------- */

function indicator12(id: string, bands: { score: number; criterion: string }[]): Indicator {
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

const indicator122 = indicator12('12.2', [
  { score: 1, criterion: 'Any measure limits the number of products that can be purchases online AND restrictions to delivery' },
  { score: 0, criterion: 'No measure' },
]);

const indicator126 = indicator12('12.6', [
  { score: 1, criterion: 'Imposition of custom duties on electronic transmission' },
  { score: 0.5, criterion: 'Legal mechanisms or regulations applicable to impose custom duties on electronic transmission' },
  { score: 0, criterion: 'No restriction' },
]);

const indicator127 = indicator12('12.7', [
  { score: 1, criterion: 'Physical presence required, requirements to the registrater a local domain name' },
  { score: 0.5, criterion: 'Local representative required' },
  { score: 0, criterion: 'No restriction' },
]);

/** A pillar-12 finding: none of these measures is locational or appointing unless it says so. */
/** Words that make each measure out, as the provision would put them. The catalogue checks these. */
const DEFINING: Record<string, string> = {
  'transmission-duty': 'a duty of customs on goods delivered electronically',
  'transmission-duty-power': 'may impose a duty of customs on goods transmitted electronically',
  'local-representative': 'a representative resident in Singapore',
  'local-domain-or-presence': 'a registered office in Singapore',
  'local-presence': 'a place of business in Singapore',
  // 12.2's two measures are gated on a word that restricts something, so the fixture has to state
  // one. Without these they fell back to 'outside Singapore', which names a place and forbids
  // nothing -- and the band that requires both was being satisfied by evidence that restricts
  // neither.
  'online-purchase-limit': 'alcohol and tobacco may not be sold online',
  'online-delivery-limit': 'goods bought online must not be delivered to a residential address',
};

function p12(indicatorId: string, measure: string, over: Partial<Finding> = {}): Evidence {
  return {
    ...evidence(1, 'Electronic Commerce Act'),
    finding: finding({
      indicatorId,
      measure,
      ...(DEFINING[measure] ? { definingWords: DEFINING[measure] } : {}),
      placeWords: null,
      locatedData: null,
      informationWords: null,
      dutyForce: 'requires',
      dutyAct: 'shall not sell',
      mandatory: true,
      subjectWords: 'goods sold online',
      ...over,
    }),
  };
}

describe('12.2, whose band requires two things at once', () => {
  it('scores only where both a purchase limit and a delivery restriction were found', () => {
    const d = decide({
      indicator: indicator122,
      economy: 'MYS',
      evidence: [p12('12.2', 'online-purchase-limit'), p12('12.2', 'online-delivery-limit')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('does not score a purchase limit on its own', () => {
    const d = decide({
      indicator: indicator122,
      economy: 'MYS',
      evidence: [p12('12.2', 'online-purchase-limit')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.decidingFact).toContain('the band requires both');
  });
});

describe('10.4, where a mistagged non-ICT export control must not count', () => {
  const indicator104 = indicator12('10.4', [
    { score: 1, criterion: 'Export restriction' },
    { score: 0, criterion: 'No restriction' },
  ]);

  it('does not score a hazardous-waste export permit tagged as ict-export-restriction', () => {
    const d = decide({
      indicator: indicator104,
      economy: 'SGP',
      evidence: [
        p12('10.4', 'ict-export-restriction', {
          quote: 'no person shall export hazardous or other waste except under a permit',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
  });

  it('still scores a genuine ICT export control', () => {
    const d = decide({
      indicator: indicator104,
      economy: 'AUS',
      evidence: [
        p12('10.4', 'ict-export-restriction', {
          quote: 'a permit is required to export cryptographic equipment or telecommunications apparatus',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });
});

describe('12.6, where a power and a duty are different bands', () => {
  it('scores a duty actually imposed at the top band', () => {
    const d = decide({
      indicator: indicator126,
      economy: 'AUS',
      evidence: [p12('12.6', 'transmission-duty'), p12('12.6', 'transmission-duty-power', { mandatory: false })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('scores an unexercised power at the middle band, though it commands no one', () => {
    // The measure is written as a power, so the requirement gate must not hold it -- which is
    // what moving that exemption off 7.5's indicator id and onto the measure is for.
    const d = decide({
      indicator: indicator126,
      economy: 'AUS',
      evidence: [p12('12.6', 'transmission-duty-power', { mandatory: false, dutyForce: 'permits' })],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0.5);
    expect(d.decidingFact).toContain('not exercised');
  });

  it('does not score an ordinary customs duty with no electronic or digital word anywhere in it', () => {
    const d = decide({
      indicator: indicator126,
      economy: 'RUS',
      evidence: [
        p12('12.6', 'transmission-duty', {
          definingWords: 'interest on the amount of the duty overpaid',
          subjectWords: 'a refund of customs duty already paid',
          quote: 'interest is payable on the amount of customs duty refunded to the declarant',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.decidingFact).toContain('no customs duty on electronic transmissions found');
  });

  it('does not score a duty on electronic-commerce goods, which is traded online but not delivered electronically', () => {
    // The actual shape of Russia's false agreement: a federal budget law refunding interest on a
    // late customs-duty refund for "goods of electronic commerce" -- a cross-border online order
    // that still arrives by post, not something transmitted electronically. The bare word
    // "electronic" is there; the word for a transmission or delivery is not.
    const d = decide({
      indicator: indicator126,
      economy: 'RUS',
      evidence: [
        p12('12.6', 'transmission-duty', {
          definingWords: 'interest accrued on a late refund of customs duty on goods of electronic commerce',
          subjectWords: 'goods of electronic commerce',
          quote: 'interest accrued on a late refund of customs duty on goods of electronic commerce',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.decidingFact).toContain('no customs duty on electronic transmissions found');
  });
});

describe('12.7, where being here and sending someone here are different burdens', () => {
  it('puts a presence requirement above a representative requirement', () => {
    const d = decide({
      indicator: indicator127,
      economy: 'SGP',
      evidence: [
        p12('12.7', 'local-representative', { roleWords: 'a local representative' }),
        p12('12.7', 'local-domain-or-presence'),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('holds a representative requirement that appoints no one', () => {
    const d = decide({
      indicator: indicator127,
      economy: 'SGP',
      evidence: [p12('12.7', 'local-representative')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('appoints no one');
  });
});

/**
 * A token a rule looks for and no measure defines is invisible: the reader can never report it,
 * the comparison never matches, and the indicator quietly scores zero for ever. So every token in
 * the vocabulary is fed to its own rule and has to come back counted.
 */
/* ---------------------------------------------------------------------------------------------
 * The inverted indicators, where the top band is the absence of a protection. A retrieval miss
 * here scores 1 rather than 0, so what is tested is the direction of each band.
 * ------------------------------------------------------------------------------------------- */
describe('an indicator whose top band is an absence', () => {
  /** A pillar-5 finding. These measures are grants and permissions, not locational duties. */
  function p5(indicatorId: string, measure: string, over: Partial<Finding> = {}): Evidence {
    return {
      ...evidence(1, 'Telecommunications Act'),
      finding: finding({
        indicatorId, measure, placeWords: null, locatedData: null, informationWords: null,
        dutyForce: 'requires', dutyAct: 'shall keep separate accounts', mandatory: true,
        definingWords: measure === 'trade-defence-measure' ? 'a dumping duty' : 'separate accounts',
        subjectWords: 'a public telecommunications licensee', ...over,
      }),
    };
  }

  const i54 = indicator12('5.4', [
    { score: 1, criterion: 'No function/accounting separation is mandated' },
    { score: 0.5, criterion: 'Only accounting separation is mandated' },
    { score: 0.25, criterion: 'Only functional seperation is mandated' },
    { score: 0, criterion: 'Both accounting and functional separations are mandated' },
  ]);

  const read = { instrumentsConsidered: 1, sectionsIndexed: 20, sectionsRead: 20 };
  const at = (indicator: Indicator, evidence: Evidence[]) =>
    decide({ indicator, economy: 'SGP', evidence, coverage: read });

  it('scores accounting separation alone worse than functional separation alone', () => {
    // The band text puts them that way round, and reading it the other way is the easy mistake:
    // functional separation is the heavier duty, so requiring it leaves less of a problem.
    expect(at(i54, [p5('5.4', 'accounting-separation')]).score).toBe(0.5);
    expect(at(i54, [p5('5.4', 'functional-separation')]).score).toBe(0.25);
    expect(at(i54, [p5('5.4', 'accounting-separation'), p5('5.4', 'functional-separation')]).score).toBe(0);
  });

  // The telecom Act, read, with this pillar's requirements found in it. That is what makes the
  // absence a statement about the law rather than about the search.
  const governing: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'Telecommunications Act', rank: 1 }];
  const alsoInPillar = [p5('5.5', 'strict-licence')];

  it('says nothing when no provision was ever evaluated against the missing measure', () => {
    // A pillar is a dozen questions and the witness qualifies on any of them, so an Act read for
    // its licensing rules can carry a claim about separation that nobody ever asked about.
    // Singapore's "no de minimis threshold" scored the rubric's maximum that way, with not one
    // provision in the corpus ever evaluated for a threshold.
    const d = decide({
      indicator: i54, economy: 'SGP', evidence: alsoInPillar, surfaced: governing, coverage: read,
    });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
    expect(d.decidingFact).toContain('evaluated against the measure');
  });

  it('says nothing when the absence rests on no instrument that governs the subject', () => {
    // Twenty provisions read, none of them from a telecom law: that is a search that missed, and
    // reporting it as the top band is the worst error this rubric can make.
    const d = decide({ indicator: i54, economy: 'SGP', evidence: [], surfaced: [], coverage: read });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
    expect(d.decidingFact).toContain('governs the subject');
  });

  it('says nothing when a provision of the kind was set aside before the reader was asked', () => {
    // Australia's independent-regulator cell claimed the maximum after our own test discarded a
    // provision the reader had confirmed. A silence our machinery made is not the statute's.
    const confirmed = { ...p5('5.4', 'accounting-separation', { dutyForce: 'declares' }), confirmed: true };
    const d = decide({
      indicator: i54, economy: 'SGP', evidence: [...alsoInPillar, confirmed], surfaced: governing, coverage: read,
    });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
    expect(d.decidingFact).toContain('before the reader was asked');
  });

  it('still scores the absence when the reader itself ruled the provision out', () => {
    // The reader, asked about the measure alone, found no words for it. That is a ruling about the
    // provision and it is what this band is entitled to count.
    const ruled = { ...p5('5.4', 'accounting-separation', { dutyForce: 'declares' }), confirmed: false };
    const d = decide({
      indicator: i54, economy: 'SGP', evidence: [...alsoInPillar, ruled], surfaced: governing, coverage: read,
    });
    expect(d.score).toBe(1);
  });

  it('will not take a merely surfaced instrument as the witness for an absence', () => {
    const d = decide({
      indicator: i54, economy: 'SGP', evidence: [], surfaced: governing, coverage: read,
    });
    expect(d.state).toBe('unresolved');
  });

  it('says nothing at all when nothing was read, rather than scoring the absence', () => {
    // This is what stands between "no protection exists" and "the search missed it".
    const d = decide({
      indicator: i54,
      economy: 'SGP',
      evidence: [],
      coverage: { instrumentsConsidered: 1, sectionsIndexed: 20, sectionsRead: 0 },
    });
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
  });

  it('counts trade defence measures a quarter each, up to one', () => {
    const i14 = indicator12('1.4', [
      { score: 1, criterion: 'More than three measures' },
      { score: 0.75, criterion: 'Three measures' },
      { score: 0.5, criterion: 'Two measures' },
      { score: 0.25, criterion: 'One measure' },
      { score: 0, criterion: 'No measure' },
    ]);
    // Distinct provisions, because the band counts measures. Reading one anti-dumping Act section
    // by section is how Australia reported ten and Singapore eleven, against ESCAP's nought.
    let n = 0;
    const m = () => {
      n += 1;
      return {
        ...p5('1.4', 'trade-defence-measure', { dutyAct: 'shall be charged a dumping duty' }),
        sectionId: n,
        instrumentId: n,
      };
    };
    expect(at(i14, []).score).toBe(0);
    expect(at(i14, [m()]).score).toBe(0.25);
    expect(at(i14, [m(), m()]).score).toBe(0.5);
    expect(at(i14, [m(), m(), m()]).score).toBe(0.75);
    expect(at(i14, [m(), m(), m(), m()]).score).toBe(1);
    expect(at(i14, [m(), m(), m(), m(), m()]).score).toBe(1);
  });

  it('counts one provision once, however many times it is read', () => {
    const i14 = indicator12('1.4', [
      { score: 1, criterion: 'More than three measures' },
      { score: 0.75, criterion: 'Three measures' },
      { score: 0.5, criterion: 'Two measures' },
      { score: 0.25, criterion: 'One measure' },
      { score: 0, criterion: 'No measure' },
    ]);
    // Four sections of one Act, read separately. That is one measure, however many provisions
    // carry it -- which is the count Australia got wrong.
    const same = (sectionId: number) => ({
      ...p5('1.4', 'trade-defence-measure', { dutyAct: 'shall be charged a dumping duty' }),
      sectionId,
    });
    expect(at(i14, [same(1), same(2), same(3), same(4)]).score).toBe(0.25);
  });

  it('does not count a power to impose a duty as a duty in force', () => {
    const i14 = indicator12('1.4', [
      { score: 1, criterion: 'More than three measures' },
      { score: 0.75, criterion: 'Three measures' },
      { score: 0.5, criterion: 'Two measures' },
      { score: 0.25, criterion: 'One measure' },
      { score: 0, criterion: 'No measure' },
    ]);
    const power = p5('1.4', 'trade-defence-measure', {
      dutyForce: 'permits',
      dutyAct: 'may impose a duty',
      mandatory: false,
      imposingWords: null,
      prescribingWords: 'the Minister may by notice impose a dumping duty',
    });
    const d = at(i14, [power]);
    expect(d.score).toBe(0);
    expect(d.excluded).toHaveLength(1);
  });
});

describe('the vocabulary and the rules agree', () => {
  /** Tokens the rubric defines so a rule can tell them apart, which do not score on their own. */
  const notScoringAlone = new Set([
    // A duty to stop retaining is the opposite of a minimum period, and 7.3 scores the minimum.
    '7.3:maximum-retention',
    // Accepting a foreign test certificate is what lowers 11.3's band; alone it restricts nothing.
    '11.3:third-party-testing-accepted',
    // 7.4's band is asymmetric on purpose: an impact assessment duty without an officer scores 0.
    '7.4:impact-assessment',
    // 12.2's band requires both halves, so neither half reaches it by itself.
    '12.2:online-purchase-limit',
    '12.2:online-delivery-limit',
    // Pillar 10 scores ICT goods and digital services. These name the trade restrictions on
    // everything else, so the reader has somewhere true to file them instead of calling them ICT.
    '10.1:other-import-ban',
    '10.2:other-import-control',
    '10.4:other-export-restriction',
  ]);

  const stub = (id: string): Indicator =>
    indicator12(id, [{ score: 1, criterion: 'top' }, { score: 0.5, criterion: 'middle' }, { score: 0, criterion: 'none' }]);

  // 12.5 is the one band that compares a figure, so the sweep hands every measure a stated
  // amount and a rate; the rest of them never look at either.
  const ctx = {
    economy: 'SGP',
    rates: { base: 'USD' as const, asOf: '2026-01-01', source: 'test', fetchedAt: '2026-01-01', usdPer: { SGD: 0.75 } },
  };

  for (const [indicatorId, measures] of Object.entries(MEASURES)) {
    const rule = __rules[indicatorId];
    if (!rule) continue;
    for (const m of measures) {
      it(`${indicatorId} counts ${m.token}`, () => {
        const e = p12(indicatorId, m.token, {
          countriesNamed: [], sectorScope: 'all', dataScope: 'personal', definingWords: 'S$400',
        });
        const out = rule(stub(indicatorId), [e], ctx);
        if (notScoringAlone.has(`${indicatorId}:${m.token}`)) {
          expect(out.counted ?? []).not.toContain(e);
        } else {
          expect(out.counted ?? []).toContain(e);
        }
      });
    }
  }
});

/**
 * A duty not to do the act is not the duty to do it.
 *
 * 4.9 asks whether a firm is made to hand over its source code, and in all three economies the
 * provisions answering it were secrecy clauses: the Greenhouse and Energy Minimum Standards Act
 * forbidding an official to disclose, the Commerce (Trade Descriptions) Act forbidding a
 * description that discloses a trade secret, section 52ZA saying nothing in the Division requires
 * the giving of information. "requires" and "forbids" both counted as imposing a duty, so a law
 * written to protect trade secrets made out the requirement to surrender them.
 */
describe('a measure only a command can make out', () => {
  const indicator49: Indicator = {
    id: '4.9',
    pillarId: 4,
    pillarName: 'Intellectual Property Rights',
    category: 'Disclosure of source code',
    exception: null,
    criteriaText: '...',
    bands: [
      { score: 1, criterion: 'Requirement reaching all sectors', ordinal: 1 },
      { score: 0.5, criterion: 'Requirement applied to a specific sector', ordinal: 2 },
      { score: 0, criterion: 'No requirement', ordinal: 3 },
    ],
    shape: 'provision',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
  };

  const on49 = (over: Partial<Finding>) =>
    decide({
      indicator: indicator49,
      economy: 'AUS',
      evidence: [
        evidence(1, 'Greenhouse and Energy Minimum Standards Act 2012', {
          indicatorId: '4.9',
          measure: 'trade-secret-disclosure',
          placeWords: null,
          borderWords: null,
          locatedData: null,
          keepingWords: null,
          subjectWords: 'a trade secret',
          ...over,
        }),
      ],
      surfaced,
      coverage,
    });

  it('holds a provision that forbids the act, and says which act it forbade', () => {
    const d = on49({
      quote: 'The public official must not, except for the purposes of this Act, be required to disclose the information',
      dutyBearer: 'the public official',
      dutyAct: 'must not... be required to disclose',
      dutyForce: 'forbids',
      definingWords: 'the information',
      imposingWords: 'must not',
    });
    expect(d.score).toBe(0);
    expect(d.excluded[0]?.reason).toContain('forbids the act');
    expect(d.excluded[0]?.reason).toContain('must not... be required to disclose');
  });

  it('takes the same provision when it commands the disclosure instead', () => {
    const d = on49({
      quote: 'a supplier must disclose the source code of the software to the regulator',
      dutyBearer: 'a supplier',
      dutyAct: 'must disclose',
      dutyForce: 'requires',
      definingWords: 'the source code of the software',
      imposingWords: 'must disclose',
      sectorScope: 'all',
    });
    expect(d.score).toBe(1);
    expect(d.excluded).toHaveLength(0);
  });

  it('leaves a measure the rubric writes as a prohibition alone', () => {
    // 6.1 is a ban, so forbidding is how it is made out; this hold must not reach it.
    const forbids = MEASURES['6.1']?.find((m) => m.token === 'transfer-ban');
    expect(forbids?.commands).toBeUndefined();
  });

  it('names a Lao currency-mandate clause as the payment domain (12.4.2)', () => {
    // The Law on Management of Foreign Currency: "...ລາຄາສິນຄ້າ, ຄ່າບໍລິການ...ຕ້ອງເປັນເງິນກີບ"
    // ("the price of goods, services... must be in Kip"). PAYMENT_LOCAL's Lao line previously had
    // only payment-service/instrument words, so a genuine currency-mandate provision that names
    // neither missed the domain and was held as English-only.
    const domain = SUBJECT_DOMAIN['12.4.2'];
    expect(domain?.test('ລາຄາສິນຄ້າ, ຄ່າບໍລິການ ຕ້ອງເປັນເງິນກີບ')).toBe(true);
  });
});

/**
 * Australian Privacy Principle 8 is ESCAP's whole answer for Australia 6.4, and we threw it away.
 *
 * The reader filed it under 6.1 as a ban, and the rubric moved it to 6.4 -- correctly, since a
 * duty to take steps before data goes is the way through, not the wall. But the words that had
 * made out the ban travelled with it, and "overseas" is no answer to what condition lets the data
 * leave, so the check meant to catch that discarded the one provision that answers the cell.
 */
describe('a finding the rubric moves into 6.4', () => {
  const app8 = finding({
    indicatorId: '6.1',
    measure: 'transfer-ban',
    quote: 'the entity must take such steps as are reasonable in the circumstances to ensure that the overseas recipient does not breach the Australian Privacy Principles',
    dutyBearer: 'the entity',
    dutyAct: 'must take such steps',
    dutyForce: 'requires',
    definingWords: 'overseas',
    placeWords: 'overseas',
    borderWords: 'overseas',
    exceptionWords: null,
    imposingWords: 'must',
  });

  it('is asked the new measure’s question, not left holding the old one’s answer', () => {
    expect(refile(app8).definingWords).toBe('must take such steps');
  });

  it('scores the cell rather than being held as a place restated', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'AUS',
      evidence: [{ ...evidence(1, 'Privacy Act 1988'), finding: refile(app8) }],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.excluded).toHaveLength(0);
  });
});

// 29 September: Lao PDR's rule that an internet café "must have suitable premises" was confirmed in
// Lao as a local presence requirement and scored 12.8's top band.
describe('a requirement to be present in the economy', () => {
  const indicator128 = indicator12('12.8', [
    { score: 1, criterion: 'Local presence requirement for at least one sector' },
    { score: 0, criterion: 'No requirement' },
  ]);
  const lao = (words: string) => ({
    ...p12('12.8', 'local-presence', {
      quote: `ຜູ້ໃຫ້ບໍລິການອອນລາຍ ຕ້ອງມີ${words}`,
      definingWords: words,
      subjectWords: 'ຜູ້ໃຫ້ບໍລິການອອນລາຍ',
      dutyBearer: 'ຜູ້ໃຫ້ບໍລິການອອນລາຍ',
    }),
    sectionLanguage: 'lo',
    confirmed: true,
  });

  it('is not made out by premises that are nowhere in particular', () => {
    const d = decide({ indicator: indicator128, economy: 'LAO', evidence: [lao('ສະຖານທີ່ເໝາະສົມ')], surfaced, coverage });
    expect(d.basis).toHaveLength(0);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('names no place');
  });

  it('is made out where the provision puts the provider in the country', () => {
    const d = decide({ indicator: indicator128, economy: 'LAO', evidence: [lao('ທີ່ຕັ້ງສໍານັກງານ ຢູ່ ສປປ ລາວ')], surfaced, coverage });
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('names no place');
  });
});

// 30 September: 236-ФЗ art.5 requires a foreign online seller to "создать филиал, или открыть
// представительство, или учредить российское юридическое лицо" (open a branch, a representative
// office, or establish a Russian legal entity). The last option names no place by the shared word
// lists -- "российское" (Russian) is not "территории" or "иностранн" -- even though it plainly
// puts the seller in the country by naming the country's own adjective. The place test now also
// asks the economy's own profile, via `demonym`.
describe('a requirement to be present in the economy, named by the economy’s own demonym', () => {
  const indicator128 = indicator12('12.8', [
    { score: 1, criterion: 'Local presence requirement for at least one sector' },
    { score: 0, criterion: 'No requirement' },
  ]);

  it('names no place by a Russian legal-entity requirement before the demonym is checked, in an unprofiled economy', () => {
    const d = decide({
      indicator: indicator128,
      economy: 'XXX',
      evidence: [p12('12.8', 'commercial-presence', { definingWords: 'учредить российское юридическое лицо', quote: 'учредить российское юридическое лицо' })],
      surfaced,
      coverage,
    });
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('names no place');
  });

  it('is made out for Russia by "российское юридическое лицо", the country’s own adjective', () => {
    const d = decide({
      indicator: indicator128,
      economy: 'RUS',
      evidence: [p12('12.8', 'commercial-presence', { definingWords: 'учредить российское юридическое лицо', quote: 'учредить российское юридическое лицо' })],
      surfaced,
      coverage,
    });
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('names no place');
  });

  it('is made out for Mongolia by "Монгол Улсын", the country’s own name', () => {
    const d = decide({
      indicator: indicator128,
      economy: 'MNG',
      evidence: [p12('12.8', 'commercial-presence', { definingWords: 'Монгол Улсын хуулийн этгээд байгуулах', quote: 'Монгол Улсын хуулийн этгээд байгуулах' })],
      surfaced,
      coverage,
    });
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('names no place');
  });
});

// Thailand's own word for "a foreign country" -- "ต่างประเทศ" -- is not a substring of "ต่างด้าว"
// (alien) or "ต่างชาติ" (foreign nationality), the two Thai nationality words already in NATIONALITY.
// A BOT payment notice's card-network licence, "นิติบุคคลต่างประเทศ ต้องมีสํานักงานสาขาหรือสํานักงาน
// ผู้แทนในประเทศไทย" (a foreign legal entity must have a branch or representative office in
// Thailand), named its dutyBearer that way and was excluded as naming no foreign party at all.
describe('commercial-presence named by Thailand’s own word for "a foreign country"', () => {
  const indicator35: Indicator = {
    id: '3.5',
    pillarId: 3,
    pillarName: 'Foreign Investment Policies',
    category: 'test',
    exception: null,
    criteriaText: '...',
    bands: [
      { score: 1, criterion: 'Requirement to establish a commercial presence before supplying a service', ordinal: 1 },
      { score: 0, criterion: 'No requirement', ordinal: 2 },
    ],
    shape: 'provision',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
  };
  const tha = evidence(1, 'Re: Regulations, Procedures and Conditions on Application for License to Undertake', {
    indicatorId: '3.5',
    measure: 'commercial-presence',
    dutyBearer: 'นิติบุคคลต่างประเทศ',
    dutyBearerKind: 'organisation',
    quote: 'นิติบุคคลต่างประเทศ ต้องมีสํานักงานสาขาหรือสํานักงานผู้แทนในประเทศไทย',
    definingWords: 'สํานักงานสาขาหรือสํานักงานผู้แทน',
    subjectWords: 'ธุรกิจระบบเครือข่ายบัตร',
    placeWords: 'ในประเทศไทย',
  });

  it('is not excluded as naming no foreign party', () => {
    const d = decide({ indicator: indicator35, economy: 'THA', evidence: [tha], surfaced, coverage });
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('names no foreign party');
    expect(d.basis).toHaveLength(1);
    expect(d.score).toBe(1);
  });
});

// A local-bank-account requirement that never says the word bank, in any language, is not
// credible evidence of one -- confirmation or not. Mongolia's e-invoicing rule ("цахим төлбөрийн
// баримт", an electronic tax receipt) was confirmed as naming this measure and scored it.
describe('a local-bank-account requirement that never says bank', () => {
  const indicator1241 = indicator12('12.4.1', [
    { score: 1, criterion: 'Requirement to use a local bank account' },
    { score: 0, criterion: 'No requirement' },
  ]);
  const mng = (definingWords: string, quote: string, subjectWords: string) => ({
    ...p12('12.4.1', 'local-bank-account', {
      quote,
      definingWords,
      subjectWords,
      dutyBearer: 'татвар төлөгч',
    }),
    sectionLanguage: 'mn',
    confirmed: true,
  });

  it('is not made out by an e-invoice receipt confirmed in Mongolian as this measure', () => {
    const d = decide({
      indicator: indicator1241,
      economy: 'MNG',
      evidence: [
        mng(
          'цахим төлбөрийн баримт',
          'татвар төлөгч нь цахим төлбөрийн баримт үйлдэнэ',
          'цахим төлбөрийн баримт',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('names no bank');
  });

  it('is made out where the account is at a named bank', () => {
    const d = decide({
      indicator: indicator1241,
      economy: 'MNG',
      evidence: [
        mng(
          'дансаараа Монголбанкинд тооцоо хийнэ',
          'шууд бус оролцогч Монголбанкинд байгаа дансаараа тооцоо хийнэ',
          'төлбөр тооцоо',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('names no bank');
  });
});

describe('a residual payment restriction that names no restricting word', () => {
  const indicator1247 = indicator12('12.4.7', [
    { score: 1, criterion: 'Any other restriction on making or receiving payment online' },
    { score: 0, criterion: 'No restriction' },
  ]);
  const other = (economy: string, language: string, definingWords: string, quote: string, subjectWords: string = quote) => ({
    ...p12('12.4.7', 'other-payment-restriction', { quote, definingWords, subjectWords }),
    sectionLanguage: language,
    confirmed: true,
  });

  it('is not made out by a bare noun phrase confirmed in Russian as this measure', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'RUS',
      evidence: [other('RUS', 'ru', 'Количество товара', 'Количество товара, подлежащего передаче покупателю, предусматривается договором')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('names nothing that prohibits');
  });

  it('is made out where the same Act name is quoted alongside its own prohibition word', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'MNG',
      evidence: [
        other(
          'MNG',
          'mn',
          'Үндэсний төлбөрийн системийн тухай хууль',
          'Үндэсний төлбөрийн системийн тухай хуулиар хориглосон үйл ажиллагааг эрхэлсэн бол',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('is not made out where the Act name is the whole of the quote, with no restricting word at all', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'MNG',
      evidence: [other('MNG', 'mn', 'Үндэсний төлбөрийн системийн тухай хууль', 'Үндэсний төлбөрийн системийн тухай хууль')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
  });

  it('is not made out where Mongolian negates the requirement word with -гүй', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'MNG',
      evidence: [
        other(
          'MNG',
          'mn',
          'Цахим худалдааны токенжуулсан гүйлгээнд',
          'Цахим худалдааны токенжуулсан гүйлгээнд энэ журмын 5.36.2-т заасан баталгаажуулалтыг шаардахгүй',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
  });

  it('is made out by a genuine prohibition confirmed in Russian', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'RUS',
      evidence: [
        other(
          'RUS',
          'ru',
          'запрет приема',
          'запрет приема на территории Российской Федерации электронных средств платежа, предоставленных иностранным поставщиком',
          'электронных средств платежа, предоставленных иностранным поставщиком платежных услуг',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('is made out by a genuine prohibition confirmed in Mongolian', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'MNG',
      evidence: [
        other(
          'MNG',
          'mn',
          'нэвтрүүлэхийг хориглоно',
          'амьтан, ургамал, түүхий эд, бүтээгдэхүүнийг улсын хилээр нэвтрүүлэхийг хориглоно',
          'цахим мөнгө',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('is made out by a genuine prohibition confirmed in Lao', () => {
    const d = decide({
      indicator: indicator1247,
      economy: 'LAO',
      evidence: [other('LAO', 'lo', 'ຫ້າມທະນາຄານທຸລະກິດ', 'ຫ້າມທະນາຄານທຸລະກິດ', 'ການຊຳລະເງິນ')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });
});

// national-payment-standard's only term of art (STANDARD, in measures.ts) is English, the same gap
// RESTRICTION_ANY closes above -- Mongolia's Customs Act named "цахим мөнгө" as the whole of its
// defining words for this measure too, and Russia's genuine Bank-of-Russia citation is drafted as
// "требования к защите информации" ("information-security requirements"), never "стандарт".
describe('a national-payment-standard measure that names no standard or requirement', () => {
  const indicator1243 = indicator12('12.4.3', [
    { score: 1, criterion: 'Requirement on the standard used for domestic payments' },
    { score: 0, criterion: 'No requirement' },
  ]);
  const other = (economy: string, language: string, definingWords: string, quote: string, subjectWords: string) => ({
    ...p12('12.4.3', 'national-payment-standard', { quote, definingWords, subjectWords }),
    sectionLanguage: language,
    confirmed: true,
  });

  it('is not made out by a bare "цахим мөнгө" confirmed in Mongolian as this measure', () => {
    const d = decide({
      indicator: indicator1243,
      economy: 'MNG',
      evidence: [other('MNG', 'mn', 'цахим мөнгө', 'олон улсын шуудангаар цахим мөнгө хүлээн авахыг хориглоно', 'цахим мөнгө')],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('names no standard');
  });

  it('is made out by a genuine information-security requirement confirmed in Russian', () => {
    const d = decide({
      indicator: indicator1243,
      economy: 'RUS',
      evidence: [
        other(
          'RUS',
          'ru',
          'требований к защите информации',
          'обязаны обеспечивать соблюдение установленных Банком России требований к защите информации при осуществлении переводов денежных средств',
          'переводов денежных средств',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(1);
  });

  it('is not made out by an unrelated Russian "требование" that names no protection or security', () => {
    const d = decide({
      indicator: indicator1243,
      economy: 'RUS',
      evidence: [
        other(
          'RUS',
          'ru',
          'требования к оформлению документов',
          'Центральный банк устанавливает требования к оформлению документов при переводе денежных средств',
          'переводе денежных средств',
        ),
      ],
      surfaced,
      coverage,
    });
    expect(d.score).toBe(0);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('names no standard');
  });
});

describe('Lao PDR read in its own words', () => {
  const indicatorAt = (id: string, bands: { score: number; criterion: string }[], exception: string | null = null): Indicator => ({
    ...indicator12(id, bands),
    pillarId: Number(id.split('.')[0]),
    exception,
  });
  const lao = (indicatorId: string, measure: string, over: Partial<Finding>): Evidence => ({
    ...p12(indicatorId, measure, over),
    sectionLanguage: 'lo',
    confirmed: true,
  });
  const reasons = (d: ReturnType<typeof decide>) => [...d.excluded, ...d.held].map((x) => x.reason).join(' | ');

  const indicator64 = indicatorAt('6.4', [
    { score: 1, criterion: 'Conditions for all sectors or personal data' },
    { score: 0.5, criterion: 'Conditions for specific data or non-personal data' },
    { score: 0, criterion: 'No condition' },
  ]);
  const transfer = (borderWords: string) =>
    lao('6.4', 'transfer-condition', {
      quote: `ບໍ່ສາມາດສົ່ງ ຫຼື ໂອນ ຂໍ້ມູນສ່ວນບຸກຄົນ ${borderWords} ຖ້າຫາກບໍ່ໄດ້ຮັບຄໍາເຫັນດີຂອງເຈົ້າຂອງຂໍ້ມູນນັ້ນ`,
      borderWords,
      definingWords: 'ຖ້າຫາກບໍ່ໄດ້ຮັບຄໍາເຫັນດີຂອງເຈົ້າຂອງຂໍ້ມູນນັ້ນ',
      subjectWords: 'ຂໍ້ມູນສ່ວນບຸກຄົນ',
      dutyBearer: 'ບຸກຄົນ, ນິຕິບຸກຄົນ ແລະ ການຈັດຕັ້ງ',
      dutyForce: 'forbids',
    });

  it('finds the border in "out of the Lao PDR", with or without the marks the text layer drops', () => {
    for (const words of ['ການອອກນອກ ສປປ ລາວ', 'ໄປຕາງປະເທດ', 'ການນາໍເຂົາ']) {
      const d = decide({ indicator: indicator64, economy: 'LAO', evidence: [transfer(words)], surfaced, coverage });
      expect(reasons(d)).not.toContain('enters or leaves the economy');
    }
  });

  it('finds none where nothing leaves the country', () => {
    const d = decide({ indicator: indicator64, economy: 'LAO', evidence: [transfer('ຈາກໂຮງງານ')], surfaced, coverage });
    expect(reasons(d)).toContain('enters or leaves the economy');
  });

  const indicator94 = indicatorAt(
    '9.4',
    [
      { score: 1, criterion: 'Any strict licence requirement' },
      { score: 0.5, criterion: 'Any licensing scheme' },
      { score: 0, criterion: 'No restriction' },
    ],
    'Not cover license for telecommunication facilities and service providers (captured under Pillar 5), License for e-commerce platform (captured under Pillar 12)',
  );
  const licence = (subjectWords: string) =>
    lao('9.4', 'content-licence', {
      quote: `ຜູ້ທີ່ມີຈຸດປະສົງດໍາເນີນທຸລະກິດ${subjectWords} ຕ້ອງຂໍອະນຸຍາດ`,
      definingWords: 'ຕ້ອງຂໍອະນຸຍາດ',
      subjectWords,
      dutyBearer: `ຜູ້ດໍາເນີນທຸລະກິດ${subjectWords}`,
    });

  it("leaves an internet service provider's licence to pillar 5, as the rubric's exception says", () => {
    const d = decide({ indicator: indicator94, economy: 'LAO', evidence: [licence('ບໍລິການອິນເຕີເນັດ')], surfaced, coverage });
    expect(d.basis).toHaveLength(0);
    expect(reasons(d)).toContain('captured under Pillar 5');
  });

  it('keeps a licence to publish news online', () => {
    const d = decide({ indicator: indicator94, economy: 'LAO', evidence: [licence('ຂ່າວສານຜ່ານເວັບໄຊ')], surfaced, coverage });
    expect(reasons(d)).not.toContain('captured under Pillar 5');
  });

  it('reads "must comply with the relevant laws and regulations" as a pointer to them, not a licence condition', () => {
    const d = decide({
      indicator: indicator94,
      economy: 'LAO',
      evidence: [
        lao('9.4', 'strict-content-licence', {
          quote: 'ຕ້ອງປະຕິບັດຕາມກົດຫມາຍ ແລະ ລະບຽບການທີ່ກ່ຽວຂ້ອງ',
          definingWords: 'ກົດຫມາຍ ແລະ ລະບຽບການ',
          subjectWords: 'ສູນຂໍ້ມູນຂ່າວສານຜ່ານອິນເຕີເນັດ',
          dutyBearer: 'ບຸກຄົນ, ນິຕິບຸກຄົນ ຫຼື ການຈັດຕັ້ງ',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.basis).toHaveLength(0);
    expect(reasons(d)).toContain('rules made elsewhere');
  });

  const indicator55 = indicatorAt('5.5', [
    { score: 1, criterion: 'For any strict licensing scheme (e.g., discrimination for foreign providers, minimum capital requirements, and mandatory performances requirements)' },
    { score: 0, criterion: 'No strict licensing scheme' },
  ]);
  const telecom = (definingWords: string): Evidence =>
    lao('5.5', 'strict-telecom-licence', {
      quote: `ຜູ້ຂໍອະນຸຍາດດໍາເນີນທຸລະກິດໂທລະຄົມມະນາຄົມ ຕ້ອງ${definingWords}`,
      definingWords,
      subjectWords: 'ທຸລະກິດໂທລະຄົມມະນາຄົມ',
      dutyBearer: 'ຜູ້ຂໍອະນຸຍາດ',
      sector: 'telecommunications',
    });
  const notStrict = 'which is what makes a licence strict';

  it('does not call a licence strict for conditions every licence has', () => {
    for (const words of ['ມີທະບຽນວິສາຫະກິດ', 'ມີຖານະທາງດ້ານການເງິນທີ່ຫມັ້ນຄົງ']) {
      const d = decide({ indicator: indicator55, economy: 'LAO', evidence: [telecom(words)], surfaced, coverage });
      expect(d.basis).toHaveLength(0);
      expect(reasons(d)).toContain(notStrict);
    }
  });

  it('calls it strict for a minimum of capital, or for what the regulator writes into the licence', () => {
    const capital = decide({ indicator: indicator55, economy: 'LAO', evidence: [telecom('ມີທຶນຈົດທະບຽນ ບໍ່ໜ້ອຍກວ່າ 10 ຕື້ກີບ')], surfaced, coverage });
    expect(reasons(capital)).not.toContain(notStrict);
    const singapore = decide({
      indicator: indicator55,
      economy: 'SGP',
      evidence: [
        p12('5.5', 'strict-telecom-licence', {
          quote: 'A licence may include conditions requiring the licensee to do, or not to do, such things as are specified in the licence',
          definingWords: 'such things as are specified in the licence',
          subjectWords: 'telecommunication licence',
          dutyBearer: 'the licensee',
          sector: 'telecommunications',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(reasons(singapore)).not.toContain(notStrict);
  });

  const indicator1242 = indicatorAt('12.4.2', [
    { score: 1, criterion: 'Requirements on the currency used for international payments' },
    { score: 0, criterion: 'No restriction' },
  ]);

  it('reads Lao "must" as a duty, whatever the reader called it', () => {
    const d = decide({
      indicator: indicator1242,
      economy: 'LAO',
      evidence: [
        lao('12.4.2', 'payment-currency', {
          quote: 'ເງິນເອເລັກໂຕຣນິກ ຕ້ອງເປັນສະກຸນເງິນກີບ ເທົ່ານັ້ນ',
          definingWords: 'ສະກຸນເງິນກີບ',
          subjectWords: 'ເງິນເອເລັກໂຕຣນິກ',
          dutyBearer: 'ຜູ້ໃຫ້ບໍລິການຊໍາລະເງິນ',
          dutyAct: 'ຕ້ອງເປັນ',
          dutyForce: 'declares',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(reasons(d)).not.toContain('declares what is the case');
  });

  it('does not take the words naming what a duty binds for words leaving it to another instrument', () => {
    const d = decide({
      indicator: indicator1242,
      economy: 'LAO',
      evidence: [
        p12('12.4.2', 'payment-currency', {
          quote: 'Electronic money issued by Payment Service Providers in the Lao PDR shall be in KIP only.',
          definingWords: 'in KIP only',
          subjectWords: 'Electronic money',
          dutyBearer: 'Payment Service Providers',
          dutyAct: 'shall be in KIP only',
          imposingWords: null,
          prescribingWords: null,
        }),
      ],
      surfaced,
      coverage,
    });
    expect(reasons(d)).not.toContain('empowers another instrument');
  });

  const indicator45 = indicatorAt('4.5', [
    { score: 1, criterion: 'Lack of copyright legal framework OR lack of copyright exceptions' },
    { score: 0.5, criterion: 'Unclear copyright exceptions, such as three-step test and other types of copyright exceptions' },
    { score: 0, criterion: 'Clear copyright exceptions following fair use or fair dealing model' },
  ]);
  const fairUse = (instrumentTitle: string): Evidence => ({
    ...lao('4.5', 'fair-use-exception', {
      quote: 'ການນໍາໃຊ້ທີ່ເຫນາະສົມ',
      definingWords: 'ການນໍາໃຊ້ທີ່ເຫນາະສົມ',
      subjectWords: 'ການນໍາໃຊ້ທີ່ເຫນາະສົມ',
      dutyForce: 'permits',
    }),
    instrumentTitle,
  });

  it("takes a copyright exception's domain from the title of the copyright decree it is in", () => {
    const d = decide({ indicator: indicator45, economy: 'LAO', evidence: [fairUse('ຂໍ້ຕົກລົງວ່າດ້ວຍ ລິຂະສິດ ແລະ ສິດກ່ຽວຂ້ອງກັບລິຂະສິດ')], surfaced, coverage });
    expect(reasons(d)).not.toContain("this indicator's subject is stated only in English");
    expect(d.score).toBe(0);
  });

  it('does not take it from a law about something else', () => {
    const d = decide({ indicator: indicator45, economy: 'LAO', evidence: [fairUse('ກົດໝາຍວ່າດ້ວຍ ທີ່ດິນ')], surfaced, coverage });
    expect(d.basis).toHaveLength(0);
  });
});

// 11.1's own subject -- the body that sets, accredits or certifies conformity -- is narrower than
// its indicator's blanket "technical standard" domain, which reaches every provision about
// adopting or importing one. Without a MEASURE_DOMAIN entry of its own, a genuine nationality bar
// on who may run that body, stated in Russian or Thai, was held rather than counted: the subject
// named the body, not the English word "standard".
describe('foreign-exclusion-from-standards, named by the accrediting or certifying body', () => {
  const indicator111: Indicator = {
    id: '11.1',
    pillarId: 11,
    pillarName: 'Standards and Procedures',
    category: 'Lack of transparent technical standards',
    exception: null,
    criteriaText: '...',
    bands: [
      { score: 1, criterion: 'Not allowed foreigners to participate in the standard-setting bodies, OR non transparent standard-setting', ordinal: 1 },
      { score: 0, criterion: 'No restriction', ordinal: 2 },
    ],
    shape: 'provision',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
  };
  const found = (over: Partial<Finding>) =>
    evidence(1, 'test instrument', { indicatorId: '11.1', measure: 'foreign-exclusion-from-standards', dutyForce: 'forbids', ...over });
  const reasons = (d: ReturnType<typeof decide>) => [...d.excluded, ...d.held].map((x) => x.reason).join(' | ');

  it('is not held for Russia, whose accreditation body is named in Russian', () => {
    const ru = {
      ...found({
        dutyBearer: 'иностранные юридические лица',
        dutyAct: 'не могут выступать',
        definingWords: 'иностранные юридические лица',
        subjectWords: 'органа по аккредитации',
        quote: 'В качестве органа по аккредитации не могут выступать иностранные юридические лица',
      }),
      sectionLanguage: 'ru',
      confirmed: true,
    };
    const d = decide({ indicator: indicator111, economy: 'RUS', evidence: [ru], surfaced, coverage });
    expect(reasons(d)).not.toContain("this indicator's subject is stated only in English");
    expect(d.basis).toHaveLength(1);
    expect(d.score).toBe(1);
  });

  it('is not held for Thailand, whose inspection/certification licensee is named in Thai', () => {
    const th = {
      ...found({
        dutyBearer: 'ผู้ขอรับใบอนุญาตตรวจสอบหรือรับรองซึ่งเป็นบุคคลธรรมดา',
        dutyAct: 'ต้องมี',
        definingWords: 'มีสัญชาติไทย',
        subjectWords: 'ผู้ขอรับใบอนุญาตตรวจสอบหรือรับรอง',
        quote: 'มีสัญชาติไทย',
      }),
      sectionLanguage: 'th',
      confirmed: true,
    };
    const d = decide({ indicator: indicator111, economy: 'THA', evidence: [th], surfaced, coverage });
    expect(reasons(d)).not.toContain("this indicator's subject is stated only in English");
    expect(d.basis).toHaveLength(1);
    expect(d.score).toBe(1);
  });

  it('still does not count a provision about importing or adopting a foreign standard, not about the body', () => {
    const d = decide({
      indicator: indicator111,
      economy: 'MNG',
      evidence: [
        found({
          dutyBearer: 'стандартчилалын алба',
          definingWords: 'олон улсын стандартыг',
          subjectWords: 'олон улсын стандартыг нэвтрүүлэх',
          quote: 'олон улсын стандартыг үндэсний стандарт болгон нэвтрүүлж болно',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.basis).toHaveLength(0);
  });
});

// India's Public Procurement (Preference to Make in India) Order 2017 cl.13A requires a joint
// venture with an Indian company only "to participate in the tender" -- a bidder's condition on
// one public contract, which is pillar 2's subject, not a standing market-entry requirement.
describe('a joint-venture duty scoped to the tender, not to entering the market', () => {
  const indicator32: Indicator = {
    id: '3.2',
    pillarId: 3,
    pillarName: 'Foreign Investment Policies',
    category: 'test',
    exception: null,
    criteriaText: '...',
    bands: [
      { score: 1, criterion: 'Requirement to form a joint venture with a local company', ordinal: 1 },
      { score: 0, criterion: 'No requirement', ordinal: 2 },
    ],
    shape: 'provision',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
  };
  // Real cl.13A shape: subjectWords names the goods, not the tender -- the tender scoping sits in
  // the quote and conditionWords instead, so the carve-out has to look at those too.
  const ind = evidence(1, 'Public Procurement (Preference to Make in India) Order 2017', {
    indicatorId: '3.2',
    measure: 'joint-venture',
    dutyBearer: 'foreign companies',
    subjectWords: 'all goods, services or works',
    definingWords: 'joint venture',
    targetWords: 'tender',
    conditionWords: 'beyond which foreign companies shall enter into a joint venture with an Indian company to participate in the tender',
    quote: 'foreign companies shall enter into a joint venture with an Indian company to participate in the tender',
  });

  it('is excluded as scoped to the tender, not to market entry', () => {
    const d = decide({ indicator: indicator32, economy: 'IND', evidence: [ind], surfaced, coverage });
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('scoped to the tender');
    expect(d.basis).toHaveLength(0);
    expect(d.score).toBe(0);
  });

  it('still counts an ordinary joint-venture requirement naming no tender or procurement', () => {
    const d = decide({
      indicator: indicator32,
      economy: 'IND',
      evidence: [
        evidence(2, 'Foreign Exchange Management Act', {
          indicatorId: '3.2',
          measure: 'joint-venture',
          dutyBearer: 'a foreign investor',
          subjectWords: 'a joint venture with a local company',
          definingWords: 'joint venture',
          quote: 'a foreign investor may only invest through a joint venture with a local company',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('scoped to the tender');
    expect(d.basis).toHaveLength(1);
  });
});

describe('an official-secrecy clause is not a trade-secret regime', () => {
  const indicator41: Indicator = {
    id: '4.1',
    pillarId: 4,
    pillarName: 'Intellectual Property Rights',
    category: 'test',
    exception: null,
    criteriaText: '...',
    bands: [
      { score: 1, criterion: 'Effective protection of trade secrets in any form', ordinal: 3 },
      { score: 0.5, criterion: 'Limited scope, or clauses in a wider law', ordinal: 2 },
      { score: 0, criterion: 'Lack of framework', ordinal: 1 },
    ],
    shape: 'provision',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
  };

  // The clause that recurs, word for word, across five unrelated Malaysian Acts (Trademarks 2019,
  // GI 2022, Price Control 2011, Competition 2010, Consumer Protection 1999): a regulator's own
  // secrecy duty over what it collected under the Act, not a remedy for the trade-secret holder.
  const officialSecrecy = evidence(1, 'Competition Act 2010', {
    indicatorId: '4.1',
    measure: 'trade-secret-protection',
    dutyBearer: 'Any person',
    dutyAct: 'discloses or makes use',
    dutyForce: 'forbids',
    definingWords: 'confidential information',
    subjectWords: 'trade, business or industrial information',
    targetWords: 'information or document with respect to a particular enterprise or the affairs of an individual',
    exceptionWords:
      'the disclosure is made to facilitate the performance of the functions or powers of the Commission, or in connection with the investigation of an offence under this Act',
    imposingWords: 'commits an offence',
    quote: 'Any person who discloses or makes use of any confidential information or document',
  });

  it('is excluded, leaving a clean absence rather than an unresolved cell', () => {
    const d = decide({ indicator: indicator41, economy: 'MYS', evidence: [officialSecrecy], surfaced, coverage });
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('official-secrecy clause');
    expect(d.basis).toHaveLength(0);
    expect(d.score).toBe(0);
  });

  it('still counts a genuine remedy for misuse of a trade secret', () => {
    const d = decide({
      indicator: indicator41,
      economy: 'SGP',
      evidence: [
        evidence(2, 'Confidentiality of Information Act', {
          indicatorId: '4.1',
          measure: 'trade-secret-protection',
          dutyBearer: 'a person who misappropriates a trade secret',
          dutyAct: 'may be restrained by injunction',
          dutyForce: 'requires',
          definingWords: 'restrained by injunction for misuse of a trade secret',
          subjectWords: 'trade secret',
          quote: 'the holder of a trade secret may restrain its misuse by injunction',
        }),
      ],
      surfaced,
      coverage,
    });
    expect(d.excluded.map((x) => x.reason).join(' ')).not.toContain('official-secrecy clause');
    expect(d.basis).toHaveLength(1);
    expect(d.score).toBe(1);
  });
});
