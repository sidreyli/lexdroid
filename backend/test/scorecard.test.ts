/**
 * The scorecard decides which fix a failing cell belongs to, so its classification has to be right.
 *
 * The trap it exists to avoid: reading direction as meaning. Some indicators score the presence of
 * a framework as zero, so the same over-claim that lands above ESCAP on one indicator lands below
 * on another. What separates the two kinds is whether we found anything at all.
 */
import { describe, expect, it } from 'vitest';
import { movement, pillarOf, tally, verdictFor, type CellResult } from '../src/eval/scorecard.js';

const cell = (over: Partial<CellResult> = {}): CellResult => ({
  economy: 'AUS', indicator: '6.2', pillar: 6, ours: 1, theirs: 1, findings: 3, instruments: 2,
  verdict: 'agree', ...over,
});

describe('which kind of disagreement', () => {
  it('calls a match an agreement', () => {
    expect(verdictFor(0.5, 0.5, 4)).toBe('agree');
  });

  it('calls it an over-claim when we read something and still got it wrong', () => {
    expect(verdictFor(1, 0, 12)).toBe('over-claim');
  });

  it('calls it an over-claim when the over-claim scored us BELOW ESCAP', () => {
    // 8.2: finding a horizontal framework scores 0. Claiming one we do not have lands under, not over.
    expect(verdictFor(0, 1, 9)).toBe('over-claim');
  });

  it('calls it a recall miss when we found nothing and ESCAP found a measure', () => {
    expect(verdictFor(0, 1, 0)).toBe('recall-miss');
  });

  it('does not call a correct empty answer a miss', () => {
    expect(verdictFor(0, 0, 0)).toBe('agree');
  });

  it('keeps an abstention separate from a wrong answer', () => {
    expect(verdictFor(null, 1, 40)).toBe('abstained');
  });

  it('says nothing about a cell ESCAP never graded', () => {
    expect(verdictFor(1, null, 3)).toBe('ungraded');
  });
});

describe('which pillar an indicator belongs to', () => {
  it('reads the pillar off the front', () => {
    expect(pillarOf('6.2')).toBe(6);
  });

  it('handles the three-part indicators of pillar 12', () => {
    expect(pillarOf('12.4.1')).toBe(12);
  });

  it('treats 4.01 as pillar 4, because the rubric does', () => {
    expect(pillarOf('4.01')).toBe(4);
  });
});

describe('counting a run up', () => {
  it('excludes ungraded cells from the agreement rate it reports on', () => {
    const t = tally([cell(), cell({ verdict: 'ungraded', theirs: null }), cell({ verdict: 'over-claim' })]);
    expect(t.cells).toBe(3);
    expect(t.ungraded).toBe(1);
    expect(t.agree).toBe(1);
  });

  it('totals findings, which is the over-production signal', () => {
    expect(tally([cell({ findings: 182 }), cell({ findings: 3 })]).findings).toBe(185);
  });
});

describe('what an experiment changed', () => {
  const before = [cell({ indicator: '6.2', verdict: 'over-claim' }), cell({ indicator: '7.1', verdict: 'agree' })];

  it('reports a cell the fix repaired', () => {
    const after = [cell({ indicator: '6.2', verdict: 'agree' }), cell({ indicator: '7.1', verdict: 'agree' })];
    expect(movement(before, after)).toEqual([{ economy: 'AUS', indicator: '6.2', from: 'over-claim', to: 'agree' }]);
  });

  it('reports a cell the fix broke, which is the one that must not be missed', () => {
    const after = [cell({ indicator: '6.2', verdict: 'over-claim' }), cell({ indicator: '7.1', verdict: 'recall-miss' })];
    expect(movement(before, after)).toEqual([{ economy: 'AUS', indicator: '7.1', from: 'agree', to: 'recall-miss' }]);
  });

  it('says nothing about a cell that did not move', () => {
    expect(movement(before, before)).toEqual([]);
  });

  it('ignores a cell the earlier run never had', () => {
    const after = [...before, cell({ indicator: '9.9', verdict: 'over-claim' })];
    expect(movement(before, after)).toEqual([]);
  });
});
