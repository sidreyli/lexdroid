/**
 * Subjects a right score had been resting on the wrong law for.
 *
 * An audit of the law each score cited found fifteen cells where the law did not answer the
 * question: an identity verification scheme's rules as the data protection
 * framework, a commercial courts Act as the consumer protection one, a copyright Act as the safe
 * harbour for everything but copyright, a bank's Shariah window as telecom accounting separation,
 * medical-device declarations as radio equipment SDoC, a cyber security licence as an online
 * content licence, and a bank's branch abroad as a presence required here.
 */
import { describe, expect, it } from 'vitest';
import { decide, limitsLicenceTerms, presenceAbroad, type FrameworkEvidence } from '../src/decide/index.js';
import { frameworkWordsShown, sentenceAround } from '../src/read/index.js';
import { FRAMEWORK_TITLE_DOMAIN, SECTOR_DOMAINS, SUBJECT_DOMAIN } from '../src/rubric/measures.js';
import type { Indicator } from '../src/rubric/types.js';

describe('a framework is named for its subject', () => {
  const must = (id: string) => FRAMEWORK_TITLE_DOMAIN[id]!.must!;
  it('data protection', () => {
    expect(must('7.1').test('Personal Data Protection Act 2012')).toBe(true);
    expect(must('7.1').test('Privacy Act 1988')).toBe(true);
    expect(must('7.1').test('พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562')).toBe(true);
    expect(must('7.1').test('Identity Verification Services Rules 2024')).toBe(false);
  });
  it('consumer protection', () => {
    expect(must('12.9').test('Competition and Consumer Act 2010')).toBe(true);
    expect(must('12.9').test('พระราชบัญญัติคุ้มครองผู้บริโภค พ.ศ. 2522')).toBe(true);
    expect(must('12.9').test('The Commercial Courts Act, 2015')).toBe(false);
  });
  it('and the safe harbour for other illegal activities is not a copyright one', () => {
    const not = FRAMEWORK_TITLE_DOMAIN['8.2']!.not!;
    expect(not.test('Copyright Act 1968')).toBe(true);
    expect(not.test('พระราชบัญญัติลิขสิทธิ์ พ.ศ. 2537')).toBe(true);
    expect(not.test('Electronic Transactions Act 2010')).toBe(false);
  });
});

describe('a framework for another subject', () => {
  const i71: Indicator = {
    id: '7.1',
    pillarId: 7,
    pillarName: 'Domestic Data Protection and Privacy',
    category: 'Lack of comprehensive legal framework for data protection',
    exception: null,
    criteriaText: '...',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
    bands: [
      { score: 1, criterion: 'No data protection legal framework', ordinal: 1 },
      { score: 0.5, criterion: 'Sectoral law', ordinal: 2 },
      { score: 0, criterion: 'Comprehensive data protection framework', ordinal: 3 },
    ],
    shape: 'framework',
  };
  const coverage = { instrumentsConsidered: 5, sectionsIndexed: 0, sectionsRead: 0 };
  const fw = (instrumentTitle: string): FrameworkEvidence => ({
    instrumentId: 1,
    instrumentTitle,
    citation: 'https://example.gov/x',
    bindingness: 'binding',
    establishesFramework: true,
    frameworkShown: true,
    horizontal: true,
    dedicated: false,
    dedicatedShown: false,
    sectoralShown: false,
    sector: null,
    quote: 'each of the following is a prescribed privacy law',
  });
  const run = (...titles: string[]) =>
    decide({ indicator: i71, economy: 'AUS', evidence: [], frameworkEvidence: titles.map(fw), coverage });

  it('does not answer the indicator', () => {
    expect(run('Personal Data Protection Act 2012').score).toBe(0);
    expect(run('Identity Verification Services Rules 2024', 'Personal Data Protection Act 2012').decidingFact).not.toMatch(/Identity/);
  });

  it('and is not evidence that the economy has none', () => {
    // The only framework read is about something else, so the one that would answer was never
    // read. Scoring "no framework" from that would be a claim nobody checked.
    const d = run('Identity Verification Services Rules 2024');
    expect(d.state).toBe('unresolved');
    expect(d.score).toBeNull();
  });
});

describe('the telecom pillar and the radio equipment indicator', () => {
  it('ask for the sector, which the title may name', () => {
    for (const id of ['5.1', '5.4']) {
      expect(SUBJECT_DOMAIN[id]!.test('telecommunications network')).toBe(true);
      expect(SUBJECT_DOMAIN[id]!.test('accounting system')).toBe(false);
      expect(SECTOR_DOMAINS.has(id)).toBe(true);
    }
  });
  it('11.2 takes radio equipment and products generally, not medical devices or signature authorities', () => {
    const d = SUBJECT_DOMAIN['11.2']!;
    expect(d.test('Radiocommunications Labelling (Electromagnetic Compatibility) Notice')).toBe(true);
    expect(d.test('goods or articles, hereinafter referred to as products')).toBe(true);
    expect(d.test('medical device')).toBe(false);
    expect(d.test('certification authorities')).toBe(false);
    expect(d.test('radiation')).toBe(false);
  });
});

describe('an online content licence', () => {
  it('is not a licence for cyber security services', () => {
    expect(SUBJECT_DOMAIN['9.4']!.test('cyber security service')).toBe(false);
    expect(SUBJECT_DOMAIN['9.4']!.test('applications service provider')).toBe(true);
  });
});

describe('a commercial presence', () => {
  it('opened abroad is not one required here', () => {
    expect(presenceAbroad('overseas branch')).toBe(true);
    expect(presenceAbroad('branch office outside Malaysia')).toBe(true);
    expect(presenceAbroad('สาขาในต่างประเทศ')).toBe(true);
  });
  it('but an overseas company is a foreign company, which is who the rule binds', () => {
    expect(presenceAbroad('overseas company')).toBe(false);
    expect(presenceAbroad('foreign company')).toBe(false);
  });
});

describe('a framework rule quoted without the words that open its sentence', () => {
  const s94 =
    'Section 94 — Measures to prevent unfair trade practices in e-commerce, direct selling, etc.\n' +
    'For the purposes of preventing unfair trade practices in e-commerce, direct selling and also to protect the ' +
    'interest and rights of consumers, the Central Government may take such measures in the manner as may be prescribed.';
  const clause = 'the Central Government may take such measures in the manner as may be prescribed';
  it('names its subject in the sentence it was cut from', () => {
    expect(sentenceAround(clause, s94)).toContain('rights of consumers');
    expect(frameworkWordsShown(clause, 'consumer-protection', s94)).toBe(true);
  });
  it('but not from a neighbouring sentence', () => {
    const apart = 'This Part protects consumers.\nThe Central Government may take such measures in the manner as may be prescribed.';
    expect(frameworkWordsShown(clause, 'consumer-protection', apart)).toBe(false);
  });
});

describe('a restriction on enforcing a patent', () => {
  it('is not a limit on the terms of a licence the patentee grants', () => {
    expect(
      limitsLicenceTerms({
        quote: 'ผู้ทรงสิทธิบัตรจะกำหนดเงื่อนไข ข้อจำกัดสิทธิหรือค่าตอบแทนในลักษณะที่เป็นการจำกัดการแข่งขันโดยไม่ชอบธรรมไม่ได้',
        definingWords: null,
      }),
    ).toBe(true);
    expect(limitsLicenceTerms({ quote: 'a condition in a licence agreement that restricts competition is void', definingWords: null })).toBe(true);
  });
  it('and a compulsory licence still is one', () => {
    expect(limitsLicenceTerms({ quote: 'The Controller may grant a compulsory licence on terms he deems fit', definingWords: null })).toBe(false);
  });
});

describe('an online advertising restriction', () => {
  const medium = SUBJECT_DOMAIN['9.3']!;
  it('is about the medium the advertising is carried by, which the title may name', () => {
    expect(SECTOR_DOMAINS.has('9.3')).toBe(true);
    expect(medium.test('Broadcasting Services Act 1992')).toBe(true);
    expect(medium.test('The Cable Television Networks (Regulation) Act, 1995')).toBe(true);
    expect(medium.test('advertisement offered by an online marketplace supplier')).toBe(true);
    expect(medium.test('พระราชบัญญัติการประกอบกิจการกระจายเสียงและกิจการโทรทัศน์ พ.ศ. 2551')).toBe(true);
  });
  it('not a ban on advertising one product in any medium', () => {
    expect(medium.test('ประมวลกฎหมายยาเสพติด')).toBe(false);
    expect(medium.test('Tobacco Product Control Act')).toBe(false);
    expect(medium.test('จำกัดการใช้สื่อโฆษณาสำหรับสินค้านั้น')).toBe(false);
    expect(medium.test('พระราชกำหนดการประกอบธุรกิจสินทรัพย์ดิจิทัล พ.ศ. 2561')).toBe(false);
  });
});

describe('a foreign equity cap under 3.1', () => {
  const domain = SUBJECT_DOMAIN['3.1']!;
  it('is in a sector relevant to digital trade, which the title may name', () => {
    expect(SECTOR_DOMAINS.has('3.1')).toBe(true);
    expect(domain.test('Indian Insurance Companies (Foreign Investment) Rules, 2015')).toBe(true);
    expect(domain.test('Financial Holding Companies Act 2013')).toBe(true);
    expect(domain.test('Broadcasting Act 1942')).toBe(true);
    expect(domain.test('ประกาศธนาคารแห่งประเทศไทย')).toBe(true);
  });
  it('not an airport or a law firm', () => {
    expect(domain.test('Airports Act 1996')).toBe(false);
    expect(domain.test('Legal Profession (Law Practice Entities) Rules 2015')).toBe(false);
  });
});
