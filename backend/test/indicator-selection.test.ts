/** A run that asks about two indicators of a pillar, as the live test draws them. */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { openRun } from '../src/run/index.js';
import { chosenIndicators, indicatorsOfPillar, loadRubric, strayIndicators } from '../src/rubric/index.js';

const rubric = loadRubric();

describe('choosing indicators', () => {
  it('is the whole pillar when none are named', () => {
    expect(chosenIndicators(8, undefined, rubric)).toEqual(indicatorsOfPillar(8, rubric));
    expect(chosenIndicators(8, [], rubric)).toEqual(indicatorsOfPillar(8, rubric));
  });

  it('is only the ones named, in the rubric order', () => {
    expect(chosenIndicators(8, ['8.4', '8.1'], rubric).map((i) => i.id)).toEqual(['8.1', '8.4']);
  });

  it('names nothing of another pillar', () => {
    expect(chosenIndicators(7, ['8.1', '8.4'], rubric)).toEqual([]);
  });

  it('refuses an indicator outside the pillars chosen, or not in the rubric', () => {
    expect(strayIndicators(['8.1', '8.4'], [8], rubric)).toEqual([]);
    expect(strayIndicators(['8.1', '7.2'], [8], rubric)).toEqual(['7.2']);
    expect(strayIndicators(['8.99'], [8], rubric)).toEqual(['8.99']);
  });
});

describe('the run record', () => {
  it('says which indicators the run asked about, and nothing when it asked about all', () => {
    const db = openDb(':memory:');
    const two = openRun(db, { economies: ['THA'], pillars: [8], indicators: ['8.1', '8.4'], model: 'm' });
    const all = openRun(db, { economies: ['THA'], pillars: [8], model: 'm' });
    const indicatorsOf = (id: string) =>
      (db.prepare('SELECT indicators FROM run WHERE id = ?').get(id) as { indicators: string | null }).indicators;
    expect(JSON.parse(indicatorsOf(two.id)!)).toEqual(['8.1', '8.4']);
    expect(indicatorsOf(all.id)).toBeNull();
    db.close();
  });
});
