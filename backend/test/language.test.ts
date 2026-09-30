/**
 * A Malay Act is not an English one.
 *
 * The detector this replaces counted Devanagari against Latin and called everything else English.
 * Malaysia's statute book is Latin script and authoritative in Malay, so the corpus recorded 54,316
 * Malaysian sections with no language at all and every Malaysian export row went out with the
 * Language of Source column blank -- the column they added for this round, and the evidence for
 * C1c, which asks whether the same provision reaches the same indicator whatever the language.
 *
 * The cases below are the ones that decide it: a script that settles the question, two Latin-script
 * languages that only function words separate, and the two places where the honest answer is null.
 */
import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../src/parse/language.js';

const MALAY =
  'Mana-mana orang yang mengendalikan apa-apa perniagaan bagi maksud menjual barang dengan cara ' +
  'elektronik hendaklah terlebih dahulu memperoleh suatu lesen yang diberikan oleh Pihak Berkuasa ' +
  'di bawah seksyen ini, dan lesen itu tidak boleh dipindahkan kepada mana-mana orang lain.';

const ENGLISH =
  'No person shall carry on any business for the purpose of selling goods by electronic means ' +
  'unless that person has first obtained a licence granted by the Authority under this section, ' +
  'and any such licence shall not be transferable to any other person.';

describe('the language of a provision', () => {
  it('reads a Malay provision as Malay, not as English', () => {
    expect(detectLanguage(MALAY, { candidates: ['ms', 'en'] })).toBe('ms');
  });

  it('still reads an English provision as English', () => {
    expect(detectLanguage(ENGLISH, { candidates: ['ms', 'en'] })).toBe('en');
    expect(detectLanguage(ENGLISH, { candidates: ['en'] })).toBe('en');
  });

  it('lets the script settle it where the script can', () => {
    const thai = 'ผู้ใดประกอบธุรกิจขายสินค้าโดยวิธีการทางอิเล็กทรอนิกส์ต้องได้รับใบอนุญาตจากพนักงานเจ้าหน้าที่ตามมาตรานี้ก่อน';
    const hindi = 'कोई भी व्यक्ति इलेक्ट्रॉनिक माध्यम से माल बेचने का कारोबार तब तक नहीं करेगा जब तक उसने इस धारा के अधीन प्राधिकरण से अनुज्ञप्ति प्राप्त न कर ली हो।';
    const russian = 'Никакое лицо не вправе осуществлять предпринимательскую деятельность по продаже товаров электронным способом без получения лицензии.';
    expect(detectLanguage(thai)).toBe('th');
    expect(detectLanguage(hindi)).toBe('hi');
    expect(detectLanguage(russian)).toBe('ru');
  });

  it('is not talked out of a script by the candidate list', () => {
    // A Malaysian profile naming ms and en must not turn a Chinese-language notice into Malay.
    const chinese = '任何人不得在未依据本条规定取得主管机关颁发的许可证的情况下，从事以电子方式销售商品的业务。';
    expect(detectLanguage(chinese, { candidates: ['ms', 'en'] })).toBe('zh');
  });

  it('is not fooled by a few foreign characters in an otherwise English Act', () => {
    const quoting = `${ENGLISH} The term is rendered in the Chinese text as 電子商務.`;
    expect(detectLanguage(quoting, { candidates: ['en', 'zh'] })).toBe('en');
  });

  it('believes the document over the text where the document says', () => {
    expect(detectLanguage(ENGLISH, { stated: 'ms' })).toBe('ms');
    expect(detectLanguage(ENGLISH, { stated: 'en-AU' })).toBe('en');
  });

  it('says nothing about a fragment too short to classify', () => {
    expect(detectLanguage('Section 12.')).toBe(null);
    expect(detectLanguage('')).toBe(null);
    expect(detectLanguage('   ')).toBe(null);
  });

  it('says nothing rather than tossing a coin between two languages that fit alike', () => {
    // Malay and Indonesian share most of this vocabulary. Where the economy has not narrowed it,
    // a null is a gap a reviewer can see and a guess is a false statement about a source document.
    const shared = 'Orang yang dengan sengaja tidak memberikan data dan informasi kepada pejabat yang berwenang dalam hal ini.';
    expect(detectLanguage(shared, { candidates: ['ms', 'id'] })).toBe(null);
  });

  it('refuses a language nobody can check it against', () => {
    expect(detectLanguage(ENGLISH, { candidates: ['xx'] })).toBe(null);
  });
});

/**
 * Cyrillic is written by three of the nine sealed live-test economies, and the script alone
 * settles none of them.
 *
 * It used to be one row in the script table mapped to `ru`, with a comment conceding "Russian,
 * Mongolian, Kazakh" -- so every Mongolian provision was recorded as Russian, and would have gone
 * out that way in Language of Source, a required export column and the only thing criterion C1c
 * is scored on. A wrong language there is a false statement about a source document, which is
 * precisely what this module refuses to make everywhere else.
 */
describe('Cyrillic, which names three languages rather than one', () => {
  const MONGOLIAN =
    'Хувь хүний нууцыг хамгаалах тухай хуулийн 16 дугаар зүйлд заасны дагуу мэдээллийг Монгол Улсын нутаг дэвсгэрт байршуулна';
  const RUSSIAN =
    'В соответствии со статьей 18 Федерального закона о персональных данных оператор обязан обеспечить запись и хранение персональных данных';

  it('tells Mongolian from Russian by the letters Russian does not have', () => {
    // Ө/ө and Ү/ү are Mongolian Cyrillic and appear in no Russian word. One is decisive, so this
    // holds without the profile having to say anything -- which is what the live test needs, when
    // the economy may be one nobody has written a profile for yet.
    expect(detectLanguage(MONGOLIAN)).toBe('mn');
    expect(detectLanguage(RUSSIAN)).toBe('ru');
  });

  it('lets the economy decide where the letters are silent', () => {
    // A short Mongolian provision may contain no Ө or Ү at all, and the profile already states
    // which languages the economy publishes law in.
    const noMarkers = 'Энэ хуулийн зорилт нь мэдээлэл хамгаалах харилцааг зохицуулахад оршино.';
    expect(detectLanguage(noMarkers, { candidates: ['mn'] })).toBe('mn');
    expect(detectLanguage(noMarkers, { candidates: ['ru'] })).toBe('ru');
  });

  it('still answers Russian where nothing narrows it, which every existing caller depends on', () => {
    expect(detectLanguage(RUSSIAN, { candidates: ['ru'] })).toBe('ru');
    expect(detectLanguage(RUSSIAN, { candidates: [] })).toBe('ru');
  });

  it('finds Mongolian inside an economy that publishes in Russian, but not the reverse', () => {
    // The evidence is one-directional and the asymmetry is declared rather than hidden: Mongolian
    // has letters Russian lacks, so it is caught; Russian has none against Mongolian, so Russian
    // text in a Mongolian corpus falls through to what the profile says. Same trade the Latin
    // path makes for Malay against Indonesian.
    expect(detectLanguage(MONGOLIAN, { candidates: ['ru'] })).toBe('mn');
    expect(detectLanguage(RUSSIAN, { candidates: ['mn'] })).toBe('mn');
  });

  it('does not take an English provision naming a Russian body for Russian', () => {
    const english =
      'The operator shall not transfer any personal data to a place outside Singapore except as provided in this section.';
    expect(detectLanguage(english)).toBe('en');
  });

  it('reads Lao as Lao, which the script table already settled', () => {
    const lao = 'ກົດໝາຍວ່າດ້ວຍການປົກປ້ອງຂໍ້ມູນສ່ວນບຸກຄົນ ມາດຕາ 12 ຜູ້ຄວບຄຸມຂໍ້ມູນຕ້ອງເກັບຮັກສາ';
    expect(detectLanguage(lao)).toBe('lo');
  });
});
