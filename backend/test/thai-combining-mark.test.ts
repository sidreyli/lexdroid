/**
 * A Thai base character split from the combining mark that must sit on it.
 *
 * pdf.js and Tesseract both sometimes land a synthetic space between a base character and the
 * combining tone or vowel mark stacked on it. The Bank of Thailand's own text-layer PDF reads
 * "ต่า" ("low tone") as "ต ่า" and "ซ้ำซ้อน" ("duplication") as "ซ ้าซ้อน" -- measured against
 * a Thai run's corpus, doc#6157 (cited by a finding), on 30 September 2026.
 */
import { describe, expect, it } from 'vitest';
import { rejoinThaiMarks } from '../src/util/thai.js';
import { quoteIsInSection } from '../src/read/index.js';
import { locateQuote } from '../src/util/locate.js';

describe('rejoinThaiMarks', () => {
  it('closes a space landed between a base character and its combining mark', () => {
    expect(rejoinThaiMarks('ต ่า')).toBe('ต่า');
  });

  it('closes it wherever it recurs in a longer run of text', () => {
    // Only the space is closed; a separate glyph misreading (ำ read as า) is not this fix's job.
    expect(rejoinThaiMarks('ซ ้าซ้อน')).toBe('ซ้าซ้อน');
  });

  it('leaves a real word space alone, even one that precedes a Thai word', () => {
    const words = 'รัฐธรรมนูญ แห่งราชอาณาจักรไทย';
    expect(rejoinThaiMarks(words)).toBe(words);
  });

  it('touches no other script', () => {
    expect(rejoinThaiMarks('Section 4 shall apply')).toBe('Section 4 shall apply');
  });
});

describe('a Thai quote split by a combining-mark space', () => {
  const source = 'การกระทำที่เป็นการ ซ ้าซ้อน กับอำนาจหน้าที่ของหน่วยงานอื่น ต ่ามาตรานี้ ต้องห้าม';

  it('is still found by the reader\'s faithfully-typed quote', () => {
    const quote = 'การกระทำที่เป็นการ ซ้าซ้อน กับอำนาจหน้าที่ของหน่วยงานอื่น ต่ามาตรานี้ ต้องห้าม';
    expect(quoteIsInSection(quote, source)).toBe(true);
  });

  it('locates to a real span of the source, offsets included', () => {
    const quote = 'ต่ามาตรานี้';
    const at = locateQuote(source, quote);
    expect(at).not.toBeNull();
    expect(source.slice(at!.start, at!.end)).toBe('ต ่ามาตรานี้');
  });
});
