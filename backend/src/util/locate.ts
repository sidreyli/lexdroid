/**
 * Where a quotation sits in the text it was taken from.
 *
 * A plain indexOf will not find it. The reader is given text whose apostrophes, dashes and spaces
 * are the source's own typography, and returns a quote whose are not; the quote check already
 * tolerates that, so a finding can be accepted as real and still have no locatable offset. This
 * folds both sides the same way while keeping, for every folded character, the offset it came
 * from -- so the answer is a span in the original text, not in the folded copy.
 */

/** One source character, folded. Empty when the character collapses into the space before it. */
function fold(ch: string): string {
  if ('‘’‚‛′'.includes(ch)) return "'";
  if ('“”„‟″'.includes(ch)) return '"';
  if ('‐‑‒–—―−'.includes(ch)) return '-';
  if (/\s/.test(ch)) return ' ';
  return ch.toLowerCase();
}

interface Folded {
  text: string;
  /** For each character of `text`, the offset just past the source character it came from. */
  ends: number[];
  /** For each character of `text`, the offset of the source character it came from. */
  starts: number[];
}

function foldWithOffsets(s: string): Folded {
  let text = '';
  const starts: number[] = [];
  const ends: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const f = fold(s[i]!);
    if (f === ' ' && text.endsWith(' ')) continue;
    for (const c of f) {
      text += c;
      starts.push(i);
      ends.push(i + 1);
    }
  }
  return { text, starts, ends };
}

/**
 * The span of `needle` in `haystack`, or null if it is not there.
 *
 * Only the first occurrence is reported. A quotation that appears twice in one provision is
 * located at the first, which is the same span a reader following the citation would land on.
 */
export function locateQuote(haystack: string, needle: string): { start: number; end: number } | null {
  const n = foldWithOffsets(needle).text.trim();
  if (n.length === 0) return null;
  const h = foldWithOffsets(haystack);
  const at = h.text.indexOf(n);
  if (at < 0) return null;
  return { start: h.starts[at]!, end: h.ends[at + n.length - 1]! };
}
