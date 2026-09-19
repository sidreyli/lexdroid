/**
 * A Malay Act is not an English one.
 *
 * The detector this replaces counted Devanagari against Latin and called everything else English.
 * Malaysia's statute book is Latin script and authoritative in Malay, so the corpus recorded 54,316
 * Malaysian sections with no language at all and every Malaysian export row went to ESCAP with the
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
