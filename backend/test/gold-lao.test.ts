/**
 * Lao PDR, read by OCR from real gazette scans and checked against the scans themselves.
 *
 * Every fixture in test/fixtures/lao is the page-by-page output of the pipeline's own OCR stage
 * (tesseract.js, the Lao pack, LSTM, single-block layout, 300 dpi) on a PDF fetched from the Lao
 * Official Gazette -- saved so these tests are deterministic and need no Tesseract. The scans have
 * no text layer at all.
 *
 * The expectations were read off the scan images, not off the parser: the article count and the
 * last article, the part and chapter a given article sits under, and -- where OCR misread an
 * article's number -- what the page actually prints. Those were rendered and read for article 30
 * and 31 (OCR: "390", "81") and 53 (OCR: "55") of the payment systems decision, Part II and
 * chapter 1 at the head of its page 2, and article 13 (OCR: "19") of the dangerous goods decree.
 *
 * OCR errors in the text itself are not corrected and not asserted against: the text is what the
 * scan yielded, and the confidence it was read at is kept with it. What is asserted is structure.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMostlyLao, sectioniseLao } from '../src/parse/lao.js';
import type { PageText } from '../src/parse/pdf.js';

const FIXTURES = join(__dirname, 'fixtures', 'lao');
const pagesOf = (name: string): PageText[] =>
  (JSON.parse(readFileSync(join(FIXTURES, `${name}.pages.json`), 'utf8')) as { pages: PageText[] }).pages;
const read = (name: string) => sectioniseLao(pagesOf(name));
const range = (a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

const ALL = ['payment-system-decision-819', 'trade-inspection-decision-2997', 'dangerous-goods-decree-283', 'cybersecurity-law-87'];

/** The provisions of the instrument itself, without the acts a gazetted law is bundled with. */
const own = (name: string) =>
  read(name).builder.sections.filter((s) => !/^(?:ລັດຖະດຳລັດ|ມະຕິ|ບົດນຳ)/u.test(s.headingPath));

describe('every Lao fixture', () => {
  it.each(ALL)('%s is Lao, holds the offset invariant, and keeps its text as OCR read it', (name) => {
    const pages = pagesOf(name);
    expect(isMostlyLao(pages)).toBe(true);
    const { builder } = read(name);
    for (const s of builder.sections) {
      expect(builder.text.slice(s.charStart, s.charEnd)).toBe(s.text);
      expect(s.language).toBe('lo');
    }
    // Nothing is rewritten: every stored line is a line OCR produced.
    const produced = new Set(pages.flatMap((p) => p.lines));
    for (const line of builder.text.split('\n').filter(Boolean)) expect(produced.has(line), line).toBe(true);
  });

  it.each(ALL)('%s numbers its own articles 1..n with no gap and no repeat', (name) => {
    const labels = own(name).map((s) => s.label);
    expect(labels).toEqual(range(1, labels.length));
  });
});

describe('a Law, gazetted with the acts that made it: the Cybersecurity Law', () => {
  const { builder, inferred } = read('cybersecurity-law-87');

  it('keeps the promulgation decree and the adoption resolution apart from the law', () => {
    // Pages 1 and 2 of the scan: the President's decree promulgating the law, and the National
    // Assembly's resolution adopting it, each with articles 1 and 2 of its own.
    const decree = builder.sections.filter((s) => s.headingPath.startsWith('ລັດຖະດຳລັດ'));
    const resolution = builder.sections.filter((s) => s.headingPath.startsWith('ມະຕິ'));
    expect(decree.map((s) => s.label)).toEqual(['1', '2']);
    expect(resolution.map((s) => s.label)).toEqual(['1', '2']);
    expect(decree[0]!.headingPath).toMatch(/^ລັດຖະດຳລັດ ກ່ຽວກັບການປະກາດໃຊ້ກົດຫນາຍວ່າດ້ວຍຄວາມປອດໄພໄຊເບີ > ມາດຕາ 1 /);
  });

  it('has the law\'s 79 articles, in its ten parts', () => {
    const law = own('cybersecurity-law-87');
    expect(law).toHaveLength(79);
    // Page 3 of the scan: "ພາກທີ I ບົດບັນຍັດທົ່ວໄປ", then articles 1, 2 and 3 -- which OCR read as 83.
    expect(law[0]!.headingPath).toBe('ພາກທີ 1 ບົດບັນຍັດທົ່ວໄປ > ມາດຕາ 1 ຈຸດປະສົງ');
    expect(inferred).toContain('3 (read 83)');
    expect(law.at(-1)!.headingPath).toMatch(/^ພາກທີ 10 ບົດບັນຍັດສຸດທ້າຍ > ມາດຕາ 79 ຜົນສັກສິດ$/);
  });
});

describe('a Bank of the Lao PDR decision: the payment systems decision 819', () => {
  const { builder, inferred } = read('payment-system-decision-819');

  it('has the 59 articles the scan prints', () => {
    expect(builder.sections).toHaveLength(59);
    expect(builder.sections.at(-1)!.headingPath).toMatch(/ມາດຕາ 59 ຜົນສັກສິດ$/);
  });

  it('labels the articles OCR misread by what the scan prints, and says so', () => {
    // Read off the page images: articles 30, 31 and 53, which OCR returned as 390, 81 and 55.
    expect(inferred).toEqual([
      '30 (read 390)', '31 (read 81)', '33 (read 393)', '35 (read 395)', '39 (read 99)', '53 (read 55)',
    ]);
    // The text keeps what OCR read; only the label is the sequence's.
    const a30 = builder.sections.find((s) => s.label === '30')!;
    expect(a30.text.startsWith('ມາດຕາ 390 ການຄຸ້ມຄອງບໍລິຫານ')).toBe(true);
  });

  it('files articles under the part and chapter the scan heads them with', () => {
    // Page 2 of the scan: "ພາກທີ II ... ສປປ ລາວ", then "ໝວດທີ 1 ປະເພດລະບົບການຊຳລະເງິນທົ່ວໄປ".
    const a5 = builder.sections.find((s) => s.label === '5')!;
    expect(a5.headingPath).toMatch(/^ພາກທີ 2 ການໃຫ້ບໍລິການລະບົບການຊຳລະເງິນທົ່ວໄປຢູ່ ສປປ ລາວ > ໝວດທີ 1 ປະເພດລະບົບການຊຳລະເງິນທົ່ວໄປ > ມາດຕາ 5 /);
    expect(builder.sections.find((s) => s.label === '1')!.headingPath).toMatch(/^ພາກທີ 1 ບົດບັນຍັດທົ່ວໄປ > /);
    expect(builder.sections.find((s) => s.label === '59')!.headingPath).toMatch(/^ພາກທີ 7 ບົດບັນຍັດສຸດທ້າຍ > /);
  });

  it('leaves the signature out of the last article', () => {
    expect(builder.sections.at(-1)!.text).not.toContain('ບຸນຄຳ ວໍລະຈິດ');
    expect(builder.text).toContain('ບຸນຄໍາ ວໍລະຈິດ');
  });
});

describe('a Ministry decision: trade inspection 2997', () => {
  const { builder, inferred } = read('trade-inspection-decision-2997');

  it('has its 24 articles in its five chapters', () => {
    expect(builder.sections).toHaveLength(24);
    const chapters = [...new Set(builder.sections.map((s) => s.headingPath.split(' > ')[0]!.split(' ').slice(0, 2).join(' ')))];
    expect(chapters).toEqual(['ໝວດທີ 1', 'ໝວດທີ 2', 'ໝວດທີ 3', 'ໝວດທີ 4', 'ໝວດທີ 5']);
    expect(inferred).toEqual(['19 (read 189)']);
  });

  it('does not take "ພາກສ່ວນທີ່ກ່ຽວຂ້ອງ" (the parties concerned) for a part heading', () => {
    expect(builder.sections.every((s) => !s.headingPath.startsWith('ພາກທີ'))).toBe(true);
  });
});

describe('a Government decree: dangerous goods transport 283', () => {
  const { builder, inferred } = read('dangerous-goods-decree-283');

  it('has its 75 articles across its eleven chapters, whichever way OCR wrote ໝວດ', () => {
    // The scan's chapter headings came back as ຫນວດ, ບນວດ, ບຫວດ, ຫວດ and ຫພວດ.
    expect(builder.sections).toHaveLength(75);
    const chapters = [...new Set(builder.sections.map((s) => /^ໝວດທີ (\d+)/.exec(s.headingPath)?.[1]))];
    expect(chapters).toEqual(range(1, 11));
  });

  it('names a chapter by its title, not by the seal debris printed above it', () => {
    expect(builder.sections[0]!.headingPath).toBe('ໝວດທີ 1 ບົດບັນຍັດທົ່ວໄປ > ມາດຕາ 1 ຈຸດປະສົງ');
  });

  it('labels article 13 by what the scan prints, where OCR read 19', () => {
    expect(inferred).toContain('13 (read 19)');
  });
});

describe('the sequence repair does not invent', () => {
  const page = (lines: string[]): PageText[] => [{ page: 1, lines: ['ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ', ...lines, 'ສັນຕິພາບ ເອກະລາດ ປະຊາທິປະໄຕ'] }];

  it('believes OCR where the neighbours do not confirm another number', () => {
    const { builder, inferred } = sectioniseLao(page(['ມາດຕາ 1 ຈຸດປະສົງ', 'ເນື້ອໃນຂອງມາດຕານີ້', 'ມາດຕາ 7 ຂອບເຂດ', 'ເນື້ອໃນຂອງມາດຕານີ້', 'ມາດຕາ 9 ຜົນສັກສິດ', 'ເນື້ອໃນຂອງມາດຕານີ້']));
    expect(builder.sections.map((s) => s.label)).toEqual(['1', '7', '9']);
    expect(inferred).toEqual([]);
  });

  it('reads Lao digits as numbers', () => {
    const { builder } = sectioniseLao(page(['ມາດຕາ ໑ ຈຸດປະສົງ', 'ເນື້ອໃນຂອງມາດຕານີ້', 'ມາດຕາ ໒ ຂອບເຂດ', 'ເນື້ອໃນຂອງມາດຕານີ້']));
    expect(builder.sections.map((s) => s.label)).toEqual(['1', '2']);
  });
});

describe('an instrument drafted in points, not articles', () => {
  const page = (lines: string[]): PageText[] => [{ page: 1, lines: ['ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ', ...lines] }];

  it('sections an instruction on its top-level points, under the Roman part each sits in', () => {
    const { builder } = sectioniseLao(
      page([
        'ຄໍາແນະນໍາ ການຈັດຕັ້ງປະຕິບັດ ກົດໝາຍ',
        '|. ຈຸດປະສົງ',
        'ຄໍາແນະນໍາສະບັບນີ້ ຜັນຂະຫຍາຍ ເນື້ອໃນບາງມາດຕາ',
        '[[. ແນະນໍາການຈັດຕັ້ງປະຕິບັດເນື້ອໃນບາງມາດຕາ',
        '1. ມາດຕາ 6 ຂອບເຂດການນໍາໃຊ້ກົດໝາຍ',
        '1.1. ລາຍລະອຽດຂອງຂອບເຂດ',
        '2. ມາດຕາ 7 ການຮ່ວມມືສາກົນ',
        '1) ຂັ້ນສູນກາງ ເປັນຜູ້ອອກອະນຸຍາດ',
        'ລັດຖະມົນຕີ',
      ]),
    );
    expect(builder.sections.map((s) => s.label)).toEqual(['1', '2']);
    expect(builder.sections[0]!.headingPath).toMatch(/^2\. ແນະນຳການຈັດຕັ້ງປະຕິບັດ.* > 1\. ມາດຕາ 6/u);
    expect(builder.sections[0]!.text).toContain('1.1. ລາຍລະອຽດຂອງຂອບເຂດ');
    expect(builder.sections[1]!.text).toContain('1) ຂັ້ນສູນກາງ');
    expect(builder.sections[1]!.text).not.toContain('ລັດຖະມົນຕີ');
  });

  it('leaves a document with fewer than two points whole', () => {
    const { builder } = sectioniseLao(page(['ຄໍາສັ່ງ ວ່າດ້ວຍການປ້ອງກັນ', '1. ຫ້າມນໍາໃຊ້ຢາທີ່ບໍ່ໄດ້ມາດຕະຖານ', 'ເນື້ອໃນຕໍ່ໄປ']));
    expect(builder.sections).toEqual([]);
  });

  it('does not use points where the instrument has articles', () => {
    const { builder } = sectioniseLao(page(['ມາດຕາ 1 ຈຸດປະສົງ', '1. ຂໍ້ທີໜຶ່ງ', '2. ຂໍ້ທີສອງ', 'ມາດຕາ 2 ຂອບເຂດ', 'ເນື້ອໃນ']));
    expect(builder.sections.map((s) => s.label)).toEqual(['1', '2']);
  });
});
