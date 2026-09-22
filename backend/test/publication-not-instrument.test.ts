/**
 * A document published *about* the law, kept out of the places the law belongs.
 *
 * The defect, found in the Australia/Singapore run of 21 September 2026: `kindOf` reads a title,
 * and a title that mentions an Act reads exactly like one that is an Act. So IP Australia's
 * consultation papers, APRA's FAQs, MAS's media releases and a row of agency landing pages were
 * registered as primary legislation -- 132 documents across three economies. The shortlist holds
 * half of every governing list for Acts, to stop 23,693 regulations burying 1,264 statutes, so
 * those papers competed inside the reserve built to protect statutes and won places in it: 465 of
 * the run's 7,470 reading seats, and 63 of AUS 12.7's 204.
 *
 * Two guards, because the defect has two ends. Registration stops a publication being called an
 * Act; the decision stops one being reported as the Act that governs a subject.
 */
import { describe, expect, it } from 'vitest';
import { registeredKind } from '../src/discover/titles.js';
import { mayGovern } from '../src/retrieve/index.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import { loadRubric } from '../src/rubric/index.js';

describe('what a listing will support calling an instrument', () => {
  it('keeps an Act the source states an identifier or a standing for', () => {
    // Australia numbers everything, and a short Act is still an Act: three sections, Act No. 220.
    expect(registeredKind('act', { officialNumber: 'No. 220, 1992', status: 'in-force' })).toBe('act');
    // Singapore names 87 of its statutes by title alone, and states a standing for every one.
    // Demanding both would retire the Banking Act 1970 at 308 sections.
    expect(registeredKind('act', { officialNumber: null, status: 'in-force' })).toBe('act');
    // Malaysia states the number and the repeal, which is still the register speaking.
    expect(registeredKind('act', { officialNumber: 'Act 192', status: 'repealed' })).toBe('act');
  });

  it('refuses the claim where the source corroborates neither', () => {
    // Every one of these was registered as an Act, and each carries the noun in the place the
    // drafting convention puts it, so no test of the title alone separates them.
    for (const title of [
      "Compulsory Licensing: Clarify The Scope Of 'Reasonable Requirements Of The Public' Test In The Patents Act",
      'Labelling Requirements Under The Plant Breeder’s Rights Act',
      'MAS Invites Comments on Proposed Changes to the Banking Act',
      'Court Convicts Trader for Fraud and Deceit under the Securities and Futures Act',
      'Free Trade Zone Act | Singapore Customs',
    ]) {
      expect(registeredKind('act', { officialNumber: null, status: 'unknown' }), title).toBe('publication');
    }
    // An absent status reads the same as an unknown one: neither is the register answering.
    expect(registeredKind('act', {})).toBe('publication');
  });

  it('does not reach past the claim it was measured against', () => {
    // The rule corroborates primary legislation and nothing else. A regulator's genuine guidance
    // carries no gazette number and is not "in force" as a statute is, so testing every kind this
    // way retires the real ones -- Australia's .au Domain Administration Rules at 84 sections,
    // which ESCAP cites for 12.7, and Malaysia's PDPA Codes of Practice at 737.
    const uncorroborated = { officialNumber: null, status: 'unknown' };
    expect(registeredKind('guideline', uncorroborated)).toBe('guideline');
    expect(registeredKind('rule', uncorroborated)).toBe('rule');
    expect(registeredKind('regulation', uncorroborated)).toBe('regulation');
    expect(registeredKind('notice', uncorroborated)).toBe('notice');
    expect(registeredKind('order', uncorroborated)).toBe('order');
  });
});

const indicator62 = loadRubric().indicators.find((i) => i.id === '6.2')!;
const indicator64 = loadRubric().indicators.find((i) => i.id === '6.4')!;
const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };

describe('a publication asked to witness an absence', () => {
  // A requirement of this pillar, filed under the indicator next door. That is what makes an
  // instrument one the reader found this pillar's requirements in -- the test `absenceFor` applies
  // -- while leaving 6.2's own measure unmet, so the cell scores zero and needs a witness.
  const finding = (): Finding => ({
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
  });

  const evidence = (instrumentId: number, instrumentTitle: string): Evidence => ({
    finding: finding(),
    sectionId: instrumentId * 100,
    instrumentId,
    instrumentTitle,
    headingPath: 'Part III > 26 Transfer outside Singapore',
    citation: 'https://example.test/s26',
    amendsAnotherAct: false,
  });

  it('is not reported as the instrument governing the subject', () => {
    // The whole claim a zero makes is "this document regulates the area and requires no X". A
    // consultation paper never regulated anything, so its not requiring X says nothing at all.
    const surfaced: SurfacedInstrument[] = [
      { instrumentId: 7, instrumentTitle: 'MAS Invites Comments on Proposed Changes to the Banking Act', rank: 1, kind: 'publication' },
    ];
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(7, 'MAS Invites Comments on Proposed Changes to the Banking Act')],
      surfaced,
      governing: [7],
      coverage,
    });
    expect(d.absence).toBeNull();
    expect(d.rationale).not.toContain('MAS Invites Comments');
  });

  it('steps aside for the statute behind it', () => {
    // The register put the paper first and the Act second. With the paper out, the zero is
    // reported against the instrument that could have imposed the thing said to be missing.
    const surfaced: SurfacedInstrument[] = [
      { instrumentId: 7, instrumentTitle: 'MAS Invites Comments on Proposed Changes to the Banking Act', rank: 1, kind: 'publication' },
      { instrumentId: 1, instrumentTitle: 'Personal Data Protection Act 2012', rank: 2, kind: 'act' },
    ];
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(7, 'MAS Invites Comments on Proposed Changes to the Banking Act'), evidence(1, 'Personal Data Protection Act 2012')],
      surfaced,
      governing: [7, 1],
      coverage,
    });
    expect(d.absence?.basis).toBe('governing');
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
  });

  it('leaves a corpus registered before the kind was carried exactly as it was', () => {
    // `kind` is absent for every instrument registered before this existed, and absent must read
    // as "an instrument" -- otherwise the guard silently retires every zero in an older store.
    const surfaced: SurfacedInstrument[] = [
      { instrumentId: 1, instrumentTitle: 'Personal Data Protection Act 2012', rank: 1 },
    ];
    const d = decide({
      indicator: indicator62,
      economy: 'SGP',
      evidence: [evidence(1, 'Personal Data Protection Act 2012')],
      surfaced,
      coverage,
    });
    expect(d.absence?.basis).toBe('governing');
    expect(d.absence?.instrumentTitle).toBe('Personal Data Protection Act 2012');
  });
});

describe('a publication offered a governing seat', () => {
  // The register names three instruments as governing a question and each is given six of the
  // cell's reading places. In the run of 20 September 2026, 70 of those 150 seats went to
  // documents the register had mistaken for Acts: Australia's copyright-framework cell was
  // governed by three IP Australia consultation pages of three sections each, and its
  // fair-dealing cell by two of them beside the Copyright Act 1968.
  //
  // Registration is where that was fixed. This is the same rule at the place it is spent, because
  // a register is a guess about titles and the next economy's will be wrong in its own way.
  it('does not take one, however well it was read', () => {
    expect(mayGovern({ read: true, kind: 'publication' })).toBe(false);
  });

  it('leaves every kind that is an instrument of the law alone', () => {
    for (const kind of ['act', 'regulation', 'notice', 'guideline', 'order', 'rule']) {
      expect(mayGovern({ read: true, kind }), kind).toBe(true);
    }
  });

  it('still refuses an instrument with nothing in it to seat', () => {
    // The older guard, unchanged: an unread instrument has no provisions, and letting one hold a
    // seat is how Australia's government-access cell lost the interception Act a second time.
    expect(mayGovern({ read: false, kind: 'act' })).toBe(false);
  });
});

describe('a publication quoted as the law itself', () => {
  // The third place the same line belongs, and the one nothing drew. Registration stops a
  // publication being called an Act and `mayGovern` stops it taking a governing seat, but neither
  // covers a finding read out of one: twelve rows of the 20 September export cite "Privacy policy
  // | ACMA", a consultation paper and a commencement announcement as the law, each with a
  // verbatim snippet lifted out of it, and a further twenty-one zero rows name one as the
  // instrument the absence was found in.
  const quoted = (kind: string | null): Evidence => ({
    finding: {
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
    } as Finding,
    sectionId: 900,
    instrumentId: 9,
    instrumentTitle: 'Cybersecurity Act | Cyber Security Agency of Singapore',
    headingPath: 'Overview',
    citation: 'https://example.test/overview',
    amendsAnotherAct: false,
    ...(kind === null ? {} : { instrumentKind: kind }),
  });

  const surfaced: SurfacedInstrument[] = [
    { instrumentId: 9, instrumentTitle: 'Personal Data Protection Act 2012', rank: 1, kind: 'act' },
  ];

  it('does not become the provision the row cites', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [quoted('publication')],
      surfaced,
      coverage,
    });
    expect(d.basis).toEqual([]);
    expect(d.held.map((h) => h.reason).join(' ')).toContain('published about the law');
  });

  it('is held rather than ruled out, because a page describing a duty is evidence it exists', () => {
    const d = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [quoted('publication')],
      surfaced,
      coverage,
    });
    expect(d.excluded).toEqual([]);
    expect(d.held).toHaveLength(1);
  });

  // The control: the guard fires on the kind and on nothing else, so a finding read in an
  // instrument of the law reaches the merits and is judged there. This one is ruled out on the
  // merits -- words naming where data goes are not a condition on sending it -- which is the
  // point: it was ruled on, rather than set aside for being in the wrong kind of document.
  const reachedTheMerits = (kind: string | null): void => {
    const d = decide({
      indicator: indicator64,
      economy: 'SGP',
      evidence: [quoted(kind)],
      surfaced,
      coverage,
    });
    expect(d.held.map((h) => h.reason).join(' '), String(kind)).not.toContain('published about the law');
    expect(d.excluded.length, String(kind)).toBeGreaterThan(0);
  };

  it('leaves a finding read in an instrument of the law where it was', () => {
    for (const kind of ['act', 'regulation', 'notice', 'guideline', 'order', 'rule']) reachedTheMerits(kind);
  });

  it('leaves a corpus read before the kind was carried exactly as it was', () => {
    reachedTheMerits(null);
  });
});
