/**
 * Reading ESCAP's answer for a cell that has several rows.
 *
 * Their database is one row per measure. Resolving those rows the wrong way does not make us
 * wrong -- it makes the scoreboard wrong about us, which is worse, because it points the work at
 * defects that are not there.
 */
import { describe, expect, it } from 'vitest';
import { escapScore } from '../src/baseline/index.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();
const indicator = (id: string) => rubric.indicators.find((i) => i.id === id)!;

describe('ESCAP\'s answer, from their rows', () => {
  it('takes the row itself when there is only one', () => {
    expect(escapScore(indicator('6.2'), [0.5]).score).toBe(0.5);
  });

  it('takes the strongest measure on an ordinary restriction', () => {
    // Singapore 7.3: a 0 row for the PDPA and four 1 rows for the Acts that do require retention.
    expect(escapScore(indicator('7.3'), [0, 1, 1, 1, 1]).score).toBe(1);
  });

  it('escalates two middle-band measures where their criteria say to', () => {
    // Malaysia 6.2: the Services Tax Act and the Income Tax Act, both sectoral, both 0.5.
    const a = escapScore(indicator('6.2'), [0, 0, 0, 0.5, 0.5]);
    expect(a.score).toBe(1);
    expect(a.how).toContain('escalate');
  });

  it('does not escalate when one measure already reaches the top band', () => {
    expect(escapScore(indicator('6.2'), [1, 0.5, 0.5]).score).toBe(1);
  });

  it('takes the lowest row when the top band is an absence', () => {
    // Malaysia 8.2, rows 0 and 1: one of their own rows cites the framework, so there is one.
    const a = escapScore(indicator('8.2'), [0, 1]);
    expect(a.score).toBe(0);
    expect(a.how).toContain('absence');
  });

  it('reads a sectoral framework as sectoral, not as no framework', () => {
    // Malaysia 7.1: rows 0, 0.5, 0.5. The highest would report no data protection law at all.
    expect(escapScore(indicator('7.1'), [0, 0.5, 0.5]).score).toBe(0);
  });

  it('tallies 1.4 rather than taking either end', () => {
    expect(escapScore(indicator('1.4'), [0.25, 0.25, 0.25]).score).toBe(0.75);
    expect(escapScore(indicator('1.4'), [0.25, 0.25, 0.25, 0.25, 0.25]).score).toBe(1);
  });

  it('says so when a combination ladder gets rows it cannot combine', () => {
    // 4.2 scores on having procedures AND provisional measures. Two rows at 0.5 could be one of
    // each, which is the 0 band, and no aggregation of the numbers can tell.
    expect(escapScore(indicator('4.2'), [0.5, 1]).uncertain).toBe(true);
  });
});

describe('the escalation lands in the band their sentence names', () => {
  it('sends two screening mechanisms to 3.4\'s second band, not its first', () => {
    // "Two or more investment screening mechanisms" is band 2. Promoting to band 1 would claim a
    // case where an investment was actually blocked, which is a different finding entirely.
    const i34 = rubric.indicators.find((x) => x.id === '3.4')!;
    const lesser = i34.bands[2]!.score;
    expect(escapScore(i34, [lesser, lesser]).score).toBe(i34.bands[1]!.score);
  });
});
