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
const UNSPOKEN = '*"“”„‟″«»';

/** One source character, folded. Empty when it collapses into the character before it. */
function fold(ch: string): string {
  if (UNSPOKEN.includes(ch)) return '';
  // Lao OCR writes ຳ as ໍ + າ as often as not; both sides are decomposed, each half keeping the offset.
  if (ch === 'ຳ') return 'ໍາ';
  if ('‘’‚‛′'.includes(ch)) return "'";
  if ('‐‑‒–—―−'.includes(ch)) return '-';
  if (/\s/.test(ch)) return ' ';
  return ch.toLowerCase();
}

/** A Lao letter: Lao writes no space between words. */
const NO_WORD_SPACES = /[຀-໿]/;

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
    // Lao writes no space between words, so a space between two Lao letters may be a line the page
    // wrapped inside a word -- see normaliseForQuoteCheck in ../read.
    if (f === ' ' && NO_WORD_SPACES.test(text.slice(-1)) && NO_WORD_SPACES.test(s.slice(i).trimStart().charAt(0))) continue;
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
  // Cyrillic letters too: "мэдээлэл" must not be found inside "мэдээллийн" either. Nothing else is
  // added, so English is bounded exactly as it was; Lao writes no space between words, so a Lao
  // letter beside a fragment is no sign it is cut.
  const inWord = (c: string) => /[a-z0-9Ѐ-ӿ]/.test(c);
  return !inWord(before) && !inWord(after);
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

/** Letters of the scripts the near match is for: Cyrillic and Lao. */
const OTHER_SCRIPT = /[Ѐ-ӿ຀-໿]/g;

/** Whether text is written mostly in Cyrillic or Lao rather than Latin. */
export function mostlyOtherScript(text: string): boolean {
  const other = (text.match(OTHER_SCRIPT) ?? []).length;
  return other > 0 && other > (text.match(/[A-Za-z]/g) ?? []).length;
}

/**
 * The share of a quote's characters that must be found, in order, in the passage it came from.
 * Not lower: a Lao reading that condensed an OCR-broken sentence came to 66% and is a paraphrase,
 * not a copy, so it stays unverified; the Mongolian near miss is 99%.
 */
export const NEAR_COVERAGE = 0.92;
/** How much longer than the quote the passage may be: room for page debris the quote skipped. */
const NEAR_STRETCH = 1.35;

/**
 * Where a Cyrillic or Lao quotation sits in its source when it is not character-for-character.
 *
 * Two kinds of near miss were measured on the paid run, and neither is a paraphrase. The reader
 * copied Mongolia's Personal Data Protection Law with two Latin letters inside a Cyrillic word
 * ("боловсруlsх" for "боловсруулах") and every other of 250 characters exact. And a Lao law's OCR
 * text carries page furniture inside a sentence -- "ການຕິດ\nຕະ ຈ ນ, ຈ 13 ນ ແ ະ. , ນ\nຕາມ" -- which
 * the reader, rightly, did not copy. Both failed the exact check, and both laws are the framework
 * the cell is about.
 *
 * So: the passage whose characters cover at least 92% of the quote's, in order, spanning at most
 * 35% more than the quote. What is returned is the source's own span, so the caller quotes the law
 * and not the reader's copy of it. English text is never matched this way, and returns null.
 */
export function locateNearQuote(haystack: string, needle: string): { start: number; end: number } | null {
  const n = foldWithOffsets(needle).text.trim();
  if (n.length < 20 || !mostlyOtherScript(n)) return null;
  const h = foldWithOffsets(haystack);
  const m = n.length;
  const pad = Math.ceil(m * (NEAR_STRETCH - 1)) + 8;

  // Candidate windows around short shingles of the quote that do occur in the source.
  const K = 8;
  const starts = new Set<number>();
  for (const o of [0, Math.floor(m / 4), Math.floor(m / 2), Math.floor((3 * m) / 4), Math.max(0, m - K)]) {
    const shingle = n.slice(o, o + K);
    if (shingle.trim().length < K - 1) continue;
    let at = h.text.indexOf(shingle);
    for (let seen = 0; at >= 0 && seen < 20; seen += 1) {
      starts.add(Math.max(0, at - o));
      at = h.text.indexOf(shingle, at + 1);
    }
  }

  let best: { start: number; end: number; matched: number } | null = null;
  for (const s0 of starts) {
    const lo = Math.max(0, s0 - pad);
    const hi = Math.min(h.text.length, s0 + m + pad);
    const hit = align(n, h.text.slice(lo, hi));
    if (!hit) continue;
    const span = hit.end - hit.start;
    if (hit.matched < NEAR_COVERAGE * m || span > NEAR_STRETCH * m) continue;
    if (!best || hit.matched > best.matched) best = { start: lo + hit.start, end: lo + hit.end, matched: hit.matched };
  }
  if (!best || best.end <= best.start) return null;
  return { start: h.starts[best.start]!, end: h.ends[best.end - 1]! };
}

/**
 * The span of `text` that best matches all of `q`, free to start and end anywhere in `text`: the
 * semi-global edit alignment, with the matched characters counted on the way back.
 */
function align(q: string, text: string): { start: number; end: number; matched: number } | null {
  const m = q.length;
  const w = text.length;
  if (w === 0) return null;
  const cols = w + 1;
  const d = new Uint16Array((m + 1) * cols);
  for (let i = 1; i <= m; i += 1) d[i * cols] = i;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= w; j += 1) {
      const sub = d[(i - 1) * cols + j - 1]! + (q[i - 1] === text[j - 1] ? 0 : 1);
      const del = d[(i - 1) * cols + j]! + 1;
      const ins = d[i * cols + j - 1]! + 1;
      d[i * cols + j] = Math.min(sub, del, ins);
    }
  }
  let end = 1;
  for (let j = 1; j <= w; j += 1) if (d[m * cols + j]! < d[m * cols + end]!) end = j;
  let i = m;
  let j = end;
  let matched = 0;
  while (i > 0 && j > 0) {
    const here = d[i * cols + j]!;
    if (here === d[(i - 1) * cols + j - 1]! + (q[i - 1] === text[j - 1] ? 0 : 1)) {
      if (q[i - 1] === text[j - 1]) matched += 1;
      i -= 1;
      j -= 1;
    } else if (here === d[(i - 1) * cols + j]! + 1) i -= 1;
    else j -= 1;
  }
  return { start: j, end, matched };
}
