/**
 * The rubric is the scope of the whole system: 61 indicators is how many answers each economy
 * owes. These tests hold that shape, and hold the two source quirks that would silently change it.
 */
import { describe, expect, it } from 'vitest';
import { cellsFor, indicator, indicatorsOfPillar, loadRubric } from '../src/rubric/index.js';
import { __rules } from '../src/decide/index.js';
import type { Indicator } from '../src/rubric/types.js';

type Rule = (indicator: Indicator, qualifying: never[]) => { ordinal: number };

const rubric = loadRubric();

describe('scope', () => {
  it('carries ESCAP\'s 61 regulatory indicators across 12 pillars', () => {
    expect(rubric.indicators).toHaveLength(61);
    expect(rubric.pillars).toHaveLength(12);
    expect(rubric.pillars.map((p) => p.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('excludes the 14 indicators ESCAP draws from external databases', () => {
    expect(rubric.nonRegulatory).toHaveLength(14);
    const inScope = new Set(rubric.indicators.map((i) => i.id));
    for (const id of rubric.nonRegulatory) expect(inScope.has(id)).toBe(false);
  });

  it('owes one cell per indicator per economy', () => {
    expect(cellsFor('Singapore')).toHaveLength(61);
    expect(new Set(cellsFor('Singapore').map((c) => c.indicatorId)).size).toBe(61);
  });
});

describe('indicator ids are text, never numbers', () => {
  it('keeps 4.01 and 4.1 apart', () => {
    // ESCAP's own output template: "entered as a number, 12.10 collapses to 12.1 and 4.01 to 4.1,
    // and the two are different indicators."
    expect(indicator('4.01').category).toMatch(/patent application/i);
    expect(indicator('4.1').category).toMatch(/trade secret/i);
    expect(indicator('4.01').id).not.toBe(indicator('4.1').id);
  });

  it('keeps the three-part ids of pillar 12 intact', () => {
    const ids = indicatorsOfPillar(12).map((i) => i.id);
    for (const id of ['12.4.1', '12.4.4', '12.4.7']) expect(ids).toContain(id);
  });
});

describe('score bands', () => {
  it('gives every indicator at least two bands with real scores', () => {
    for (const i of rubric.indicators) {
      expect(i.bands.length, `${i.id} has too few bands`).toBeGreaterThanOrEqual(2);
      for (const b of i.bands) expect(Number.isNaN(b.score), `${i.id} band ${b.ordinal}`).toBe(false);
    }
  });

  it('never leaves an enumeration marker inside band text', () => {
    for (const i of rubric.indicators) {
      for (const b of i.bands) {
        expect(b.criterion, `${i.id} band ${b.ordinal}`).not.toMatch(/^\d+\s*\)/);
      }
    }
  });

  it('keeps 6.2 band 1 whole, including its cross-reference to band 2', () => {
    // "more than one measure in category (2)" is the clause 6.2's score function turns on. An
    // earlier parser read that "(2)" as a band marker and cut the sentence in half.
    const bands = indicator('6.2').bands;
    expect(bands.map((b) => b.score)).toEqual([1, 0.5, 0]);
    expect(bands[0]!.criterion).toMatch(/more than one measure in category \(2\)/);
  });

  it('keeps 1.4 band 5 whole, including its trailing "up to 1)"', () => {
    const bands = indicator('1.4').bands;
    expect(bands.map((b) => b.score)).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(bands[4]!.criterion).toMatch(/up to 1\)/);
  });
});

describe('indicator shape', () => {
  it('marks the economy-level questions', () => {
    // Citing individual provisions against these "are not discoveries and score zero", and for
    // 8.1, 8.2 and 12.9 the top band is the absence of a framework, which no provision evidences.
    for (const id of ['7.1', '7.2', '8.1', '8.2', '12.9']) expect(indicator(id).shape).toBe('framework');
  });

  it('marks the three practice-led indicators', () => {
    for (const id of ['3.4', '5.3', '9.1']) expect(indicator(id).shape).toBe('practice');
  });

  it('leaves everything else provision-level, and says why for each', () => {
    const byShape = { provision: 0, framework: 0, practice: 0 };
    for (const i of rubric.indicators) {
      byShape[i.shape] += 1;
      expect(i.shapeBasis.length, `${i.id} has no stated basis for its shape`).toBeGreaterThan(20);
    }
    expect(byShape).toEqual({ provision: 53, framework: 5, practice: 3 });
  });
});

describe('exceptions carved out of the policy-issue text', () => {
  it('keeps 3.1 clear of telecom and e-commerce', () => {
    // Pillar 5 covers telecom equity, pillar 12 covers e-commerce. Reading them into 3.1 would
    // double-count the same measure across three indicators.
    expect(indicator('3.1').exception).toMatch(/telecom/i);
    expect(indicator('3.1').exception).toMatch(/Pillar 12/i);
    expect(indicator('3.1').category).not.toMatch(/Exception/i);
  });

  it('keeps 6.2 clear of government data', () => {
    expect(indicator('6.2').exception).toMatch(/government data/i);
  });
});

describe('provenance', () => {
  it('names the document and row behind every indicator', () => {
    for (const i of rubric.indicators) {
      expect(i.provenance.document).toMatch(/Round 1 Database\.xlsx$/);
      expect(i.provenance.locator).toMatch(/row \d+/);
    }
  });
});

/**
 * The indicators that score their maximum for the absence of something. A retrieval miss on one of
 * these reports 1, not 0, so the list is pinned: a rubric change that adds one has to be noticed.
 */
describe('the inverted indicators', () => {
  const INVERTED = ['4.1', '4.2', '4.5', '4.6', '5.1', '5.4', '5.7', '7.1', '7.2', '8.1', '8.2', '11.2', '12.5', '12.9'];

  it('is the fourteen we know about', () => {
    const found = rubric.indicators
      .filter((i) => {
        const rule = (__rules as Record<string, Rule | undefined>)[i.id];
        if (i.shape === 'framework') return (i.bands[0]?.score ?? 0) > 0;
        if (!rule) return false;
        const ordinal = rule(i, []).ordinal;
        return (i.bands.find((b) => b.ordinal === ordinal)?.score ?? 0) > 0;
      })
      .map((i) => i.id);
    expect(found.sort()).toEqual([...INVERTED].sort());
  });
});
