/**
 * The words a page carries that are not the document's words.
 *
 * A PDF prints a header, a footer and a page number around its text, and it has no idea that the
 * page break falls mid-sentence. The extractor emits them in reading order, so the furniture lands
 * inside the provision it interrupts. Section 264 of the Communications and Multimedia Act 1998 --
 * the innocent-carrier rule, and the correct provision for Malaysia's 8.2 -- was stored as
 *
 *   "...or content applications service / 137Communications and Multimedia / provider or any of
 *    his employees, shall not be liable..."
 *
 * The engine reads the page and quotes the rule as printed; verification compares that against the
 * text we hold, does not find it, and refuses. The cell then reports that it found no rule.
 *
 * Measured over sixty Malaysian text-layer PDFs on 17 September 2026: 57 carried furniture, 1,318
 * of 3,182 sections were cleaned, and 1,247 of those had it spliced mid-provision -- 39% of every
 * section in the sample. No section was lost or gained, which is the property that matters: this
 * removes noise, not structure.
 */
import { describe, expect, it } from 'vitest';
import { sectionise, stripPageFurniture, type PageText } from '../src/parse/pdf.js';

/** Pages of six lines, which is the shortest page this looks at. */
function paged(perPage: (n: number) => string[], count: number): PageText[] {
  return Array.from({ length: count }, (_, i) => ({
    page: i + 1,
    lines: perPage(i + 1),
    language: 'en',
  }));
}

/** Body lines that differ page to page, because identical ones would be furniture by this rule. */
const WORDS = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel'];
const filler = (n: number): string[] => [
  `the ${WORDS[n % 8]} provisions of this section apply in the same way as`,
  `they apply to any ${WORDS[(n + 1) % 8]} matter of the same description`,
  `and the ${WORDS[(n + 2) % 8]} Minister may by order provide otherwise`,
  `and the ${WORDS[(n + 3) % 8]} Commission shall publish it in the Gazette`,
];

describe('the header, footer and page number printed around a document', () => {
  // The Act sets its header recto and verso, and the text layer glues the page number to it with
  // no space: "137Communications and Multimedia". Keyed on the whole line, every page's header is
  // unique and the repetition is invisible -- which is why `runningHeader` finds nothing here.
  const act = (): PageText[] =>
    paged(
      (n) => {
        const header =
          n % 2 === 1 ? `${136 + n}Communications and Multimedia` : `${136 + n} Laws of Malaysia A ct 588`;
        // The provision starts at the foot of page 4 and finishes at the head of page 5.
        if (n === 4) {
          return [
            header,
            ...filler(n).slice(0, 3),
            'Persons not liable for act done in good faith',
            '264. Any network facilities provider, network service provider,',
            'applications service provider or content applications service',
          ];
        }
        if (n === 5) {
          return [
            header,
            'provider or any of his employees, shall not be liable in any',
            'criminal proceedings of any nature for any damage (including',
            'punitive damages), loss, cost, or expenditure suffered or to be',
            ...filler(n).slice(0, 3),
          ];
        }
        return [header, ...filler(n), 'and the order takes effect on its publication'];
      },
      8,
    );

  it('drops a running header even where the page number is glued to it', () => {
    const clean = stripPageFurniture(act());
    const text = clean.map((p) => p.lines.join('\n')).join('\n');
    expect(text).not.toContain('Communications and Multimedia');
    expect(text).not.toContain('Laws of Malaysia');
  });

  it('leaves the provision reading continuously across the page break', () => {
    const section = sectionise(stripPageFurniture(act())).sections.find((s) => s.label === '264');
    expect(section).toBeDefined();
    // The quote the engine reads off the page is now the text we hold, so it can be verified.
    expect(section?.text.replace(/\s+/g, ' ')).toContain(
      'content applications service provider or any of his employees, shall not be liable',
    );
  });

  it('keeps every section it started with', () => {
    // The whole risk of this is dropping a line that was the document's own. A section count that
    // moves in either direction means the rule reached past the furniture.
    const pages = act();
    expect(sectionise(stripPageFurniture(pages)).sections.length)
      .toBe(sectionise(pages).sections.length);
  });

  it('drops a page number printed on a line of its own', () => {
    const pages = paged(
      (n) => [...filler(n), `and the ${WORDS[(n + 4) % 8]} order takes effect on publication`, `${n + 20}`],
      8,
    );
    const clean = stripPageFurniture(pages);
    expect(clean.every((p) => p.lines.length === 5)).toBe(true);
    expect(clean[0]?.lines.at(-1)).toBe('and the foxtrot order takes effect on publication');
  });

  it('keeps a bare figure that is not printed like a page number', () => {
    // A schedule of fees ends a page on a number too. A page number appears on nearly every page;
    // three pages out of eight is a table, and losing its last row is losing evidence.
    const pages = paged((n) => [...filler(n), 'the prescribed fee for the class of licence is', n <= 3 ? `${n * 500}` : 'as set out above'], 8);
    const clean = stripPageFurniture(pages);
    expect(clean[0]?.lines.at(-1)).toBe('500');
    expect(clean[2]?.lines.at(-1)).toBe('1500');
  });

  it('never drops a line that opens a provision or names a Part', () => {
    // A document that repeats its Part heading at the top of every page still has to keep it: the
    // Part is how a section is cited, and a provision line is the section itself.
    const parts = paged((n) => ['PART II', ...filler(n), n === 3 ? '12. The Commission shall keep a register.' : 'and so on'], 8);
    const clean = stripPageFurniture(parts);
    expect(clean.every((p) => p.lines[0] === 'PART II')).toBe(true);
    expect(clean[2]?.lines.at(-1)).toBe('12. The Commission shall keep a register.');
  });

  it('looks only at the edges of a page, where furniture is printed', () => {
    // A repeated line in the body of a page is the document repeating itself -- a recital, a form
    // of words, a definition restated -- and it is not ours to remove.
    const repeated = 'the following words are repeated on every page of this Act';
    const pages = paged((n) => {
      const [a, b, c, d] = filler(n) as [string, string, string, string];
      return [`${n}. Application`, a, repeated, b, c, d];
    }, 8);
    expect(stripPageFurniture(pages)).toEqual(pages);
  });

  it('leaves a document too short to establish a pattern alone', () => {
    const pages = paged((n) => [`${n} Laws of Malaysia A ct 588`, ...filler(n), 'and so on'], 3);
    expect(stripPageFurniture(pages)).toEqual(pages);
  });
});
