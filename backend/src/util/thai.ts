/**
 * Thai's one real normalization ambiguity that `String.prototype.normalize` does not touch.
 *
 * SARA AM (the vowel in, e.g., น้ำ "water") is a single precomposed code point, U+0E33 -- but it can
 * also arrive as the decomposed sequence NIKHAHIT + SARA AA, U+0E4D U+0E32, which different Thai
 * input methods, fonts and OCR engines genuinely produce. This is not a JS/Node quirk: Unicode
 * itself defines no canonical decomposition mapping for Thai combining marks (verified directly --
 * `'ำ'.normalize('NFC')` and `'ํา'.normalize('NFC')` are NOT equal), so NFC/NFD are
 * no-ops for this exact case, unlike the Latin-diacritic or Hangul equivalences they do cover.
 *
 * Deliberately its own zero-dependency module (like util/locate.ts): it is needed by both the
 * search-query side (index/index.ts) and the FTS-indexing side (db/index.ts), and those two modules
 * already import from each other, so this cannot live in either without a circular import.
 *
 * India's Hindi-language search likely has the same latent bug this module's caller fixes for Thai
 * (Devanagari vowel signs are also Unicode category Mark) -- found as a side effect here, not fixed,
 * out of scope for this branch; see docs/thailand-integration-plan.md's combining-mark section.
 */
export function canonicalizeThai(s: string): string {
  return s.replace(/ํา/g, 'ำ').replace(/ໍາ/g, 'ຳ');
}

/**
 * A Thai combining tone or vowel mark: U+0E31, U+0E34-U+0E3A, U+0E47-U+0E4E. Every one of these
 * sits directly on the base character before it -- Unicode draws it there, not beside it -- so a
 * space between the two is never how the page was set.
 */
const THAI_COMBINING_MARK = 'ัิ-ฺ็-๎';

/**
 * A base character split from the combining mark that must sit on it by a space neither pdf.js nor
 * Tesseract meant to insert.
 *
 * pdf.js reports a PDF's glyphs in the order the page's content stream draws them, and Tesseract's
 * line reconstruction does the same from its own detected glyph boxes; either can land a synthetic
 * word-boundary space between a base character and the combining mark stacked on it when the font
 * or the scan draws the mark as a separate, slightly offset glyph. The Bank of Thailand's own
 * "ซ้ำซ้อน" ("duplication") came out of a text-layer PDF as "ซ ้าซ้อน", and its "ต่า" ("low tone")
 * as "ต ่า" -- in both, the mark is what follows the space, never what precedes it, because a mark
 * has nothing to attach to on either side but the character before it.
 *
 * Deliberately narrower than Thai's general inter-word spacing, which is real and is left alone --
 * unlike Lao, Thai marks a genuine word break with a space, and dropping one shortens whatever
 * fragment relied on it standing. A combining mark is never legitimately a word of its own, so this
 * carries none of that risk.
 */
const THAI_SPLIT_MARK = new RegExp(`(\\p{Script=Thai}) (?=[${THAI_COMBINING_MARK}])`, 'gu');

/** `s`, with a space rejoining any Thai base character to a combining mark split from it. */
export function rejoinThaiMarks(s: string): string {
  return s.replace(THAI_SPLIT_MARK, '$1');
}
// Lao has the identical case: ຳ (U+0EB3) against NIGGAHITA + SARA AA (U+0ECD U+0EB2), with no
// canonical decomposition either. Lao OCR produces the two-point form in 61% of the provisions held
// (7,027 of 11,423, measured 28 September 2026) while the Lao query translations are all written
// with the single point, so without this fold a Lao keyword query containing it missed most of the
// corpus. Lao script only, so no Thai, Latin or Cyrillic text is touched.
