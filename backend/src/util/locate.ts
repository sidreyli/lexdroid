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
 * The shortest a fragment of an elided quotation may be and still be evidence.
 *
 * Every fragment has to be found in order for the quote to verify, so short ones make the check
 * free to pass: "a ... the ... of" appears in sequence in almost any provision.
 */
const MIN_FRAGMENT = 12;

/**
 * The fragments of a quotation that skips over words, or null when it skips over none.
 *
 * A reader is told to quote one unbroken run of words. Where it elides anyway the quotation is
 * still checkable -- against each fragment in turn rather than against the whole -- and a quote
 * that cannot be checked is worth less than one that can.
 */
export function elidedFragments(needle: string): string[] | null {
  if (!/\.\.\.|…/.test(needle)) return null;
  const parts = needle
    .split(/\s*(?:\.\.\.|…)\s*/)
    .map((p) => foldWithOffsets(p).text.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  // One trivial fragment and the check means nothing, so the whole quotation fails rather than
  // passing on words every provision contains.
  if (parts.some((p) => p.length < MIN_FRAGMENT)) return null;
  return parts;
}

/**
 * The span of `needle` in `haystack`, or null if it is not there.
 *
 * Only the first occurrence is reported. A quotation that appears twice in one provision is
 * located at the first, which is the same span a reader following the citation would land on.
 *
 * A quotation that elides is located across its fragments: each is found after the one before, and
 * the span runs from the first to the last, so the citation lands on the passage actually quoted.
 */
export function locateQuote(haystack: string, needle: string): { start: number; end: number } | null {
  const h = foldWithOffsets(haystack);
  const fragments = elidedFragments(needle);

  if (fragments) {
    let from = 0;
    let start: number | null = null;
    let end = 0;
    for (const fragment of fragments) {
      const at = h.text.indexOf(fragment, from);
      if (at < 0) return null;
      if (start === null) start = h.starts[at]!;
      end = h.ends[at + fragment.length - 1]!;
      from = at + fragment.length;
    }
    return start === null ? null : { start, end };
  }

  const n = foldWithOffsets(needle).text.trim();
  if (n.length === 0) return null;
  const at = h.text.indexOf(n);
  if (at < 0) return null;
  return { start: h.starts[at]!, end: h.ends[at + n.length - 1]! };
}
