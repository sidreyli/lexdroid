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

  // 29 September: the Lao gazette wraps lines inside words, and the reader copies the word whole.
  // 95 of Lao PDR's confirmation answers were refused as not the provision's words for it.
  it('finds a Lao quote that joins a word the page wrapped across two lines', () => {
    const source = 'ການຜ່ານແດນ ເຄື່ອງຂອງປະເພດຄວບຄຸມ ຕ້ອງໄດ້ຮັບອະນຸຍາດຈາກລັດຖະບານ ຫຼື ຂະແຫນ\nງການທີ່ກ່ຽວຂ້ອງ ຕາມທີ່ໄດ້ກໍານົດໄວ້';
    const quote = 'ຕ້ອງໄດ້ຮັບອະນຸຍາດຈາກລັດຖະບານ ຫຼື ຂະແຫນງການທີ່ກ່ຽວຂ້ອງ';
    expect(quoteIsInSection(quote, source)).toBe(true);
    expect(quoteAppearsIn(source, quote)).toBe(true);
    const at = locateQuote(source, quote);
    expect(at && source.slice(at.start, at.end)).toBe('ຕ້ອງໄດ້ຮັບອະນຸຍາດຈາກລັດຖະບານ ຫຼື ຂະແຫນ\nງການທີ່ກ່ຽວຂ້ອງ');
  });

  it('still refuses Lao words that are not there, however the spaces fall', () => {
    const source = 'ຕ້ອງໄດ້ຮັບອະນຸຍາດຈາກລັດຖະບານ ຫຼື ຂະແຫນ\nງການທີ່ກ່ຽວຂ້ອງ';
    expect(quoteIsInSection('ບໍ່ຕ້ອງໄດ້ຮັບອະນຸຍາດຈາກລັດຖະບານ', source)).toBe(false);
  });

  it('leaves the spaces between English words where they are', () => {
    expect(quoteIsInSection('must obtain a licence', 'A person must obtain alicence first.')).toBe(false);
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

describe("a list's stem quoted with one of its items", () => {
  const items = Array.from({ length: 6 }, (_, n) => `${n + 1}. the intermediary is not required to monitor any content stored on its system by a user;`).join('\n');
  const act = `An intermediary is not liable for:\n${items}\n7. a data message it did not actually know would give rise to liability.\nArticle 30 Duties of intermediaries`;

  it('is a rule quoted from the provision, though it skips the items between', () => {
    expect(quoteIsInSection('An intermediary is not liable for: ... a data message it did not actually know would give rise to liability', act, 40)).toBe(true);
  });

  it('is not an item from anywhere later in the Act', () => {
    const far = `${act}\n${'Unrelated provisions follow. '.repeat(40)}\na data message it did not actually know would give rise to liability`;
    expect(quoteIsInSection('An intermediary is not liable for: ... Article 31 a data message', far, 40)).toBe(false);
    expect(quoteIsInSection('Duties of intermediaries: ... a data message it did not actually know would give rise to liability', far, 40)).toBe(false);
  });

  it('is still weighed as an elision without the stem', () => {
    expect(quoteIsInSection('An intermediary is not liable for ... a data message it did not actually know would give rise to liability', act, 40)).toBe(false);
  });
});
