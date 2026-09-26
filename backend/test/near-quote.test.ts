/**
 * A Cyrillic or Lao rule copied nearly verbatim is found, and quoted, as the source has it.
 *
 * Measured on the paid run f05a3336: the reader copied Mongolia's Personal Data Protection Law with
 * two Latin letters inside a Cyrillic word, and the law went unshown as its own framework. English
 * is never matched this way, and a paraphrase is still not a quote.
 */
import { describe, expect, it } from 'vitest';
import { locateNearQuote } from '../src/util/locate.js';
import { sourceWords } from '../src/read/index.js';
import { FRAMEWORK_TITLE_DOMAIN } from '../src/rubric/measures.js';

const MN =
  'Энэ хуулиар хүн, хуулийн этгээд, хуулийн этгээдийн эрхгүй байгууллага хүний хувийн мэдээлэл /цаашид "мэдээлэл" гэх/-ийг ' +
  'цуглуулах, боловсруулах, ашиглах, аюулгүй байдлыг хангахтай холбогдсон харилцааг зохицуулна.';

describe('a quote that is nearly, but not exactly, the source', () => {
  it('finds the Mongolian rule despite two Latin letters in a Cyrillic word, and returns the law\'s own words', () => {
    const copy = MN.replace('боловсруулах', 'боловсруlsх').slice(0, 200);
    const at = locateNearQuote(`1 дүгээр зүйл. ${MN} 2 дугаар зүйл.`, copy);
    expect(at).not.toBeNull();
    expect(sourceWords(copy, MN)).toContain('боловсруулах');
  });

  it('leaves an exact copy as it is', () => {
    const exact = MN.slice(0, 120);
    expect(sourceWords(exact, MN)).toBe(exact);
  });

  it('never near-matches English, which is checked exactly as before', () => {
    const law = 'This Act governs the collection, use and disclosure of personal data by organisations.';
    expect(locateNearQuote(law, 'This Act governs the colection, use and disclosure of personal data by organisation')).toBeNull();
  });

  it('does not take a paraphrase for a copy', () => {
    const paraphrase = 'Энэ хууль нь иргэдийн мэдээллийг хамгаалах журмыг тогтооно, ялангуяа цахим орчинд, бүх байгууллагад';
    expect(locateNearQuote(MN, paraphrase)).toBeNull();
  });
});

describe('a data protection framework named in its own language', () => {
  it('is on subject for 7.1 in Russian, Mongolian and Lao, as in English', () => {
    const must = FRAMEWORK_TITLE_DOMAIN['7.1']!.must!;
    for (const title of [
      'Федеральный закон от 27.07.2006 № 152-ФЗ "О персональных данных"',
      'ХҮНИЙ ХУВИЙН МЭДЭЭЛЭЛ ХАМГААЛАХ ТУХАЙ /Шинэчилсэн найруулга/',
      'ກົດໝາຍວ່າດ້ວຍການປົກປ້ອງຂໍ້ມູນເອເລັກໂຕຣນິກ',
      'Personal Data Protection Act 2012',
    ]) expect(must.test(title)).toBe(true);
    expect(must.test('Федеральный закон "О таможенном регулировании"')).toBe(false);
  });
});
