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

  // These three were reported as the instrument ESCAP cited, and a reach diagnostic built on them
  // said the law had been registered and never fetched when it had never been registered at all.
  it('does not let the kind word and the year carry the match', () => {
    expect(sameInstrument("Civil Aviation (Carriers' Liability) Act 1959", 'Banking Act 1959')).toBe(false);
    expect(sameInstrument('Australian Education Act 2013', 'Australian Jobs Act 2013')).toBe(false);
    expect(sameInstrument(
      'Coal Mining Industry (Long Service Leave) Administration Act 1992',
      'Broadcasting Services Act 1992',
    )).toBe(false);
  });

  it('refuses a citation that names a kind of instrument and nothing else', () => {
    // Malaysia's sheet cites "Guidelines" for two cells. That identifies nothing, and matching it
    // to the first guideline in the register invents a citation ESCAP never made.
    expect(sameInstrument('Guidelines on Data Breach Notification', 'Guidelines')).toBe(false);
    expect(sameInstrument('Telecommunications Act 1999', 'Act 1999')).toBe(false);
  });

  it('holds the distinguishing word even when the rest of the title agrees', () => {
    expect(sameInstrument('Australian Research Council Act 2001', 'Australian Education Act 2001')).toBe(false);
    // Australia has both, and they are not each other.
    expect(sameInstrument('Income Tax Assessment Act 1997', 'Income Tax Act 1997')).toBe(false);
  });

  it('does not answer a principal Act with the Act that amends it', () => {
    // 'amending' is already a status a row may not cite, and the same trap reaches the matcher:
    // the qualifier in the parentheses is what makes it a separate instrument.
    expect(sameInstrument(
      'Broadcasting Services (Transitional Provisions and Consequential Amendments) Act 1992',
      'Broadcasting Services Act 1992',
    )).toBe(false);
    // A year the citation leaves off is not a qualifier, and still matches.
    expect(sameInstrument('Personal Data Protection Act 2012', 'Personal Data Protection Act')).toBe(true);
  });

  it('reads past the statutory number a citation carries', () => {
    // Malaysia's sheet writes the number into the title. It is apparatus, not the name, and
    // treating it as part of the name lost nine Acts we hold under their exact titles.
    expect(sameInstrument('STRATEGIC TRADE ACT 2010', 'Strategic Trade Act (Act 708) 2010')).toBe(true);
    expect(sameInstrument('OFFICIAL SECRETS ACT 1972', 'Official Secrets Act No.88 1972')).toBe(true);
    expect(sameInstrument('STANDARDS OF MALAYSIA ACT 1996', 'Standards of Malaysia Act (Act 549) 1996')).toBe(true);
    // And still does not make every Act of that year the same Act.
    expect(sameInstrument('PETROLEUM (INCOME TAX) ACT 1967', 'Income Tax Act (Act 53) 1967')).toBe(false);
  });
});
