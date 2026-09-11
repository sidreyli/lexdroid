/**
 * How far into a corpus a cell is asked to look.
 *
 * The depth was measured on Singapore's 19,064 provisions and then asked of Australia's 55,902.
 * An Australian provision had a fifth of a Singaporean one's chance of being read, and Australia
 * is the economy the twelve-pillar run scored worst on: around 240 provisions surfaced per cell
 * out of 55,902, which is four in every thousand.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_DEPTH, depthFor, perQueryDepthFor, scaleFor } from '../src/retrieve/index.js';

const SGP = 19_064;
const MYS = 37_144;
const AUS = 55_902;

describe('the depth for a corpus', () => {
  it('is the measured depth for the corpus it was measured on', () => {
    expect(depthFor(SGP)).toBe(DEFAULT_DEPTH);
  });

  it('never reads a smaller corpus more thinly', () => {
    expect(depthFor(6_143)).toBe(DEFAULT_DEPTH);
    expect(depthFor(0)).toBe(DEFAULT_DEPTH);
    expect(scaleFor(1_000)).toBe(1);
  });

  it('looks further into a larger one', () => {
    expect(depthFor(MYS)).toBeGreaterThan(depthFor(SGP));
    expect(depthFor(AUS)).toBeGreaterThan(depthFor(MYS));
  });

  it('grows slower than the corpus, because every extra place is another call to the model', () => {
    // Australia is nearly three times Singapore. Its depth is not nearly three times Singapore's.
    expect(depthFor(AUS) / depthFor(SGP)).toBeLessThan(AUS / SGP);
    expect(depthFor(AUS) / depthFor(SGP)).toBeGreaterThan(1.5);
  });

  it('stops at double, so the cost of a very large corpus stays bounded', () => {
    expect(depthFor(500_000)).toBe(DEFAULT_DEPTH * 2);
    expect(scaleFor(10_000_000)).toBe(2);
  });

  it('widens each query by the same amount, so a provision can reach the fusion at all', () => {
    expect(perQueryDepthFor(AUS)).toBeGreaterThan(perQueryDepthFor(SGP));
    expect(perQueryDepthFor(AUS)).toBeGreaterThan(depthFor(AUS));
  });
});
