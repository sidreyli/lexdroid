/**
 * The reader's answer has to end.
 *
 * The defect these tests were written for: Australian Privacy Principle 8, the provision that
 * governs sending personal information overseas, was retrieved, read, and recorded as imposing
 * nothing. It had not been read at all -- the model repeated one finding until it was cut off at
 * the output limit, and a cut-off answer carries no findings. Every read that ever hit the limit
 * came back empty, and they were the long, densely-subclaused provisions where the duties live.
 *
 * The fix is not a filter on the output. It is a bound in the decoding grammar, so the repetition
 * that produced those reads cannot be generated in the first place.
 */
import { describe, expect, it } from 'vitest';
import { __schema, MAX_FINDINGS_PER_PROVISION } from '../src/read/index.js';
import { loadRubric } from '../src/rubric/index.js';

const rubric = loadRubric();
const pillar = (n: number) => rubric.indicators.filter((i) => i.id.startsWith(`${n}.`));

describe('the findings array is bounded', () => {
  it('declares a limit for every pillar the reader is asked about', () => {
    for (let n = 1; n <= 12; n++) {
      const indicators = pillar(n);
      if (indicators.length === 0) continue;
      const schema = __schema(indicators) as { properties: { findings: { maxItems?: number } } };
      expect(schema.properties.findings.maxItems).toBe(MAX_FINDINGS_PER_PROVISION);
    }
  });

  it('leaves room above every reading the corpus has ever produced', () => {
    // Eleven findings from one provision is the most ever observed, twice in 5,282 readings.
    expect(MAX_FINDINGS_PER_PROVISION).toBeGreaterThan(11);
  });

  it('bounds the country list inside a finding too, being the other array a model can repeat', () => {
    const schema = __schema(pillar(6)) as {
      properties: { findings: { items: { properties: { countriesNamed: { maxItems?: number } } } } };
    };
    expect(schema.properties.findings.items.properties.countriesNamed.maxItems).toBeGreaterThan(0);
  });
});
