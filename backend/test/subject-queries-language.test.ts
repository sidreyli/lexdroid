/**
 * A framework's subject is asked in the language the economy legislates in, and only in that one.
 *
 * Asked in English alone, Thailand's register ranked the Consumer Protection Act 17th for its own
 * subject: its title is Thai, and the English words found the Acts whose titles carry a translation.
 * Asked in Thai as well for every economy, a Thai query would move Australia's title ranking.
 */
import { describe, expect, it } from 'vitest';
import { frameworkWordsShown, subjectQueries, subjectQueriesIn } from '../src/read/index.js';

describe('the subject, asked in the economy’s own language', () => {
  it('adds the Thai names for an economy whose law is Thai', () => {
    expect(subjectQueriesIn('consumer-protection', ['th'])).toContain('ผู้บริโภค');
  });

  // Lao law's shield: the E-Transactions Law's "ການບໍ່ມີຄວາມຮັບຜິດຊອບຂອງສື່ກາງ", never examined for
  // 8.2 while the only Lao name was "service provider", which every payment rule uses.
  it('asks Lao law about its intermediary by the word it uses, and reads that word without its tone mark', () => {
    expect(subjectQueriesIn('intermediary-liability', ['lo'])).toContain('ສື່ກາງ');
    const article = 'ມາດຕາ 45 ການບໍ່ມີຄວາມຮັບຜິດຊອບຂອງສືກາງ\nສືກາງ ບໍ່ມີຄວາມຮັບຜິດຊອບ ກ່ຽວກັບ: ຂໍ້ຄວາມທີ່ເປັນຂໍ້ມູນ ທີ່ຕົນໃຫ້ບໍລິການ';
    expect(frameworkWordsShown('ສືກາງ ບໍ່ມີຄວາມຮັບຜິດຊອບ ກ່ຽວກັບ: ຂໍ້ຄວາມທີ່ເປັນຂໍ້ມູນ', 'intermediary-liability', article)).toBe(true);
    // A payment rule's parties are not an intermediary's shield.
    expect(frameworkWordsShown('ຜູ້ດໍາເນີນທຸລະກິດການຊໍາລະ ຕ້ອງເກັບຮັກສາຂໍ້ມູນ', 'cybersecurity', 'ຜູ້ດໍາເນີນທຸລະກິດການຊໍາລະ ຕ້ອງເກັບຮັກສາຂໍ້ມູນ, ເອກະສານ')).toBe(false);
  });

  it('asks an English-language economy exactly what it was asked before', () => {
    expect(subjectQueriesIn('consumer-protection', ['en'])).toEqual(subjectQueries('consumer-protection'));
    expect(subjectQueriesIn('intermediary-liability', ['en', 'ms', 'zh', 'ta'])).toEqual(subjectQueries('intermediary-liability'));
  });
});
