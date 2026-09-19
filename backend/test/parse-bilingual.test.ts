/**
 * A bilingual instrument prints its text twice, Malay and then English, each half numbered from 1
 * and each with its own Schedules.
 *
 * The PDF parser called every Latin-script page English, so both halves carried one key and the
 * later copy of each number overwrote the earlier: the Personal Data Protection (Fees) Regulations
 * lost Malay regulations 1 to 3 to the Malay Schedule's items 1 to 3, and the Class of Data Users
 * Order filed its English section 1 inside the Malay JADUAL. The filed title, in Malay, was then
 * compared with the English name the document gave itself, and three instruments were refused as
 * "another instrument".
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';
import { identityMismatch, statedNames } from '../src/parse/identity.js';

const order = [
  {
    page: 1,
    language: 'ms',
    lines: [
      '1. (1) Perintah ini bolehlah dinamakan Perintah Perlindungan Data Peribadi (Golongan Pengguna Data) 2013.',
      '(2) Perintah ini mula berkuat kuasa pada 15 November 2013.',
      '2. Pengguna data yang tergolong dalam mana-mana golongan pengguna data',
      'hendaklah mendaftar di bawah Akta.',
    ],
  },
  {
    page: 2,
    language: 'ms',
    lines: ['JADUAL', '[Perenggan 2]', '1. Komunikasi', '(a) Pemegang lesen di bawah Akta.', '2. Perbankan', '(a) Bank berlesen.'],
  },
  {
    page: 3,
    language: 'en',
    lines: [
      '1. (1) This order may be cited as the Personal Data Protection (Class of Data Users) Order 2013.',
      '(2) This Order comes into operation on 15 November 2013.',
      '2. A data user who belongs to any class of data users as specified in the Schedule',
      'shall register under the Act.',
    ],
  },
  {
    page: 4,
    language: 'en',
    lines: ['SCHEDULE', '[Paragraph 2]', '1. Communications', '(a) A licensee under the Act.', '2. Banking', '(a) A licensed bank.'],
  },
];

describe('a bilingual instrument', () => {
  const built = sectionise(order);
  const paths = built.sections.map((s) => `${s.headingPath} | ${s.text.slice(0, 20)}`);

  it('keeps both halves of the numbering', () => {
    expect(paths.some((p) => p.includes('Perintah ini'))).toBe(true);
    expect(paths.some((p) => p.includes('This order may'))).toBe(true);
  });

  it("keeps the Malay Schedule's own items", () => {
    expect(paths.some((p) => p.startsWith('JADUAL > 1.') && p.includes('Komunikasi'))).toBe(true);
    expect(paths.some((p) => p.startsWith('JADUAL > 2.') && p.includes('Perbankan'))).toBe(true);
  });

  it('closes the Malay Schedule when the English text begins', () => {
    const english = built.sections.find((s) => s.text.startsWith('1. (1) This order'));
    expect(english?.headingPath.startsWith('JADUAL')).toBe(false);
  });
});

describe('a Schedule named with its ordinal after the noun', () => {
  const built = sectionise([
    { page: 1, language: 'ms', lines: ['1. Peraturan-peraturan ini bolehlah dinamakan Peraturan Fi 2013.', '2. Fi maksimum yang kena dibayar', 'adalah seperti dalam Jadual Pertama.'] },
    { page: 2, language: 'ms', lines: ['JADUAL PERTAMA', '[Peraturan 2]', '1. Permintaan mengakses data', '2. Permintaan salinan data'] },
    { page: 3, language: 'ms', lines: ['JADUAL KEDUA', '[Peraturan 3]', '1. Memeriksa daftar', '2. Membuat salinan'] },
  ]);
  const paths = built.sections.map((s) => s.headingPath);

  it("keeps the instrument's own regulations 1 and 2", () => {
    expect(built.sections.some((s) => s.text.startsWith('1. Peraturan-peraturan ini'))).toBe(true);
    expect(built.sections.some((s) => s.text.startsWith('2. Fi maksimum'))).toBe(true);
  });

  it('files each Schedule separately', () => {
    expect(paths.filter((p) => p.startsWith('JADUAL PERTAMA >'))).toHaveLength(2);
    expect(paths.filter((p) => p.startsWith('JADUAL KEDUA >'))).toHaveLength(2);
  });
});

const s = (text: string) => [{ text }];

describe('the name a document gives itself, in each language', () => {
  it('reads the Malay drafting formula', () => {
    expect(
      statedNames(s('1. (1) Perintah ini bolehlah dinamakan Perintah Perlindungan Data Peribadi (Golongan Pengguna Data) 2013 dan mula berkuat kuasa pada 15 November 2013.')),
    ).toEqual([{ name: 'Perintah Perlindungan Data Peribadi (Golongan Pengguna Data) 2013', language: 'ms' }]);
  });

  it('does not refuse a Malay title because the document names itself only in English', () => {
    expect(
      identityMismatch(
        s('1. (1) These regulations may be cited as the Personal Data Protection (Fees) Regulations 2013.'),
        'Peraturan Peraturan Perlindungan Data Peribadi Fi',
      ),
    ).toBeNull();
  });

  it('accepts a Malay title against the Malay name the document gives itself', () => {
    expect(
      identityMismatch(
        [
          { text: '1. (1) Perintah ini bolehlah dinamakan Perintah Perlindungan Data Peribadi (Golongan Pengguna Data) 2013.' },
          { text: '1. (1) This order may be cited as the Personal Data Protection (Class of Data Users) Order 2013.' },
        ],
        'Perintah Perlindungan Data Peribadi Golongan Pengguna Data',
      ),
    ).toBeNull();
  });

  it('still refuses a Malay title the Malay name contradicts', () => {
    expect(
      identityMismatch(
        s('1. (1) Akta ini bolehlah dinamakan Akta Suruhanjaya Pelantikan Kehakiman 2009.'),
        'AKTA PERLINDUNGAN SAKSI 2009',
      )?.stated,
    ).toBe('Akta Suruhanjaya Pelantikan Kehakiman 2009');
  });

  it('still refuses an English title the English name contradicts', () => {
    expect(
      identityMismatch(
        s('1. (1) This Act may be cited as the Judicial Appointments Commission Act 2009.'),
        'WITNESS PROTECTION ACT 2009',
      )?.stated,
    ).toBe('Judicial Appointments Commission Act 2009');
  });
});

describe("a Schedule whose forms alternate between the two languages", () => {
  const built = sectionise([
    { page: 1, language: 'en', lines: ['1. (1) This order may be cited as the Customs Order 2017.', '(2) This Order comes into operation on 1 April 2017.', '2. No goods shall be imported.'] },
    { page: 2, language: 'en', lines: ['FIFTH SCHEDULE', '[Paragraph 5]', 'IMPORT LICENCE'] },
    { page: 3, language: 'ms', lines: ['1. Lesen ini tidak boleh diubah atau dipinda kecuali dengan kelulusan Ketua Pengarah.'] },
    { page: 4, language: 'en', lines: ['1. This licence cannot be changed or amended except with the approval of the Director General.'] },
  ]);

  it("does not let the English form's item 1 take the order's section 1", () => {
    expect(built.sections.some((s) => s.text.startsWith('1. (1) This order may be cited'))).toBe(true);
  });

  it('files the English form inside the English Schedule it continues', () => {
    const form = built.sections.find((s) => s.text.startsWith('1. This licence'));
    expect(form?.headingPath.startsWith('FIFTH SCHEDULE')).toBe(true);
  });
});

describe('a catalogue title that abbreviates the name by its initials', () => {
  it('is the same instrument', () => {
    expect(
      identityMismatch(
        s('1. (1) Akta ini bolehlah dinamakan Akta Perlindungan Data Peribadi (Pindaan) 2024.'),
        'Akta Pdppindaan 2024',
      ),
    ).toBeNull();
  });

  it('does not make every word an abbreviation', () => {
    expect(
      identityMismatch(
        s('1. (1) Akta ini bolehlah dinamakan Akta Perlindungan Data Peribadi (Pindaan) 2024.'),
        'Akta Pendidikan 1996',
      )?.stated,
    ).toBe('Akta Perlindungan Data Peribadi (Pindaan) 2024');
  });
});
