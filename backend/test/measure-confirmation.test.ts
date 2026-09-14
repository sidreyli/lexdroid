/**
 * The second question has to be answerable with "no", and a "yes" has to be the provision's own.
 *
 * The pass exists because the first reading is asked which of a pillar's measures a provision is,
 * and always picks the nearest one. Asked about one measure alone, the reader may still hand back
 * our description of it, or words the provision does not contain -- both of which would confirm a
 * label by restating it.
 */
import { describe, expect, it } from 'vitest';
import { confirmedWords, measureOf } from '../src/read/confirm.js';

const MEASURE = measureOf('12.3', 'ecommerce-licence')!;

const SECTION =
  'No person shall carry on the business of selling goods by electronic means unless that person '
  + 'holds a licence granted by the Authority under this section.';

describe('confirming a measure against the provision', () => {
  it('finds the measure where the catalogue defines it', () => {
    expect(MEASURE.token).toBe('ecommerce-licence');
    expect(measureOf('12.3', 'not-a-measure')).toBeUndefined();
  });

  it('keeps words the provision actually carries', () => {
    expect(confirmedWords('holds a licence granted by the Authority', SECTION, MEASURE)).toBe(
      'holds a licence granted by the Authority',
    );
  });

  it('rules out words the provision does not carry', () => {
    expect(confirmedWords('holds a permit issued by the Minister', SECTION, MEASURE)).toBe(null);
  });

  it('rules out our own description handed back', () => {
    expect(confirmedWords(MEASURE.gloss, SECTION, MEASURE)).toBe(null);
    expect(confirmedWords(MEASURE.defines, SECTION, MEASURE)).toBe(null);
  });

  it('treats an empty or absent answer as the ordinary no', () => {
    expect(confirmedWords(null, SECTION, MEASURE)).toBe(null);
    expect(confirmedWords('   ', SECTION, MEASURE)).toBe(null);
    expect(confirmedWords(42, SECTION, MEASURE)).toBe(null);
  });
});
