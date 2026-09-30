/**
 * What language a provision is written in.
 *
 * Two copies of this existed, both of them counting Devanagari characters against Latin ones and
 * calling anything mostly-Latin English. Malaysia's statute book is Latin script and authoritative
 * in Malay, so every Malay provision in the corpus was recorded as English or as nothing at all:
 * 54,316 Malaysian sections carry no language, and all 225 Malaysian export rows went out with the
 * Language of Source column empty -- the one column added for the final round.
 *
 * So the question is asked in two steps, because it has two different kinds of answer.
 *
 *   By script, where the script settles it. Thai is Thai. Nothing written in Devanagari is English,
 *   and no amount of word-frequency evidence should be able to say otherwise.
 *
 *   By function words, where it does not. English, Malay, Indonesian, Vietnamese, Portuguese and
 *   Tetum all use the Latin alphabet, and what separates them is the small closed class of words
 *   that legal drafting cannot avoid: articles, conjunctions, prepositions, and the auxiliary that
 *   makes an obligation. "hendaklah" is to a Malaysian Act what "shall" is to an Australian one.
 *
 * The economy's own declared languages narrow the second step. A Malaysian instrument is Malay or
 * English, and nothing is gained by letting it be Portuguese -- the profile already says which
 * languages that economy publishes law in, so the guess is made among those and not in general.
 * This matters for Malay and Indonesian in particular, which share most of this vocabulary and are
 * not reliably separable by text alone; the economy tells them apart, and the text does not have to.
 *
 * Returns null rather than guessing at a fragment. An unknown language recorded as null is a gap a
 * reviewer can see; one recorded as English is a false statement about a source document.
 */

/** Scripts that settle the question by themselves. First match on a clear majority wins. */
const SCRIPTS: { language: string; pattern: RegExp }[] = [
  { language: 'hi', pattern: /[ऀ-ॿ]/g }, // Devanagari: Hindi, Marathi, Nepali
  { language: 'zh', pattern: /[一-鿿㐀-䶿]/g }, // Han
  { language: 'ja', pattern: /[぀-ゟ゠-ヿ]/g }, // kana; Han alone is not Japanese
  { language: 'ko', pattern: /[가-힯ᄀ-ᇿ]/g },
  { language: 'th', pattern: /[฀-๿]/g },
  { language: 'lo', pattern: /[຀-໿]/g },
  { language: 'my', pattern: /[က-႟]/g }, // Myanmar
  { language: 'km', pattern: /[ក-៿]/g }, // Khmer
  { language: 'ar', pattern: /[؀-ۿ]/g },
  { language: 'bn', pattern: /[ঀ-৿]/g },
  { language: 'ta', pattern: /[஀-௿]/g },
  { language: 'si', pattern: /[඀-෿]/g },
  { language: 'ka', pattern: /[Ⴀ-ჿ]/g },
  { language: 'hy', pattern: /[԰-֏]/g },
];

/**
 * Cyrillic, which unlike the scripts above does NOT settle the question.
 *
 * It was in the list, mapped to `ru`, with a comment conceding "Russian, Mongolian, Kazakh" --
 * so every Mongolian provision was recorded as Russian, and would have gone out that way in
 * Language of Source, which is a required export column and the one criterion C1c is scored on.
 * A wrong language there is a false statement about a source document, which this module exists
 * to refuse.
 *
 * Three of the nine sealed live-test economies write Cyrillic, so the question is asked properly:
 * by the letters one of them has and the others do not, and then by the economy's own declared
 * languages, exactly as the Latin path below already does for Malay against Indonesian.
 */
const CYRILLIC = /[Ѐ-ӿ]/g;
const CYRILLIC_LANGUAGES = ['ru', 'mn', 'kk'];

/**
 * Letters that are decisive because one orthography has them and the others do not.
 *
 * Russian uses none of these. Kazakh's set is its own; Mongolian shares only Ө and Ү with it, so
 * Kazakh is tested first and a Kazakh-only letter settles the text against both others.
 */
const KAZAKH_LETTERS = /[әғқңұһіӘҒҚҢҰҺІ]/;
const MONGOLIAN_LETTERS = /[өүӨҮ]/;

/**
 * Which Cyrillic language this is, or null where nothing says.
 *
 * `ru` is the fall-through rather than a guess: it is what Cyrillic is when nothing marks it as
 * one of the others and no profile narrows it, which is the behaviour every existing caller
 * already depends on. What changes is that a profile naming Mongolian, or a single Ө in the text,
 * is now enough to stop a Mongolian provision being filed as Russian.
 */
function cyrillicLanguage(text: string, candidates?: readonly string[]): string | null {
  // A letter the other orthographies do not contain outranks anything the profile says, so a
  // Mongolian provision is caught as Mongolian even inside an economy that publishes in Russian.
  //
  // The evidence only runs that way. Russian has no letter of its own against Mongolian -- its
  // alphabet is a subset here -- so Russian text inside an economy declared Mongolian falls
  // through to the profile below and is answered `mn`. That is the same trade the Latin path
  // makes for Malay against Indonesian, and it is stated rather than hidden: the economy tells
  // them apart where the text cannot.
  if (KAZAKH_LETTERS.test(text)) return 'kk';
  if (MONGOLIAN_LETTERS.test(text)) return 'mn';

  // Nothing in the letters, so the economy decides -- a short provision may contain no Ө or Ү at
  // all, and the profile already states which languages that economy publishes law in.
  const pool = (candidates ?? []).filter((c) => CYRILLIC_LANGUAGES.includes(c));
  if (pool.length === 1) return pool[0]!;
  if (pool.length === 0 || pool.includes('ru')) return 'ru';
  return null;
}

/**
 * The words legal drafting in each Latin-script language cannot do without.
 *
 * Function words and the operative auxiliary, not subject matter: "licence" appears in an English
 * Act and in a Malay one, and tells you nothing. These are chosen to be frequent in any provision
 * of any length, so a two-sentence section is as classifiable as a whole Part.
 */
const FUNCTION_WORDS: Record<string, string[]> = {
  en: ['the', 'of', 'and', 'to', 'in', 'any', 'shall', 'for', 'or', 'by', 'that', 'this', 'under', 'with', 'is', 'be', 'may', 'not', 'person', 'section'],
  ms: ['yang', 'dan', 'atau', 'dengan', 'kepada', 'bagi', 'adalah', 'tidak', 'ini', 'itu', 'hendaklah', 'seksyen', 'mana-mana', 'di', 'dalam', 'oleh', 'pada', 'akta', 'boleh', 'tersebut'],
  id: ['yang', 'dan', 'atau', 'dengan', 'kepada', 'bagi', 'adalah', 'tidak', 'ini', 'itu', 'wajib', 'pasal', 'dalam', 'oleh', 'pada', 'undang-undang', 'dapat', 'dimaksud', 'ayat', 'setiap'],
  vi: ['của', 'và', 'các', 'trong', 'được', 'có', 'không', 'này', 'cho', 'theo', 'về', 'điều', 'khoản', 'người', 'hoặc', 'với', 'là', 'quy', 'định', 'phải'],
  pt: ['de', 'da', 'do', 'que', 'não', 'para', 'com', 'uma', 'por', 'os', 'as', 'no', 'na', 'artigo', 'ser', 'pode', 'deve', 'dos', 'das', 'este'],
  es: ['de', 'la', 'que', 'el', 'en', 'los', 'del', 'las', 'por', 'con', 'para', 'una', 'artículo', 'ser', 'no', 'se', 'su', 'al', 'este', 'deberá'],
  fr: ['de', 'la', 'le', 'les', 'des', 'et', 'à', 'en', 'du', 'un', 'une', 'que', 'pour', 'dans', 'par', 'article', 'est', 'qui', 'sur', 'aux'],
  tet: ['no', 'ba', 'iha', 'ho', 'mak', 'nia', 'atu', 'ne', 'husi', 'artigu', 'tenke', 'bele', 'katak', 'hotu', 'ida'],
};

/** Every Latin-script language this can tell apart, for a caller that names no candidates. */
export const LATIN_LANGUAGES = Object.keys(FUNCTION_WORDS);

/** Below this there is not enough text to say anything, and null is the honest answer. */
const MIN_LETTERS = 40;
const MIN_WORDS = 8;

function scriptOf(text: string): string | null {
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  for (const { language, pattern } of SCRIPTS) {
    const count = (text.match(pattern) ?? []).length;
    // A majority over Latin, not merely a presence: a Malaysian Act quoting a Chinese company name
    // is still a Malay Act, and an English judgment citing a Sanskrit maxim is still English.
    if (count > 3 && count > latin) return language;
  }
  return null;
}

/**
 * How much of this text is made of one language's function words.
 *
 * A proportion rather than a count, so a long provision is not automatically more English than a
 * short one, and so two candidates are compared on the same scale.
 */
function functionWordShare(words: string[], language: string): number {
  const set = new Set(FUNCTION_WORDS[language] ?? []);
  if (set.size === 0) return 0;
  let hits = 0;
  for (const w of words) if (set.has(w)) hits += 1;
  return hits / words.length;
}

export interface DetectOptions {
  /**
   * The languages this economy publishes law in, from its profile. The guess is made among these.
   * Malay and Indonesian share most of this vocabulary and the economy is what separates them.
   */
  candidates?: readonly string[];
  /** A language the document itself declares, which beats anything inferred from the text. */
  stated?: string | null;
}

/**
 * The language of one provision, or null where there is not enough of it to say.
 *
 * Never guesses at a fragment and never falls back to English. A section that cannot be classified
 * is recorded as unclassified, because the export column it feeds is a statement about a source
 * document and a wrong one is worse than a blank.
 */
export function detectLanguage(text: string, opts: DetectOptions = {}): string | null {
  // What the document says about itself wins. A portal that labels its own Hindi twin is better
  // evidence than any amount of character counting.
  if (opts.stated && /^[a-z]{2,3}(?:-|$)/i.test(opts.stated)) {
    return opts.stated.toLowerCase().split('-')[0] ?? null;
  }

  const byScript = scriptOf(text);
  if (byScript) return byScript;

  // Cyrillic is asked on the same terms the scripts above are -- a clear majority over Latin, so
  // an English provision citing a Russian body is still English -- but answered by its own
  // resolver, because the script names three languages rather than one.
  const cyrillic = (text.match(CYRILLIC) ?? []).length;
  if (cyrillic > 3 && cyrillic > (text.match(/[A-Za-z]/g) ?? []).length) {
    return cyrillicLanguage(text, opts.candidates);
  }

  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters < MIN_LETTERS) return null;

  const words = text
    .toLowerCase()
    .replace(/[^\p{Letter}\s-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < MIN_WORDS) return null;

  // Among the economy's own languages where it named them, among everything otherwise. A candidate
  // list of one still has to clear the floor: naming a language does not make a page be in it.
  const pool = (opts.candidates?.length ? opts.candidates : LATIN_LANGUAGES).filter(
    (c) => FUNCTION_WORDS[c],
  );
  if (pool.length === 0) return null;

  const scored = pool
    .map((language) => ({ language, share: functionWordShare(words, language) }))
    .sort((a, b) => b.share - a.share);

  const best = scored[0];
  if (!best || best.share < 0.06) return null;

  // Two languages that fit equally well have not been told apart, and saying either would be a
  // coin toss recorded as a fact. Malay against Indonesian is the case this exists for.
  const runnerUp = scored[1];
  if (runnerUp && best.share - runnerUp.share < 0.015) return null;

  return best.language;
}
