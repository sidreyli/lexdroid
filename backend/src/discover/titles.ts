/**
 * Whether a link on a regulator's website names an instrument.
 *
 * A national legislation database publishes nothing but legislation, so its listings need no such
 * test. A regulator's site publishes its codes of practice beside its press releases, and the
 * words overlap: "Act now, defend against vicious cybercriminals" and "remote code execution
 * vulnerability" both carry an instrument's noun and neither is an instrument.
 *
 * What separates them is position, not vocabulary. A legal title puts its noun where the drafting
 * convention puts it -- trailing, as in "Payment Services Act 2019", or opening, as in "Advisory
 * Guidelines on Data Protection". A headline uses the same word as a verb or mid-phrase, and a
 * sentence has a finite verb no title has.
 *
 * Measured against ESCAP's own citations, which are real titles written by hand: 78% accepted,
 * and the rejected remainder is mostly things that are not instruments -- financial statements,
 * a Bill, a public inquiry report, the address of a ministry's website.
 */

/**
 * The nouns an instrument is named by, most binding first. Order decides `kindOf`.
 *
 * "Policy", "strategy", "scheme", "list" and "framework" were here and were taken out: they cost
 * three ESCAP citations and admitted "monetary policy", "skills framework" and "platform list".
 */
const NOUN =
  '(?:act|ordinance|enactment|regulations?|rules?|order|by-?laws?|notice|notification|determination|' +
  'directive|circular|code of practice|code|standard|specification|technical reference|' +
  'information paper|policy document|practice direction|advisory guidelines?|guidelines?|guidebook|guide|manual)';

/** The nouns that open a name rather than close it. A notice is never "Notice on ..." in a title. */
const GUIDANCE =
  '(?:code of practice|codes of practice|technical reference|information paper|policy document|' +
  'practice direction|advisory guidelines?|guidelines?|guide|standard)';

/**
 * What a title carries after its noun and is still the same title: the year it was made, the
 * number it was gazetted under, the edition of the reprint, the abbreviation the drafter offers.
 * Stripped rather than matched, because they stack -- "Act (Act 777) 2016", "Act No.88 1972".
 */
const TAIL =
  /(?:[\s,–-]*(?:\(\s*(?:act|no)\.?\s*[A-Z]*\s*\d+[\w/]*\s*\)|no\.?\s*[A-Z]*\s*\d+[\w/]*|\(\s*[A-Z][\w/&.\- ]{1,34}\)|\d{4}(?:\s*[–-]\s*\d{4})?|compilation|consolidated|revised|reprint|edition))+$/i;

const ENDS_WITH_NOUN = new RegExp(String.raw`\b${NOUN}$`, 'i');
/** "Advisory Guidelines on ...", "Code of Practice for ...", "The Guidelines for ...". */
const NAMED_BY_NOUN = new RegExp(
  String.raw`^(?:the\s+|draft\s+|revised\s+|proposed\s+)*(?:[A-Z][\w'-]*\s+){0,3}${GUIDANCE}\s+(?:on|for|of)\b`,
  'i',
);

/** Words that name a thing published about an instrument rather than an instrument. */
const ABOUT =
  /\b(press release|media release|speech|newsroom|public consultation|consultation paper|response to|feedback on|factsheet|infographic|annual report|vacancy|tender|quotation|webinar|seminar|conference|overview of|introduction to|guide to using|how to|apply for|application form|frequently asked|now available)\b/i;

/** The other thing a regulator's site is full of: its own IT help, and notices about itself. */
const HOUSEKEEPING =
  /\b(setup guide|user guide|installation|quick start|troubleshooting|service disruption|system maintenance|service interruption|scheduled maintenance|web recruitment|travellers? guide|site map|copyright notice|privacy notice|terms of use|disclaimer)\b/i;

/** A page about an instrument opens by saying what it does to it. */
const ABOUT_OPENS =
  /^(understand(ing)?|enforcement of|amendments? to|updates? to|changes to|about|using|meet|from|annex|know|read|learn|explore|find|see|check|manage|protect|discover|get)\b/i;

/** A sentence has a finite verb, and no title has one. These are the ones a headline uses. */
const HEADLINE =
  /\b(launch(es|ed)|publish(es|ed)|update[sd]|announce[sd]?|conclude[sd]|strengthen(s|ing)|pioneer(s|ing)|driv(es|ing)|seek[s]? feedback|comes? into force|take[s]? effect|review(s|ing|ed))\b/i;

/**
 * Whether a name says the thing is published about an instrument rather than being one: a
 * consultation on it, a release announcing it, a headline reporting it.
 *
 * Asked of a document's title and of its own opening words, because a regulator files a
 * consultation paper under a page name that does not say so -- "PC 01/2020 - Review of Personal
 * Data Protection Act 2010" opens "PUBLIC CONSULTATION PAPER NO. 01/2020". Not asked of a
 * legislation database, whose titles use the same words as the name of the law: "... (Annual
 * Report) Regulations", "... (Reviewing Tribunal) Rules".
 */
export function publishedAbout(name: string): boolean {
  const t = name.replace(/\s+/g, ' ').trim();
  return ABOUT.test(t) || ABOUT_OPENS.test(t) || HEADLINE.test(t);
}

/**
 * The same question of a document's own opening words, which are prose and not a name: only the
 * phrases that say outright what the thing is -- "consultation paper", "press release". A web
 * page opens with its site's navigation, and "Explore", "Find" and "Updates" there are menu items.
 */
export function opensAsPublishedAbout(opening: string): boolean {
  return ABOUT.test(opening.replace(/\s+/g, ' ').trim());
}

export type InstrumentKind = 'act' | 'regulation' | 'notice' | 'guideline' | 'order' | 'rule';

/** One word an economy names a kind of instrument by, and the kind it names. */
export interface InstrumentWord {
  word: string;
  kind: InstrumentKind;
}

/** Most binding first, so a title carrying two words is classified by the stronger. */
const KIND_PRECEDENCE: InstrumentKind[] = ['act', 'regulation', 'rule', 'order', 'notice', 'guideline'];

/** A word written in some script other than the Latin alphabet. */
const NON_LATIN = /[^\p{ASCII}\p{Script=Latin}]/u;

/**
 * The words an economy names its own instruments by, taken from its Zone 0 profile.
 *
 * Everything above this line is English, in English word order, and that is the whole of what
 * decided whether a link named an instrument. It is why `crawl` and `sitemap` found **zero**
 * instruments on the Thai Customs Department -- a permitted, server-rendered, perfectly
 * crawlable site -- and why they would find zero on Russia's official publication venue, which
 * is permissive and enumerable and publishes nothing but law.
 *
 * The profile already answers this. `instrumentTypes[].localName` says what the economy calls
 * each kind, beside the kind it maps to, and nothing was ever asking it. So Zone 0 tells
 * discovery how to read the economy, which is the job the architecture gives it.
 *
 * Two rules keep this from admitting everything:
 *
 *   Only non-Latin terms are taken. The four English-language profiles describe their tiers
 *   rather than naming them -- "Subsidiary legislation -- Orders", "Act of the Commonwealth
 *   Parliament" -- and harvesting words from those would match any page mentioning legislation.
 *   Those profiles yield no vocabulary at all, so their behaviour is exactly what it was.
 *
 *   A word shared by two kinds is dropped, because it cannot say which. Mongolian files both a
 *   Khural resolution and a Government resolution under тогтоол, and Russian puts Российской
 *   Федерации in most of its tiers; what survives is the part that actually discriminates --
 *   Засгийн газрын against Улсын Их Хурлын, Постановление against Указ.
 */
export function instrumentWords(
  types: readonly { localName: string; kind: InstrumentKind }[] | undefined,
): InstrumentWord[] {
  const byWord = new Map<string, Set<InstrumentKind>>();
  // A loaded profile always declares these -- the schema requires at least one -- but a caller
  // assembling a profile by hand need not have, and a register walk is not the place to throw.
  for (const type of types ?? []) {
    // "ລັດຖະບັນຍັດ (Presidential Ordinance) / ຄຳສັ່ງ (Order)" -- the glosses are ours, not the
    // economy's, and a title never carries them.
    const local = type.localName.replace(/\([^()]*\)/g, ' ');
    for (const term of local.split(/[/,;]|--/)) {
      for (const word of term.split(/\s+/)) {
        const w = word.trim();
        if (w.length < 3 || !NON_LATIN.test(w)) continue;
        const kinds = byWord.get(w) ?? new Set<InstrumentKind>();
        kinds.add(type.kind);
        byWord.set(w, kinds);
      }
    }
  }

  const out: InstrumentWord[] = [];
  for (const [word, kinds] of byWord) {
    if (kinds.size !== 1) continue;
    out.push({ word, kind: [...kinds][0]! });
  }
  // Longest first, so a title matching both a phrase and a word inside it is read by the phrase.
  return out.sort((a, b) => b.word.length - a.word.length);
}

/** The kind a title names in the economy's own words, or null where it names none of them. */
function kindFromVocabulary(title: string, vocabulary: readonly InstrumentWord[]): InstrumentKind | null {
  const found = new Set<InstrumentKind>();
  for (const { word, kind } of vocabulary) if (title.includes(word)) found.add(kind);
  if (found.size === 0) return null;
  return KIND_PRECEDENCE.find((k) => found.has(k)) ?? null;
}

/** Which of the register's kinds this title names. The most binding word in it wins. */
export function kindOf(title: string): InstrumentKind {
  const t = title.toLowerCase();
  if (/\b(act|ordinance|enactment)\b/.test(t)) return 'act';
  if (/\bregulations?\b/.test(t)) return 'regulation';
  if (/\b(rules?|by-?laws?)\b/.test(t)) return 'rule';
  if (/\border\b/.test(t)) return 'order';
  if (/\b(notice|notification|determination|directive|circular)\b/.test(t)) return 'notice';
  return 'guideline';
}

/** The title with the year, gazette number and edition markers taken off the end. */
function stem(title: string): string {
  for (let t = title.trim(); ; ) {
    const next = t.replace(TAIL, '').trim();
    if (next === t || next.length < 6) return t;
    t = next;
  }
}

/**
 * The instrument this link names, or null where it names something else.
 *
 * Deliberately strict. A regulator's site is mostly not legislation, so a test that admits the
 * doubtful cases fills the register with news; an instrument missed here is still reachable when
 * a later listing names it properly.
 */
export function instrumentTitle(
  text: string,
  vocabulary: readonly InstrumentWord[] = [],
): { title: string; kind: InstrumentKind } | null {
  const title = text.replace(/\s+/g, ' ').trim();
  if (title.length < 10 || title.length > 170) return null;
  if (ABOUT.test(title) || ABOUT_OPENS.test(title) || HEADLINE.test(title)) return null;
  if (HOUSEKEEPING.test(title)) return null;
  // A title is a name, not a sentence.
  if (/[.?!]$/.test(title) || /,\s*\w+\s+\w+\s+\w+\s+\w+\s+\w+/.test(title)) return null;

  // The economy's own words first, where its profile supplied any. The filters above still ran,
  // so a bilingual portal's English press release is refused on the same terms it always was --
  // but nothing below this line can recognise a title that is not in English, and on the
  // economies that matter here that is every title.
  const local = kindFromVocabulary(title, vocabulary);
  if (local) return { title, kind: local };

  const s = stem(title);
  // Or the noun sits inside the bracket the title ends on: "... (Online Content Rules)".
  const inBracket = /\(([^()]{6,90})\)$/.exec(s)?.[1] ?? null;
  const named =
    ENDS_WITH_NOUN.test(s) ||
    (inBracket !== null && ENDS_WITH_NOUN.test(inBracket.trim())) ||
    NAMED_BY_NOUN.test(title);
  return named ? { title, kind: kindOf(title) } : null;
}
