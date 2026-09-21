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
  entry: { officialNumber?: string | null; status?: string | null },
): InstrumentKind {
  if (claimed !== 'act') return claimed;
  const numbered = (entry.officialNumber ?? '').trim() !== '';
  const stood = (entry.status ?? '').trim() !== '' && entry.status !== 'unknown';
  return numbered || stood ? claimed : 'publication';
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
export function instrumentTitle(text: string): { title: string; kind: InstrumentKind } | null {
  const title = text.replace(/\s+/g, ' ').trim();
  if (title.length < 10 || title.length > 170) return null;
  if (ABOUT.test(title) || ABOUT_OPENS.test(title) || HEADLINE.test(title)) return null;
  if (HOUSEKEEPING.test(title)) return null;
  // A title is a name, not a sentence.
  if (/[.?!]$/.test(title) || /,\s*\w+\s+\w+\s+\w+\s+\w+\s+\w+/.test(title)) return null;
  const s = stem(title);
  // Or the noun sits inside the bracket the title ends on: "... (Online Content Rules)".
  const inBracket = /\(([^()]{6,90})\)$/.exec(s)?.[1] ?? null;
  const named =
    ENDS_WITH_NOUN.test(s) ||
    (inBracket !== null && ENDS_WITH_NOUN.test(inBracket.trim())) ||
    NAMED_BY_NOUN.test(title);
  return named ? { title, kind: kindOf(title) } : null;
}
