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
  return s.replace(/ํา/g, 'ำ');
}
