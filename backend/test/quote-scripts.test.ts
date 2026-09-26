/**
 * A true quote in Russian, Mongolian or Lao is found where it was taken from.
 *
 * Russian legislation sets its quotation marks as «guillemets», Lao OCR writes ຳ as ໍ + າ about as
 * often as the single character, and Russian lists close a marker without opening it -- "1)".
 * None of those is a difference in wording, and each failed a faithful quote.
 */
import { describe, expect, it } from 'vitest';
import { quoteIsInSection } from '../src/read/index.js';
import { quoteAppearsIn } from '../src/verify/index.js';
import { locateQuote, wholeWordAt } from '../src/util/locate.js';

const RU = 'Оператор обязан обеспечить запись, систематизацию, накопление, хранение персональных данных граждан Российской Федерации с использованием баз данных, находящихся на территории Российской Федерации, за исключением случаев, указанных в пунктах 2, 3, 4, 8 части 1 статьи 6 настоящего Федерального закона «О персональных данных».';
const LAO = 'ຜູ້ເກັບກໍາຂໍ້ມູນ ຕ້ອງເກັບຮັກສາຂໍ້ມູນສ່ວນບຸກຄົນ ໄວ້ພາຍໃນ ສປປ ລາວ ຕາມທີ່ໄດ້ກໍານົດໄວ້ໃນກົດໝາຍສະບັບນີ້';

describe('quotes in the corpus\'s other scripts', () => {
  it('finds a Russian quote whatever quotation marks it uses', () => {
    const quote = 'настоящего Федерального закона "О персональных данных"';
    expect(quoteIsInSection(quote, RU)).toBe(true);
    expect(quoteAppearsIn(RU, quote)).toBe(true);
    expect(locateQuote(RU, quote)).not.toBeNull();
  });

  it('finds a Lao quote written with ຳ against a source that has ໍ + າ', () => {
    const quote = 'ຜູ້ເກັບກຳຂໍ້ມູນ ຕ້ອງເກັບຮັກສາຂໍ້ມູນສ່ວນບຸກຄົນ ໄວ້ພາຍໃນ ສປປ ລາວ';
    expect(quoteIsInSection(quote, LAO)).toBe(true);
    expect(quoteAppearsIn(LAO, quote)).toBe(true);
    const at = locateQuote(LAO, quote);
    expect(at && LAO.slice(at.start, at.end).startsWith('ຜູ້ເກັບກໍາ')).toBe(true);
  });

  it('flattens a Russian list whose markers close without opening', () => {
    const source = 'Оператор обязан: 1) уведомить уполномоченный орган; 2) хранить сведения на территории Российской Федерации.';
    expect(quoteIsInSection('уведомить уполномоченный орган хранить сведения на территории Российской Федерации', source)).toBe(true);
  });

  it('treats a Cyrillic letter as part of a word, and a Lao one as not', () => {
    const mn = 'мэдээллийн';
    expect(wholeWordAt(mn, 0, 'мэдээл'.length)).toBe(false);
    expect(wholeWordAt(LAO, 3, 5)).toBe(true);
  });
});
