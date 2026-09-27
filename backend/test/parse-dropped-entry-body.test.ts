/**
 * What is underneath an entry that gets dropped.
 *
 * Lines that match no provision are filed onto whichever numbered entry was open. When that entry
 * is later dropped -- as the arrangement's copy of a provision that appears again with a body, or
 * as a numbered list that was never an arrangement at all -- everything filed under it went with
 * it. Malaysia's Data Protection Officer Competency Guideline is eighteen pages carrying 15,783
 * characters, and kept 1,414: the thirteen sections it produced were the names of the committee
 * that wrote it, because "5. Generali Life Insurance" opened an entry and the guideline's body
 * accumulated under it until the next number.
 *
 * The entry's own line is a duplicate. What follows it is the document.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

const page = (n: number, lines: string[]) => ({ page: n, lines, language: null });

describe('an entry dropped as a duplicate', () => {
  it('keeps the text that accumulated under it, as a section that can be searched', () => {
    const built = sectionise([
      // A contributors list: numbered, so each line opens an entry.
      page(1, ['2. COMMITTEE REPRESENTATION', 'The Guideline was prepared with the following.']),
      page(2, [
        '5. Generali Life Insurance',
        'This Guideline outlines the responsibilities and core competency areas of a Data',
        'Protection Officer appointed under section 12A of the Act.',
      ]),
      // The real provision 5, with a body, appears later and wins the label.
      page(3, ['5. Application', '5.1 This Guideline applies to every data user.']),
    ]);
    const all = built.sections.map((s) => s.text).join('\n');
    expect(all).toContain('core competency areas');
    expect(all).toContain('section 12A of the Act');
    // The label belonged to the entry that was dropped, so the kept text does not claim it.
    const carrier = built.sections.find((s) => s.text.includes('core competency areas'));
    expect(carrier?.label).toBeNull();
    // And the real provision 5 is still the one holding that label, with 5.1 beneath it.
    expect(built.sections.find((s) => s.label === '5')?.text).toContain('Application');
    expect(built.sections.find((s) => s.label === '5.1')?.text).toContain('applies to every data user');
  });

  it('keeps nothing when the dropped entry was a bare one-line listing', () => {
    const built = sectionise([
      page(1, ['3. Interpretation']),
      page(2, ['3. Interpretation', 'In this Act, "data" means information.']),
    ]);
    // One section, not an empty extra beside it.
    expect(built.sections).toHaveLength(1);
    expect(built.sections[0]?.label).toBe('3');
  });
});
