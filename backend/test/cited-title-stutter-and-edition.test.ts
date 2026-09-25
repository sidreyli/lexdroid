/**
 * Two instruments we hold that ESCAP's citation could not reach, for reasons of typing and of
 * publishing rather than of identity.
 *
 * This is measurement, like the rest of the baseline: a citation that resolves to nothing is
 * reported as an instrument never discovered, and five cells were reported that way while the
 * instrument sat in the register with its text parsed and indexed.
 *
 *   "Copyright Right Act (Act 332) 1987"          three cells, against COPYRIGHT ACT 1987
 *   "Commonwealth Procurement Rules 2024"         against the 17 November 2025 compilation
 *
 * Neither is a misspelling, which `near` already handles. The first is a word the citation repeats
 * off the end of the word before it; the second is a year that stamps an edition rather than
 * naming an instrument, on a rolling title whose portal keeps only the edition in force.
 */
import { describe, expect, it } from 'vitest';
import { sameInstrument } from '../src/baseline/index.js';

describe('a word the citation stutters', () => {
  it('reaches the Act behind "Copyright Right"', () => {
    expect(sameInstrument('COPYRIGHT ACT 1987', 'Copyright Right Act (Act 332) 1987')).toBe(true);
  });

  it('does not let the stutter join two different Acts', () => {
    expect(sameInstrument('COPYRIGHT ACT 1969 (Repealed by Act 332)', 'Copyright Right Act (Act 332) 1987')).toBe(false);
    expect(sameInstrument('HUMAN RIGHTS COMMISSION OF MALAYSIA ACT 1999', 'Copyright Right Act (Act 332) 1987')).toBe(false);
    expect(sameInstrument('PATENTS ACT 1983', 'Copyright Right Act (Act 332) 1987')).toBe(false);
  });

  it('only drops a proper suffix of the word before it, so a real word stays', () => {
    // "Act (Act 332)" keeps both, and a title is never shortened by a word it carries once.
    expect(sameInstrument('Trade Marks Act 1995', 'Trade Marks Act 1995')).toBe(true);
    expect(sameInstrument('Land Acquisition Act 1960', 'Acquisition Act 1960')).toBe(true);
  });
});

describe('a year that stamps an edition', () => {
  it('reaches the compilation in force for a rolling instrument', () => {
    expect(
      sameInstrument('Commonwealth Procurement Rules 17 November 2025', 'Commonwealth Procurement Rules 2024'),
    ).toBe(true);
  });

  it('still keeps two instruments apart when both years name the instrument', () => {
    expect(sameInstrument('Government Procurement Act 1997', 'Government Procurement Act 2014')).toBe(false);
    expect(sameInstrument('COPYRIGHT ACT 1987', 'Copyright Act 1969')).toBe(false);
  });

  it('does not let a dated title match something else entirely', () => {
    expect(
      sameInstrument('Commonwealth Electoral Act 17 November 2025', 'Commonwealth Procurement Rules 2024'),
    ).toBe(false);
  });
});
