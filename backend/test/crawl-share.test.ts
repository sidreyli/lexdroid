import { describe, expect, it } from 'vitest';
import { shareTheCrawl } from '../src/contents/index.js';

describe('sharing the crawl between the questions', () => {
  it('gives every question its first choice before any gets its second', () => {
    const order = shareTheCrawl([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    expect(order.slice(0, 3)).toEqual([1, 4, 7]);
    expect(order.slice(3, 6)).toEqual([2, 5, 8]);
  });

  it('reaches a specialist a popularity contest would bury', () => {
    // One question's best answer, ranked nowhere by the other two.
    const specialist = 99;
    const order = shareTheCrawl([[1, 2, 3, 4], [specialist, 5, 6, 7], [8, 9, 10, 11]]);
    expect(order.indexOf(specialist)).toBeLessThan(3);
  });

  it('places each instrument once, at its best question', () => {
    const order = shareTheCrawl([[1, 2, 3], [3, 1, 4], [4, 5, 1]]);
    expect(new Set(order).size).toBe(order.length);
    expect(order.indexOf(3)).toBeLessThan(order.indexOf(2));
  });

  it('keeps going once the short lists run out', () => {
    const order = shareTheCrawl([[1], [2, 3, 4, 5], []]);
    expect(order).toEqual([1, 2, 3, 4, 5]);
  });

  it('has nothing to share when no question placed anything', () => {
    expect(shareTheCrawl([])).toEqual([]);
    expect(shareTheCrawl([[], []])).toEqual([]);
  });
});
