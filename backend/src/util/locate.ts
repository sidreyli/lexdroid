/**
 * Where a quotation sits in the text it was taken from.
 *
 * A plain indexOf will not find it. The reader is given text whose apostrophes, dashes and spaces
 * are the source's own typography, and returns a quote whose are not; the quote check already
 * tolerates that, so a finding can be accepted as real and still have no locatable offset. This
 * folds both sides the same way while keeping, for every folded character, the offset it came
 * from -- so the answer is a span in the original text, not in the folded copy.
 */

/**
 * Typography that marks words without being words.
 *
 * Australian drafting stars every defined term and a definition wraps its subject in quotation
 * marks, so a reader quoting the words faithfully still drops them. Comparing them is comparing
 * how the page was set, not what it says.
 */
const UNSPOKEN = '*"“”„‟″';

/** One source character, folded. Empty when it collapses into the character before it. */
function fold(ch: string): string {
  if (UNSPOKEN.includes(ch)) return '';
  if ('‘’‚‛′'.includes(ch)) return "'";
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
 * What an elided quotation has to carry to be evidence.
 *
 * The fragments are matched in order, each after the one before, so a short fragment between two
 * long ones is pinned on both sides and is not a free pass. What has to be held down is the total:
 * too few quoted words either side of the gaps and the gaps are doing the work. A floor on every
 * fragment instead threw away true quotations -- "an authorised airport employee ... may ...
 * require any person ... to provide ..." is how a long provision is honestly quoted.
 */
export const MIN_FRAGMENT = 3;
export const MIN_ANCHOR = 12;
export const MIN_ELIDED_TOTAL = 40;

/** A short fragment must sit on word boundaries, so "may" cannot be found inside "mayor". */
export function wholeWordAt(text: string, at: number, length: number): boolean {
  const before = at === 0 ? ' ' : text[at - 1]!;
  const after = at + length >= text.length ? ' ' : text[at + length]!;
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

/** The first place `fragment` sits in `text` at or after `from`, on word boundaries if asked. */
export function findFragment(text: string, fragment: string, from: number, whole: boolean): number {
  let at = text.indexOf(fragment, from);
  if (!whole) return at;
  while (at >= 0 && !wholeWordAt(text, at, fragment.length)) at = text.indexOf(fragment, at + 1);
  return at;
}

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
  if (parts.some((p) => p.length < MIN_FRAGMENT)) return null;
  if (Math.max(...parts.map((p) => p.length)) < MIN_ANCHOR) return null;
  if (parts.join(' ').length < MIN_ELIDED_TOTAL) return null;
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
      const at = findFragment(h.text, fragment, from, fragment.length < MIN_ANCHOR);
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
