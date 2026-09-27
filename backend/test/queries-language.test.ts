/**
 * The rubric's questions, asked again in the language the economy legislates in.
 *
 * Thai law is written in Thai, and the lexical channel matches no Thai text to an English query:
 * Thailand's Credit Information Business Act, section 12 -- no processing of credit data outside
 * the Kingdom -- was never retrieved for 6.1, and ranked 41st and 73rd on the dense channel alone.
 * Every wording is rendered one for one, so the table has to follow the rubric exactly.
 */
import { describe, expect, it } from 'vitest';
import { queriesFor, queryWordings } from '../src/retrieve/index.js';
import { THAI } from '../src/retrieve/queries-th.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();

describe('the rubric’s questions in Thai', () => {
  it('renders every wording the rubric asks, and nothing it no longer asks', () => {
    const wordings = new Set(rubric.indicators.flatMap((i) => queryWordings(i)));
    expect([...wordings].filter((w) => !(w in THAI))).toEqual([]);
    expect(Object.keys(THAI).filter((w) => !wordings.has(w))).toEqual([]);
  });

  it('asks each English question once more in Thai, after the English', () => {
    for (const indicator of rubric.indicators) {
      const english = queriesFor(indicator, 'Thailand');
      const both = queriesFor(indicator, 'Thailand', ['th']);
      expect(both.slice(0, english.length)).toEqual(english);
      expect(both).toHaveLength(english.length * 2);
      expect(both.slice(english.length).every((q) => /[฀-๿]/.test(q))).toBe(true);
    }
  });

  it('asks an economy with no rendered language exactly what it was asked before', () => {
    for (const indicator of rubric.indicators) {
      expect(queriesFor(indicator, 'Malaysia', ['ms', 'en'])).toEqual(queriesFor(indicator, 'Malaysia'));
      expect(queriesFor(indicator, 'India', ['hi', 'en'])).toEqual(queriesFor(indicator, 'India'));
    }
  });

  it('says within the economy the way a Thai statute says it', () => {
    const localProcessing = rubric.indicators.find((i) => i.id === '6.1')!;
    expect(queriesFor(localProcessing, 'Thailand', ['th'])).toContain('ข้อกำหนดให้ประมวลผลข้อมูลภายในราชอาณาจักร');
  });
});
