import { describe, expect, it } from 'vitest';
import { ictTariffCodes } from '../src/rubric/ict-goods.js';

describe('ICT goods by tariff code', () => {
  it('reads a code however a customs instrument spaces it', () => {
    expect(ictTariffCodes('falling under tariff heading 8534 0000 of the First Schedule')).toEqual(['8534']);
    expect(ictTariffCodes('84561100, 84569090, 84798199 and 90132000')).toEqual(['845690', '901320']);
    expect(ictTariffCodes('8442 50, 3701 30 00, 3704 00 90')).toEqual(['370130', '844250']);
    expect(ictTariffCodes('Electronic calculators 8470.10')).toEqual(['847010']);
  });

  it('does not read a year, a date or a bare heading as a code', () => {
    expect(ictTariffCodes('dated the 29 th December, 2023 under section 9A')).toEqual([]);
    expect(ictTariffCodes('notification No. 6/16/2022-DGTR dated 2024 10 12')).toEqual([]);
    expect(ictTariffCodes('heading 8534')).toEqual([]);
  });

  it('leaves out goods on no list, and the materials the proposed expansion adds', () => {
    // Welded stainless steel pipes: on none of the three lists.
    expect(ictTariffCodes('tariff item 7306 40 00')).toEqual([]);
    // Liquid epoxy resins: on ITA III, but a raw material the guide excludes.
    expect(ictTariffCodes('tariff item 3907 30 10')).toEqual([]);
    // Soft ferrite cores: on ITA III, and manufactured.
    expect(ictTariffCodes('tariff item 8505 11 90')).toEqual(['850511']);
  });
});
