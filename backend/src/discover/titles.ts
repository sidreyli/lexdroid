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
  /\b(setup guide|user guide|installation|quick start|troubleshooting|service disruption|system maintenance|service interruption|scheduled maintenance|web recruitment|travellers? guide|site map|copyright notice|privacy notice|privacy polic(?:y|ies)|cookie polic(?:y|ies)|terms of use|disclaimer)\b/i;

/**
 * A link that opens by telling you to follow it is pointing at an instrument, not naming one.
 *
 * "Click to view the Financial Services Act 2013", "Download Guidelines for Dispute Resolution"
 * and "here for the guide" all end in a noun the register knows, so each was admitted and filed
 * as an instrument under the sentence that pointed at it. What they name is the act of
 * following, and the thing followed already has a name of its own on the page it lands on.
 *
 * "Open" and "go" were tried and taken out: the Open Electricity Market Code of Practice is a
 * real instrument, and a word that opens a name as often as it opens an instruction is not
 * evidence of either.
 */
const POINTS_AT_IT = /^(?:click|download|view|tap|follow|here|this|these)\b/i;

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
 * An instrument that describes its own structure is still an instrument.
 *
 * "Overview of the Personal Data Protection Act 2010" is a page published about a law, and the
 * word earns its place in ABOUT for that. "The following is an overview of this Part" is drafting
 * furniture, and auDA's .au Registrar Rules open every Part with it -- so the rules of the .au
 * registry were parsed, found to say "overview of", and thrown out as something published about an
 * instrument. Australia's 12.7 was then answered from an absence of law that was sitting in the
 * cache, unread. Commonwealth Acts do the same thing under the heading "Simplified outline".
 *
 * So an overview of the document's own parts is struck out before the question is asked: either it
 * points at itself with "this" or "these", or it names a structural part rather than an instrument.
 * An overview of something that has a name of its own still answers yes.
 */
const SELF_DESCRIBING = new RegExp(
  [
    String.raw`\b(?:overview|introduction|outline|summary) of `,
    String.raw`(?:(?:this|these|the following)\b|the \b(?:part|division|subdivision|chapter|schedule|clause|paragraph)\b)`,
  ].join(''),
  'gi',
);

/**
 * The same question of a document's own opening words, which are prose and not a name: only the
 * phrases that say outright what the thing is -- "consultation paper", "press release". A web
 * page opens with its site's navigation, and "Explore", "Find" and "Updates" there are menu items.
 */
export function opensAsPublishedAbout(opening: string): boolean {
  return ABOUT.test(opening.replace(/\s+/g, ' ').replace(SELF_DESCRIBING, ' ').trim());
}

export type InstrumentKind =
  | 'act'
  | 'regulation'
  | 'notice'
  | 'guideline'
  | 'order'
  | 'rule'
  /**
   * A document a body published *about* the law: a consultation paper, a media release, an FAQ,
   * a landing page for an Act held elsewhere. Registered, because it is a real document and good
   * evidence of how a regulator reads an obligation, but not as an instrument of the law. See
   * `registeredKind` for the test, and the profiles for what each economy lets one of these do.
   */
  | 'publication';

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

/**
 * The kind a listing's entry will support, which is not always the kind its title claims.
 *
 * `kindOf` reads a title, and a title that *mentions* an Act reads exactly like one that *is* an
 * Act: "Compulsory Licensing: Clarify The Scope Of 'Reasonable Requirements Of The Public' Test In
 * The Patents Act" carries the noun and is a consultation paper. Position cannot separate those --
 * the paper's noun trails, where the drafting convention puts it -- so the title alone cannot
 * decide, and 73 regulator publications across three economies were registered as Acts.
 *
 * What separates them is what the listing says beside the title. A statute book states an
 * identifier or a standing for everything it publishes; a regulator's news page states neither,
 * because the page is not a register and its subject is not in force or repealed, it is an
 * article. So: a document is registered as primary legislation only where its source states an
 * identifier or a standing for it.
 *
 * Scoped to that claim and no wider, because only primary legislation is corroborated this way.
 * A regulator's genuine guidance carries no gazette number and is not "in force" as a statute is,
 * so the same test applied to every kind retires the real ones: Australia's .au Domain
 * Administration Rules at 84 sections, which ESCAP cites, and Malaysia's PDPA Codes of Practice
 * at 737. It is also where the damage was. The shortlist holds half of every governing list for
 * Acts, to stop 23,693 regulations burying 1,264 statutes, and a paper admitted to that reserve
 * spends the reading window a statute needed.
 *
 * Deliberately a disjunction, and Singapore is why. 87 of its statutes carry no official number --
 * Statutes Online names them by title alone -- and every one of them carries a standing. Demanding
 * both would retire the Banking Act 1970.
 *
 * This costs no coverage. Where a regulator's page about an Act is demoted, the Act itself is
 * already in the register from the statute book, at full length: the Cybersecurity Act 2018 at 146
 * sections beside a 4-section agency page, the Payment Services Act 2019 at 139 beside a
 * 1-section one. The demoted copy is not a second copy of the law; it is a page about it.
 */
export function registeredKind(
  claimed: InstrumentKind,
  entry: { officialNumber?: string | null; status?: string | null; kindBasis?: string | null },
): InstrumentKind {
  if (claimed !== 'act') return claimed;
  const numbered = (entry.officialNumber ?? '').trim() !== '';
  const stood = (entry.status ?? '').trim() !== '' && entry.status !== 'unknown';
  // A register whose own column says "Law" has said what the listing is, which a news page never
  // does. The Lao Official Gazette states a type for every row and neither a number nor a standing,
  // so without this every Lao law -- the Cybersecurity Law among them -- registered as a publication.
  const typed = (entry.kindBasis ?? '').trim() !== '';
  return numbered || stood || typed ? claimed : 'publication';
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
 * The nouns one particular source says it names its instruments with.
 *
 * `NOUN` is the list every source shares, and it deliberately leaves "policy" out: a site's
 * privacy policy, a central bank's monetary policy and a ministry's skills framework all carry
 * the word, and admitting it cost three real citations to gain those three. But a domain
 * registry's binding rules *are* called policies -- the .my registry publishes a Registrant
 * Policy and a Registrar Policy, the .sg one an Acceptable Use Policy and Rules of Registration
 * -- and a treasury's are called Instructions. No word tells those from the privacy page beside
 * them, because in the word there is no difference.
 *
 * What tells them apart is what the source says, which is the same thing that tells a statute
 * from a page about a statute. A profile that names a source is entitled to say what that source
 * calls the instruments it publishes, and the claim is checkable by opening the site. So the
 * extra nouns are declared per portal and reach no further: the registry's "policy" does not make
 * the telecommunications regulator's privacy policy an instrument.
 *
 * Matched in the two positions a title puts a noun in, the same two the shared list is matched
 * in. The housekeeping filter still runs first, so a source that declares "policy" does not
 * thereby register its own cookie policy.
 */
function namedByDeclared(title: string, stemmed: string, alsoNamedBy: readonly string[]): boolean {
  for (const raw of alsoNamedBy) {
    const noun = String(raw).trim();
    // A declared noun is a word, not a pattern: anything else is a profile typo, and a profile
    // typo must not become a regular expression the whole register is filtered by.
    if (!/^[\w' -]{3,40}$/.test(noun)) continue;
    if (new RegExp(String.raw`\b${noun}s?$`, 'i').test(stemmed)) return true;
    if (new RegExp(String.raw`^(?:the\s+)?(?:[\w.'-]+\s+){0,3}${noun}s?\s+(?:on|for|of)\b`, 'i').test(title)) {
      return true;
    }
  }
  return false;
}

/**
 * The instrument this link names, or null where it names something else.
 *
 * Deliberately strict. A regulator's site is mostly not legislation, so a test that admits the
 * doubtful cases fills the register with news; an instrument missed here is still reachable when
 * a later listing names it properly.
 *
 * Two things can widen what counts, and they widen it in different directions. `alsoNamedBy` is
 * the extra English nouns a portal declares it calls its own instruments by -- a registry whose
 * rules are a "policy"; see `namedByDeclared`. `vocabulary` is what the *economy* calls its
 * instruments, taken from its Zone 0 profile, and it is the only thing here that can recognise a
 * title not written in English; see `instrumentWords`.
 */
export function instrumentTitle(
  text: string,
  alsoNamedBy: readonly string[] = [],
  vocabulary: readonly InstrumentWord[] = [],
): { title: string; kind: InstrumentKind } | null {
  const title = text.replace(/\s+/g, ' ').trim();
  if (title.length < 10 || title.length > 170) return null;
  if (ABOUT.test(title) || ABOUT_OPENS.test(title) || HEADLINE.test(title)) return null;
  if (POINTS_AT_IT.test(title)) return null;
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
    NAMED_BY_NOUN.test(title) ||
    namedByDeclared(title, s, alsoNamedBy);
  return named ? { title, kind: kindOf(title) } : null;
}

/**
 * Whether a title says the document decides a case rather than states a rule.
 *
 * An agency that adjudicates publishes its adjudications, and a statute book that carries the
 * gazette carries them too: "Notice of Affirmative Final Determination of an Anti-Dumping Duty
 * Investigation with regard to Imports of ..." is filed beside the Act it is made under, is
 * numbered like it, and reads to a search engine exactly like it -- it uses the Act's own
 * vocabulary, because it is applying the Act. Its sections are tariff codes and the margins found
 * against named exporters. Nothing in it states what the law requires of anybody in general, and
 * a cell that reads it has spent a seat learning what one importer owes.
 *
 * Three things have to hold together, because each alone is ordinary in a real title. The
 * document has to announce a step someone takes in a proceeding; it has to name the proceeding;
 * and it has to name the particular thing the proceeding is about. A rule that made a measure
 * generally -- "Safeguards (Safeguard Measure) ... Regulations", "Countervailing and Anti-Dumping
 * Duties (Expedited Review) Determination" -- states the law for everyone and names no case, so
 * it fails the third and is kept.
 *
 * Written as a category rather than a subject list on purpose: no word here is about dumping,
 * customs or trade. Any tribunal that publishes its own decisions writes titles this shape, and
 * an economy whose agencies publish none is untouched -- measured across three registers, it
 * matches 177 documents in one and none in the other two.
 */
const PROCEEDING_STEP =
  /\b(?:notice|notis|notification)\b[^.]{0,90}?\b(?:initiation|commencement|termination|discontinuance|determination|findings?|extension of (?:the )?time)\b/i;
const THE_PROCEEDING =
  /\b(?:investigation|inquiry|enquiry|review of|proceedings?|petition|complaint)\b/i;
const THE_PARTICULARS =
  /\b(?:with regard to|in respect of|in the matter of|imports? of|exported (?:from|by))\b/i;

export function determinesAParticularCase(title: string): boolean {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  return PROCEEDING_STEP.test(t) && THE_PROCEEDING.test(t) && THE_PARTICULARS.test(t);
}
