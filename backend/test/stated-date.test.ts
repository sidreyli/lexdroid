/**
 * A date that does not exist is not a date.
 *
 * Both register adapters built an ISO string out of whatever three groups their pattern caught,
 * without asking whether the day was in the month. "31 September 2015" became "2015-09-31", which
 * SQLite stores happily and every later comparison reads as a day after the 30th; "30 February"
 * became a commencement date that no arithmetic can place. These are misreadings of the page --
 * a page number run into a date, a table cell read across -- and a misreading has to be nothing
 * rather than a wrong fact, because the "last amended" a row reports is evidence a reviewer checks.
 */
import { describe, expect, it } from 'vitest';
import { __dateFrom as ssoDate } from '../src/parse/sso.js';
import { __isoDate as frlDate } from '../src/parse/frl.js';

describe.each([
  ['Singapore Statutes Online', ssoDate],
  ['the Federal Register of Legislation', frlDate],
])('a date read off %s', (_name, date) => {
  it('reads a real date', () => {
    expect(date('4 June 2026')).toBe('2026-06-04');
    expect(date('31 December 1999')).toBe('1999-12-31');
  });

  it('reads the last day of a short month', () => {
    expect(date('30 September 2015')).toBe('2015-09-30');
    expect(date('28 February 2021')).toBe('2021-02-28');
  });

  it('reads 29 February in a leap year', () => {
    expect(date('29 February 2024')).toBe('2024-02-29');
  });

  it('refuses 29 February in a year that has no such day', () => {
    expect(date('29 February 2021')).toBeNull();
  });

  it('refuses a 31st of a month that has 30 days', () => {
    expect(date('31 September 2015')).toBeNull();
    expect(date('31 April 2020')).toBeNull();
  });

  it('refuses a day February never has', () => {
    expect(date('30 February 2020')).toBeNull();
  });

  it('still gives nothing where the page states no date at all', () => {
    expect(date('Not yet commenced')).toBeNull();
    expect(date('')).toBeNull();
  });

  it('gives nothing for a month that is not a month', () => {
    expect(date('4 Smarch 2026')).toBeNull();
  });
});
