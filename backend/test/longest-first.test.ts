/**
 * The order work is handed out in decides when the run ends.
 *
 * In listed order the three pillar 12s -- the largest unit each economy has -- are the last three
 * claimed, so a twelve-engine fleet sits on its biggest job at the end instead of the start.
 */
import { describe, expect, it } from 'vitest';
import { longestFirst, workUnits, type Unit } from '../src/run/fleet.js';

/** Stands in for the rubric: pillar 12 asks about 15 indicators, pillar 1 about one. */
const SIZE: Record<number, number> = { 1: 1, 2: 3, 3: 5, 4: 7, 5: 6, 6: 4, 7: 5, 8: 4, 9: 3, 10: 4, 11: 4, 12: 15 };
const size = (u: Unit) => SIZE[u.pillar] ?? 0;

const ALL = workUnits(['AUS', 'MYS', 'SGP'], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

describe('handing out the biggest work first', () => {
  it('starts every economy\'s largest pillar before anything small', () => {
    const order = longestFirst(ALL, size);
    expect(order.slice(0, 3).map((u) => u.pillar)).toEqual([12, 12, 12]);
  });

  it('leaves the smallest for last, where a late start costs nothing', () => {
    const order = longestFirst(ALL, size);
    expect(order.slice(-3).every((u) => u.pillar === 1)).toBe(true);
  });

  it('loses no work and invents none', () => {
    const order = longestFirst(ALL, size);
    expect(order).toHaveLength(ALL.length);
    expect(new Set(order.map((u) => `${u.economy}/${u.pillar}`)).size).toBe(ALL.length);
  });

  it('keeps listed order among units of the same size, so a run is reproducible', () => {
    const order = longestFirst(ALL, size);
    const twelves = order.filter((u) => u.pillar === 12).map((u) => u.economy);
    expect(twelves).toEqual(['AUS', 'MYS', 'SGP']);
  });

  it('does not reorder in place, because the caller may still want the listing', () => {
    const original = [...ALL];
    longestFirst(ALL, size);
    expect(ALL).toEqual(original);
  });
});
