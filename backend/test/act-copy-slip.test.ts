/**
 * An act copied from the verified quote with one slip is the quote's words, not a claim of its own.
 *
 * Section 12 of a credit information statute bans processing credit data outside the Kingdom. The
 * reader quoted it exactly and was refused, because the act it copied beside the quote dropped two
 * characters of "ประมวลผล".
 */
import { describe, expect, it } from 'vitest';
import { copiedFromTheQuote } from '../src/read/index.js';

const quote =
  'ห้ามมิให้บริษัทข้อมูลเครดิต หรือผู้ควบคุมข้อมูล หรือผู้ประมวลผลข้อมูลที่ดำเนินการหรือประกอบธุรกิจในราชอาณาจักรดำเนินกิจการ ทำการควบคุม หรือประมวลผลข้อมูลภายนอกราชอาณาจักร';

describe('an act copied from the quote', () => {
  it('survives a slip in a long fragment', () => {
    expect(copiedFromTheQuote('ห้ามมิให้...ดำเนินกิจการ ทำการควบคุม หรือประมผลข้อมูล', quote)).toBe(true);
  });

  it('is refused when the words are not the quote’s', () => {
    expect(copiedFromTheQuote('ห้ามมิให้...เปิดเผยข้อมูลแก่บุคคลภายนอก', quote)).toBe(false);
  });

  it('gives a short fragment no allowance', () => {
    expect(copiedFromTheQuote('must', 'the Minister may prescribe')).toBe(false);
    expect(copiedFromTheQuote('mat', 'the Minister may prescribe')).toBe(false);
  });

  it('allows one slip per twenty characters, not more', () => {
    expect(copiedFromTheQuote('shall not procss persnal data', 'a person shall not process personal data outside Singapore')).toBe(false);
    expect(copiedFromTheQuote('shall not procss personal data', 'a person shall not process personal data outside Singapore')).toBe(true);
  });
});

describe('a phrase field copied from the verified quote', () => {
  const quote = 'ห้ามมิให้บริษัทข้อมูลเครดิตประมวลผลข้อมูลภายนอกราชอาณาจักร';

  it('stands when the copy stutters a syllable', () => {
    expect(copiedFromTheQuote('ภายนอกราชอาณาณาจักร', quote)).toBe(true);
  });

  it('is still refused when the words are not the quote', () => {
    expect(copiedFromTheQuote('ภายในราชอาณาจักรไทย', quote)).toBe(false);
  });
});
