/**
 * The reader-side fixes held for one re-run (docs/reader-batch.md), each at the point it acts.
 *
 * None of these moves a banked decision: replaying the latest runs of both economies before and
 * after gives the same cells. They act on what the next run is asked and how it is read.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import { translationNote } from '../src/export/index.js';
import { dedicatedWordsShown, frameworkWordsShown, rejectionFor, type Finding } from '../src/read/index.js';
import { otherLanguageCopies } from '../src/retrieve/index.js';
import { loadRubric } from '../src/rubric/index.js';
import { MEASURES } from '../src/rubric/measures.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

const SECTION =
  'A licensee must not publish any advertisement that is false or misleading in a material particular, ' +
  'and must register a domain name ending in .my before offering goods for sale online.';

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '9.3',
    measure: MEASURES['9.3']![0]!.token,
    dutyBearer: 'A licensee',
    dutyAct: 'must not publish',
    dutyForce: 'forbids',
    roleWords: null,
    definingWords: 'must not publish any advertisement',
    subjectWords: 'advertisement',
    borderWords: null,
    imposingWords: 'must not publish',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'A licensee must not publish any advertisement that is false or misleading in a material particular',
    requirement: 'A licensee may not publish misleading advertising.',
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

const evidence = (over: Partial<Finding> = {}, extra: Partial<Evidence> = {}): Evidence => ({
  finding: finding(over),
  sectionId: 1,
  instrumentId: 1,
  instrumentTitle: 'Communications and Multimedia Act 1998',
  amendsAnotherAct: false,
  headingPath: 'Part IV > 211 Prohibition on provision of offensive content',
  citation: 'https://example.gov/act#s211',
  ...extra,
});

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'Communications and Multimedia Act 1998', rank: 1 }];
const coverage = { sectionsRead: 100, sectionsIndexed: 40000, instrumentsConsidered: 20 };
const at = (id: string, evs: Evidence[]) => decide({ indicator: indicator(id), economy: 'MYS', evidence: evs, surfaced, coverage });

describe('a finding said to bind one sector', () => {
  it('is held when it names none', () => {
    expect(rejectionFor(finding({ sectorScope: 'specific', sector: null }), SECTION, new Set(['9.3'])))
      .toContain('no sector is named');
  });

  it('is read when it names one', () => {
    expect(rejectionFor(finding({ sectorScope: 'specific', sector: 'licensees' }), SECTION, new Set(['9.3']))).toBeNull();
  });
});

describe("what a measure is aimed at, and the indicator's own exception", () => {
  it('is checked against the provision like every other quote', () => {
    expect(rejectionFor(finding({ targetWords: 'tobacco advertising' }), SECTION, new Set(['9.3'])))
      .toContain('aimed at');
    expect(rejectionFor(finding({ targetWords: 'advertisement that is false or misleading' }), SECTION, new Set(['9.3'])))
      .toBeNull();
  });

  it('removes a finding the exception covers, with the words that show it', () => {
    const d = at('9.3', [evidence({ targetWords: 'advertisement that is false or misleading', withinException: true })]);
    expect(d.excluded.map((x) => x.reason)).toContain(indicator('9.3').exception);
  });

  it('does not act on the claim alone', () => {
    const d = at('9.3', [evidence({ targetWords: null, withinException: true })]);
    expect(d.excluded.map((x) => x.reason)).not.toContain(indicator('9.3').exception);
  });

  it('leaves a reading banked before the question existed as it was', () => {
    const d = at('9.3', [evidence()]);
    expect(d.excluded.map((x) => x.reason)).not.toContain(indicator('9.3').exception);
  });
});

describe('a subject stated in a language the domain has no words for', () => {
  const token = MEASURES['12.7']![0]!.token;
  const malay = { indicatorId: '12.7', measure: token, subjectWords: 'alamat laman sesawang', definingWords: 'hendaklah mendaftar' };

  it('is held, because failing English words shows nothing about a Malay provision', () => {
    // The measure's name first: "hendaklah mendaftar" is "shall register", and no English word list
    // can say whether it names a domain.
    const named = at('12.7', [evidence(malay, { sectionLanguage: 'ms' })]);
    expect(named.held.map((x) => x.reason).join(' ')).toContain('are in ms');
    // Then the subject, where the defining words already passed.
    const d = at('12.7', [evidence({ ...malay, definingWords: 'register a domain name' }, { sectionLanguage: 'ms' })]);
    expect([...d.held, ...d.excluded].map((x) => x.reason).join(' ')).not.toContain('is not');
  });

  it('is still ruled out when the provision is in English and off the subject', () => {
    const d = at('12.7', [evidence({ ...malay, subjectWords: 'bank' }, { sectionLanguage: 'en' })]);
    expect(d.held.map((x) => x.reason).join(' ')).not.toContain('is in');
  });
});

describe('a Thai provision, read in its own language', () => {
  const thai = {
    indicatorId: '5.5',
    measure: 'strict-telecom-licence',
    dutyBearer: 'ผู้ใดประสงค์จะประกอบกิจการโทรคมนาคม',
    dutyAct: 'ต้องได้รับใบอนุญาต',
    dutyForce: 'requires' as const,
    definingWords: 'ต้องได้รับใบอนุญาตจากคณะกรรมการ',
    subjectWords: 'กิจการโทรคมนาคม',
    quote: 'ต้องได้รับใบอนุญาตจากคณะกรรมการ',
  };
  const telecomAct = { sectionLanguage: 'th', instrumentTitle: 'พระราชบัญญัติการประกอบกิจการโทรคมนาคม พ.ศ. 2544' };

  it('stands on the reader confirming the measure, since the English term of art cannot be in it', () => {
    const d = at('5.5', [evidence(thai, { ...telecomAct, confirmed: true })]);
    expect(d.basis).toHaveLength(1);
  });

  it('is still held where nobody confirmed it', () => {
    const d = at('5.5', [evidence(thai, telecomAct)]);
    expect(d.held.map((x) => x.reason).join(' ')).toContain('are in th');
  });

  it("names a term of art's domain in Thai", () => {
    const secret = {
      indicatorId: '4.1',
      measure: 'trade-secret-protection',
      dutyBearer: 'ผู้ควบคุมความลับทางการค้า',
      dutyForce: 'permits' as const,
      definingWords: 'สิทธิในความลับทางการค้า',
      subjectWords: 'ความลับทางการค้า',
      quote: 'ผู้ควบคุมความลับทางการค้าฟ้องคดีขอให้ศาลสั่ง',
    };
    const d = at('4.1', [evidence(secret, { sectionLanguage: 'th', confirmed: true })]);
    expect(d.basis).toHaveLength(1);
    // And a Thai subject outside it is still not the domain: "financial services" is no trade secret.
    const off = at('4.1', [evidence({ ...secret, subjectWords: 'การใช้บริการทางการเงิน' }, { sectionLanguage: 'th', confirmed: true })]);
    expect(off.basis).toHaveLength(0);
  });
});

describe('a provision the corpus holds in two languages', () => {
  function corpus() {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\",\"en\"]')").run();
    const inst = (title: string) =>
      Number(db.prepare(`INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
                  VALUES ('MYS', ?, 'act', ?, 'test', '2026-09-19')`).run(title, `https://x/${title}`).lastInsertRowid);
    const doc = (instrumentId: number) =>
      Number(db.prepare(`INSERT INTO document (instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at, from_cache, extraction, section_count)
                  VALUES (?, ?, ?, 'application/pdf', 1, 200, '2026-09-19', 1, 'pdf-text', 2)`).run(instrumentId, `https://x/${instrumentId}.pdf`, `h${instrumentId}`).lastInsertRowid);
    const sec = (documentId: number, ordinal: number, language: string, label: string | null) =>
      Number(db.prepare(`INSERT INTO section (document_id, ordinal, heading_path, label, text, char_start, char_end, page, language, anchor)
                  VALUES (?, ?, 'x', ?, 'text', 0, 4, 1, ?, null)`).run(documentId, ordinal, label, language).lastInsertRowid);
    const both = doc(inst('Bilingual Act'));
    const ms = sec(both, 0, 'ms', '1');
    const en = sec(both, 1, 'en', '1');
    const only = sec(doc(inst('Malay-only Enactment')), 0, 'ms', '1');
    // One English section beside ten Malay ones: the shape of a code of practice whose English
    // edition is a single page.
    const mostlyMalay = doc(inst('Kod Tata Amalan'));
    sec(mostlyMalay, 0, 'en', '1.1');
    const malay = Array.from({ length: 10 }, (_, n) => sec(mostlyMalay, n + 1, 'ms', `1.${n + 1}`));
    // A label the Malay text uses twice, against one English section of it.
    const repeats = doc(inst('Restarting Regulations'));
    const enOnce = sec(repeats, 0, 'en', '2');
    const msTwice = [sec(repeats, 1, 'ms', '2'), sec(repeats, 2, 'ms', '2')];
    const unlabelled = sec(both, 2, 'ms', null);
    return { db, ms, en, only, malay, enOnce, msTwice, unlabelled };
  }

  it('is read once, in the rubric language', () => {
    const { db, ms, en } = corpus();
    const second = otherLanguageCopies(db, 'MYS');
    expect(second.has(ms)).toBe(true);
    expect(second.has(en)).toBe(false);
  });

  it('keeps the only copy an instrument has, whatever its language', () => {
    const { db, only } = corpus();
    expect(otherLanguageCopies(db, 'MYS').has(only)).toBe(false);
  });

  it('drops only the provision whose own counterpart is there, not every provision beside some English', () => {
    const { db, malay } = corpus();
    const second = otherLanguageCopies(db, 'MYS');
    expect(malay.filter((id) => second.has(id))).toHaveLength(1);
  });

  it('pairs one to one, and keeps what cannot be paired', () => {
    const { db, enOnce, msTwice, unlabelled } = corpus();
    const second = otherLanguageCopies(db, 'MYS');
    expect(second.has(enOnce)).toBe(false);
    expect(msTwice.filter((id) => second.has(id))).toHaveLength(1);
    expect(second.has(unlabelled)).toBe(false);
  });
});

describe('a row quoting a translation', () => {
  it('says so where the profile names another language as authoritative', () => {
    expect(translationNote('MYS', 'en')).toContain('translation');
    expect(translationNote('MYS', 'ms')).toBeNull();
    expect(translationNote('SGP', 'en')).toBeNull();
    expect(translationNote('MYS', null)).toBeNull();
  });
});

describe('a framework named in the language of its own statute', () => {
  const pdpa =
    'มาตรา ๑ พระราชบัญญัตินี้เรียกว่า “พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. ๒๕๖๒” ' +
    'มาตรา ๑๙ ผู้ควบคุมข้อมูลส่วนบุคคลจะกระทำการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลไม่ได้ หากเจ้าของข้อมูลส่วนบุคคลไม่ได้ให้ความยินยอม';

  it('is shown by a Thai rule that names the subject in Thai', () => {
    expect(frameworkWordsShown('ผู้ควบคุมข้อมูลส่วนบุคคลจะกระทำการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลไม่ได้', 'data-protection', pdpa)).toBe(true);
    expect(dedicatedWordsShown('พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. ๒๕๖๒', 'data-protection', pdpa)).toBe(true);
  });

  it('is still not shown by words that are not in the instrument, or that name another subject', () => {
    expect(frameworkWordsShown('ผู้ควบคุมข้อมูลส่วนบุคคลต้องแต่งตั้งเจ้าหน้าที่คุ้มครองข้อมูลส่วนบุคคลทุกกรณีโดยไม่มีข้อยกเว้น', 'data-protection', pdpa)).toBe(false);
    expect(frameworkWordsShown('ผู้ควบคุมข้อมูลส่วนบุคคลจะกระทำการเก็บรวบรวม ใช้ หรือเปิดเผยข้อมูลส่วนบุคคลไม่ได้', 'consumer-protection', pdpa)).toBe(false);
  });
});
