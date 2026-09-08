/**
 * Matching a candidate instrument to the title ESCAP wrote in a cell.
 *
 * This only ever runs against the baseline, so it lives with it. It is measurement, not scoring:
 * it decides whether a recall number blames the crawl or the ranking, and it got that wrong.
 */
import { describe, expect, it } from 'vitest';
import { sameInstrument } from '../src/baseline/index.js';

describe('matching an instrument to the title ESCAP cited', () => {
  // Every pair below was reported as never discovered while the instrument sat in the register.
  it('sees through an abbreviation, a singular and a trailing comma', () => {
    expect(sameInstrument('Government Procurement Act 1997', 'Government Procurement Act (GPA) 1997')).toBe(true);
    expect(sameInstrument('Copyright Regulations 2021', 'Copyright Regulation 2021')).toBe(true);
    expect(sameInstrument('Patents Rules', 'Patent Rules')).toBe(true);
    expect(sameInstrument(
      'Supreme Court of Judicature (Intellectual Property) Rules 2022',
      'Supreme Court of Judicature (Intellectual Property) Rule 2022,',
    )).toBe(true);
  });

  it('sees through the typos in a hand-written citation', () => {
    expect(sameInstrument(
      'Government Procurement (Challenge Proceedings) Regulations 2002',
      'Government Procurement (Challenage Proceddings) Regulation 2002',
    )).toBe(true);
  });

  it('still tells an Act from the regulations made under it', () => {
    expect(sameInstrument('Copyright Regulations 2021', 'Copyright Act 2021')).toBe(false);
    expect(sameInstrument('Patents Rules', 'Patents Act 1994')).toBe(false);
    expect(sameInstrument('Government Procurement Regulations 2014', 'Government Procurement Act (GPA) 1997')).toBe(false);
  });

  it('does not match something that is not an instrument at all', () => {
    expect(sameInstrument('Copyright Act 2021', 'Common Law doctrine of breach of confidence')).toBe(false);
    expect(sameInstrument('Telecommunications Act 1999', 'Trade Secrets Enterprise Guide issued by IPOS')).toBe(false);
  });
});
