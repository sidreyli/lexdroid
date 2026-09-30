/**
 * What a framework indicator is a question about, and which instruments it may be answered from.
 *
 * Pillar 8's two framework cells gave the same answer in all three economies because they were
 * asked the same question. The rubric asks two: 8.1 is "Lack of safe harbour for copyright
 * infringements", 8.2 is "...for other illegal activities", and Australia answers 0 to one and 1
 * to the other. And the instruments they were answered from were not instruments: every candidate
 * examined for Singapore's 8.1 and 8.2 was a Monetary Authority press release.
 */
import { describe, expect, it } from 'vitest';
import { FRAMEWORK_OF, interleave } from '../src/cell/index.js';
import { subjectQueries, type FrameworkSubject } from '../src/read/index.js';

describe('the two safe-harbour indicators', () => {
  it('are not asked the same question', () => {
    expect(FRAMEWORK_OF['8.1']).toBeDefined();
    expect(FRAMEWORK_OF['8.2']).toBeDefined();
    expect(FRAMEWORK_OF['8.1']).not.toBe(FRAMEWORK_OF['8.2']);
  });

  it('ask about copyright and about everything else, in those words', () => {
    const copyright = subjectQueries(FRAMEWORK_OF['8.1'] as FrameworkSubject)[0]!;
    const other = subjectQueries(FRAMEWORK_OF['8.2'] as FrameworkSubject)[0]!;
    expect(copyright).toMatch(/copyright/i);
    expect(other).toMatch(/other than copyright/i);
  });

  it('ask for the shield, because that is the band the score turns on', () => {
    // "Sectoral/Horizontal framework in place that LIMITS liability for intermediaries". Asked
    // about liability at large, the reader named Australia's Online Safety Act 2021 -- which
    // imposes duties on service providers and shields nobody -- and scored the cell 0 where the answer
    // scores 1.
    for (const id of ['8.1', '8.2']) {
      expect(subjectQueries(FRAMEWORK_OF[id] as FrameworkSubject)[0]!).toMatch(/shielded from liability/i);
    }
  });
});

describe('the words a framework subject is ranked on', () => {
  // "host" and "platform" ranked the register on substrings, and returned Singapore's
  // Hostage-Taking Act 2010 and Australia's Crimes (Ships and Fixed Platforms) Act 1992 above
  // anything about intermediaries.
  const decoys = ['hostage-taking act 2010', 'crimes (ships and fixed platforms) act 1992'];

  it('do not match an Act that shares a substring with them', () => {
    for (const id of ['8.1', '8.2']) {
      // The first query is the subject sentence, which is prose; the rest are the names.
      const names = subjectQueries(FRAMEWORK_OF[id] as FrameworkSubject).slice(1);
      for (const decoy of decoys) {
        expect(names.filter((n) => decoy.includes(n.toLowerCase()))).toEqual([]);
      }
    }
  });

  it('include the term of art the statutes themselves use', () => {
    for (const id of ['8.1', '8.2']) {
      expect(subjectQueries(FRAMEWORK_OF[id] as FrameworkSubject)).toContain('network service provider');
    }
  });
});

describe('the two lists a framework indicator draws its candidates from', () => {
  const reg = [{ instrumentId: 1 }, { instrumentId: 2 }, { instrumentId: 3 }, { instrumentId: 4 }];
  const ret = [{ instrumentId: 9 }, { instrumentId: 2 }, { instrumentId: 8 }];

  it('are taken alternately, so the second one is reached at all', () => {
    // Appended, and truncated at five by the caller, the retrieval's candidates were never
    // examined: the register always returned five of its own first.
    expect(interleave(reg, ret).slice(0, 5).map((c) => c.instrumentId)).toEqual([1, 9, 2, 3, 8]);
  });

  it('name each instrument once, however many lists it is on', () => {
    const ids = interleave(reg, ret).map((c) => c.instrumentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keep the first list leading, because the register is ranked on the subject itself', () => {
    expect(interleave(reg, ret)[0]!.instrumentId).toBe(1);
  });
});
