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
  type Evidence,
  type FrameworkEvidence,
  type SurfacedInstrument,
  __rules,
} from '../src/decide/index.js';
import { MEASURES } from '../src/rubric/measures.js';
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
      frameworkEvidence: [instrument({ horizontal: false, sectoralShown: true })],
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
  'transmission-duty': 'a duty of customs on the transmission',
  'transmission-duty-power': 'may impose a duty of customs',
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
