import { describe, expect, it } from 'vitest';
import { MEASURES, INDICATOR_OF_MEASURE } from '../src/rubric/measures.js';

describe('every measure belongs to one indicator', () => {
  // A token two indicators share is dropped from the map, which silently switches off the refile
  // that puts a misfiled finding back where its measure lives.
  it('no token is claimed by two indicators', () => {
    const owners = new Map<string, string[]>();
    for (const [indicatorId, measures] of Object.entries(MEASURES)) {
      for (const m of measures) owners.set(m.token, [...(owners.get(m.token) ?? []), indicatorId]);
    }
    const shared = [...owners].filter(([, ids]) => ids.length > 1);
    expect(shared.map(([t, ids]) => `${t}: ${ids.join(', ')}`)).toEqual([]);
  });

  it('the map therefore names an owner for every token', () => {
    const tokens = Object.values(MEASURES).flatMap((ms) => ms.map((m) => m.token));
    expect(INDICATOR_OF_MEASURE.size).toBe(new Set(tokens).size);
  });
});
