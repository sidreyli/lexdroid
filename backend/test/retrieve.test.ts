/**
 * How a cell's queries are derived, and the two things that must not be asked.
 */
import { describe, expect, it } from 'vitest';
import { addGoverningSeats, queriesFor, seatQueryBests } from '../src/retrieve/index.js';
import type { Indicator } from '../src/rubric/types.js';

const indicator: Indicator = {
  id: '6.4',
  pillarId: 6,
  pillarName: 'Cross-border Data Policies',
  category: 'Conditional flow regimes',
  exception: 'Not score data localization measure applied to government data.',
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Conditions for all sectors or personal data', ordinal: 1 },
    { score: 0.5, criterion: 'Conditions for specific data or non-personal data', ordinal: 2 },
    { score: 0, criterion: 'No requirement', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

describe('the query set for a cell', () => {
  it('never asks for the absence of a requirement', () => {
    // No provision reads "No requirement". Asking for it retrieves whatever is nearest to nothing
    // in particular, and reciprocal rank fusion then weights that as heavily as a real hit.
    // Absence is what Zone 3 concludes from the other bands, not something to search for.
    const qs = queriesFor(indicator);
    expect(qs.some((q) => /no requirement/i.test(q))).toBe(false);
  });

  it('never asks the scoring instruction as if it described a law', () => {
    // "Not score data localization measure applied to government data" is an instruction to whoever
    // scores. Asked as a query it returned four unrelated sections and displaced the provision the
    // indicator is actually about. It belongs to Zone 3.
    const qs = queriesFor(indicator);
    expect(qs.some((q) => /not score/i.test(q))).toBe(false);
  });

  it('attaches the subject to every band, because a band alone names no area of law', () => {
    // "Conditions for specific data or non-personal data" scored 0.62 against Health Information
    // and 0.63 against Application of Act. On its own it is not a question about anything.
    const qs = queriesFor(indicator);
    const bandQueries = qs.filter((q) => /Conditions for/i.test(q));
    expect(bandQueries).toHaveLength(2);
    for (const q of bandQueries) expect(q).toContain('Conditional flow regimes');
  });

  it('asks about the indicator itself as well as its bands', () => {
    expect(queriesFor(indicator)[0]).toBe('Cross-border Data Policies: Conditional flow regimes');
  });

  it('asks in the words the law is written in, not the words of the rubric', () => {
    // Malaysia's tax acts say records shall be "kept in Malaysia"; the gloss says "within the
    // economy", and at depth 24 that gap is why indicator 6.2 never saw them.
    const localStorage: Indicator = { ...indicator, id: '6.2', category: 'Local storage requirements' };
    const qs = queriesFor(localStorage, 'Malaysia');
    expect(qs.some((q) => /the economy/i.test(q))).toBe(false);
    expect(qs.some((q) => /kept within Malaysia/i.test(q))).toBe(true);
  });

  it('leaves the queries generic when no economy name is known', () => {
    const localStorage: Indicator = { ...indicator, id: '6.2', category: 'Local storage requirements' };
    expect(queriesFor(localStorage).some((q) => /within the economy/i.test(q))).toBe(true);
  });
});

describe('what each query keeps of its own answer', () => {
  // Four near-duplicate queries and one that asks something the others do not. The odd one out
  // is the measure gloss, and on Singapore it is the query that found the Companies Act.
  const hit = (sectionId: number, rank: number) =>
    ({ sectionId, rank, score: 1 / rank, channel: 'dense' as const, query: 'q' });
  const chorus = [hit(1, 1), hit(2, 2), hit(3, 3)];
  const runs = [chorus, chorus, chorus, [hit(9, 1), hit(8, 2), hit(1, 3)]];
  // What fusion makes of that: the three the chorus agrees on, then the odd one out, far down.
  const fused = [{ sectionId: 1 }, { sectionId: 2 }, { sectionId: 3 }, { sectionId: 9 }, { sectionId: 8 }];

  it('seats a strong answer that only one query found', () => {
    const ordered = seatQueryBests(runs, fused, 2).map((h) => h.sectionId);
    expect(ordered.slice(0, 4)).toEqual([1, 9, 2, 8]);
  });

  it('keeps every section, and each of them once', () => {
    const ordered = seatQueryBests(runs, fused, 2).map((h) => h.sectionId);
    expect(ordered.sort()).toEqual([1, 2, 3, 8, 9]);
  });

  it('changes nothing when no seats are given', () => {
    expect(seatQueryBests(runs, fused, 0)).toEqual(fused);
  });

  it('never seats a section the fused set does not hold', () => {
    const ordered = seatQueryBests([[hit(42, 1)]], fused, 2).map((h) => h.sectionId);
    expect(ordered).not.toContain(42);
  });
});

describe('seating the instruments that govern the question', () => {
  const owner = (id: number): number => Math.floor(id / 10);
  const ordered = [11, 21, 22, 31, 12, 23, 13, 32].map((sectionId) => ({ sectionId }));

  it('adds each named instrument best provisions to the depth, in the order named', () => {
    const { order, counts } = addGoverningSeats(ordered, owner, [3, 1], 2, 3);
    expect(order.map((h) => h.sectionId)).toEqual([11, 21, 22, 31, 32, 12]);
    expect(counts.get(3)).toBe(2);
    expect(counts.get(1)).toBe(2);
  });

  it('takes nothing out of the depth to make room', () => {
    const { order } = addGoverningSeats(ordered, owner, [2], 2, 3);
    expect(order.slice(0, 3).map((h) => h.sectionId)).toEqual([11, 21, 22]);
  });

  it('spends no seat twice on a provision the depth already held', () => {
    const { order } = addGoverningSeats(ordered, owner, [1], 2, 8);
    expect(order.map((h) => h.sectionId)).toEqual(ordered.map((h) => h.sectionId));
  });

  it('records nothing for an instrument the search never surfaced', () => {
    const { order, counts } = addGoverningSeats(ordered, owner, [9], 2, 8);
    expect(counts.get(9)).toBeUndefined();
    expect(order.map((h) => h.sectionId)).toEqual(ordered.map((h) => h.sectionId));
  });

  it('seats what the instrument itself answered best, not what the fused order preferred', () => {
    // Malaysia's section 129 came back fifth on the query that describes the measure and
    // fifty-ninth after fusion, so the fused order spent the Act's places elsewhere.
    const best = (id: number): number => ({ 21: 9, 22: 8, 23: 1 })[id] ?? 99;
    const { order } = addGoverningSeats(ordered, owner, [2], 2, 1, best);
    expect(order.map((h) => h.sectionId)).toEqual([11, 23, 22]);
  });
});
