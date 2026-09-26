/**
 * The work for Mongolia, Russia and Lao PDR does not move any other economy's answers.
 *
 * Their local-language terms, quote rules and language detection are scoped to Cyrillic and Lao;
 * an English or Malay economy asks the same questions and checks quotes the same way it did.
 */
import { describe, expect, it } from 'vitest';
import { subjectQueries } from '../src/read/index.js';
import { quoteIsInSection } from '../src/read/index.js';
import { wholeWordAt } from '../src/util/locate.js';

describe('an English economy after the three new ones', () => {
  it('asks exactly the framework queries it asked before', () => {
    expect(subjectQueries('data-protection').slice(1)).toEqual(['personal data', 'personal information', 'data protection', 'privacy']);
    expect(subjectQueries('data-protection', ['en']).slice(1)).toEqual(['personal data', 'personal information', 'data protection', 'privacy']);
    expect(subjectQueries('data-protection', ['ms', 'en']).length).toBe(5);
  });

  it('asks the local terms only of an economy that publishes in that language', () => {
    expect(subjectQueries('data-protection', ['mn'])).toContain('хувийн мэдээлэл');
    expect(subjectQueries('data-protection', ['ru'])).not.toContain('хувийн мэдээлэл');
  });

  it('keeps a list marker in an English quote where it was', () => {
    // The Russian "1)" rule is Cyrillic only: an English section keeps its "1)", so a quote that
    // drops it is refused as before.
    expect(quoteIsInSection('the operator shall notify the Authority', 'the operator shall 1) notify the Authority')).toBe(false);
  });

  it('bounds English words as before', () => {
    expect(wholeWordAt('mayor', 0, 3)).toBe(false);
    expect(wholeWordAt('café may', 5, 3)).toBe(true);
  });
});
