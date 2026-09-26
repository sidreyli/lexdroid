/**
 * A framework's subject is asked in the language the economy legislates in, and only in that one.
 *
 * Asked in English alone, Thailand's register ranked the Consumer Protection Act 17th for its own
 * subject: its title is Thai, and the English words found the Acts whose titles carry a translation.
 * Asked in Thai as well for every economy, a Thai query would move Australia's title ranking.
 */
import { describe, expect, it } from 'vitest';
import { subjectQueries, subjectQueriesIn } from '../src/read/index.js';

describe('the subject, asked in the economy’s own language', () => {
  it('adds the Thai names for an economy whose law is Thai', () => {
    expect(subjectQueriesIn('consumer-protection', ['th'])).toContain('ผู้บริโภค');
  });

  it('asks an English-language economy exactly what it was asked before', () => {
    expect(subjectQueriesIn('consumer-protection', ['en'])).toEqual(subjectQueries('consumer-protection'));
    expect(subjectQueriesIn('intermediary-liability', ['en', 'ms', 'zh', 'ta'])).toEqual(subjectQueries('intermediary-liability'));
  });
});
