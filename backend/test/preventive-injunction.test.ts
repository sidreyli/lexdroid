/**
 * An injunction against an infringement that has not yet happened is a provisional measure.
 */
import { describe, expect, it } from 'vitest';
import { PREVENTIVE_INJUNCTION } from '../src/decide/index.js';

describe('an injunction against an infringement only apprehended', () => {
  it('is a measure to prevent infringement', () => {
    expect(PREVENTIVE_INJUNCTION.test('a claim may be made for an injunction restraining the defendant from any apprehended act of infringement')).toBe(true);
    expect(PREVENTIVE_INJUNCTION.test('the Court shall grant an injunction to prevent infringement')).toBe(true);
  });

  it('is not every injunction', () => {
    expect(PREVENTIVE_INJUNCTION.test('the relief the Court may grant in infringement proceedings includes an injunction')).toBe(false);
    expect(PREVENTIVE_INJUNCTION.test('Nothing in this section affects a court’s power to grant relief by way of an injunction.')).toBe(false);
  });
});
