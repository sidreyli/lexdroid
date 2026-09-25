/**
 * Whether a document is the instrument it was filed under.
 *
 * Malaysia's portal links its Witness Protection Act row to the Judicial Appointments Commission
 * Act's PDF. Nothing downstream can detect that: the text parses, the offsets hold, the quote is
 * really there -- and every citation names the wrong law. An Act states its own name, so the
 * contradiction is in the corpus already and only has to be read.
 */
import type { ParsedSection } from './types.js';

/** The two drafting formulas: "may be cited as the X" and the modern "This Act is the X". */
// Parentheses and line breaks belong to the name, not after it: whole families of Malaysian and
// Singaporean instruments are told apart only by what is inside the brackets, which a PDF wraps.
const STATES_NAME = [
  /(?:may be|is)\s+cited\s+as\s+the\s+([A-Z][^.,;]{4,160})/,
  /This\s+(?:Act|Ordinance|Enactment|Regulations?|Rules|Order)\s+is\s+the\s+([A-Z][^.,;]{4,160})/,
];

/**
 * The same sentence in the other voices a legislative instrument writes it in.
 *
 * The strict forms above name six kinds of instrument and require the definite article. A
 * determination, a standard or a set of principles is none of the six, and the drafting manuals
 * let the subject be a bare "This" or a plural: "This is the ...", "This instrument is the ...",
 * "These are the ...", "This Determination is ...". Measured over the three registers, the strict
 * forms recover a name for none of the 663 instruments filed under a title naming no instrument at
 * all -- every one of them says what it is, in a voice the patterns did not cover.
 *
 * A looser pattern can take the first capitalised words of any sentence, so a name found this way
 * is used only where it names an instrument itself. That is the whole point of the replacement: a
 * title that says nothing is exchanged for one that says what the document is, and a candidate
 * that says nothing either is no improvement.
 */
const STATES_NAME_LOOSE = [/\bTh(?:is|ese)\s+(?:[A-Za-z]+\s+){0,2}?(?:is|are)\s+(?:the\s+)?([A-Z][^.,;]{4,160})/];

/** The first name a passage gives itself: the strict forms, then the guarded looser ones. */
function nameIn(text: string): string | null {
  for (const re of STATES_NAME) {
    const m = re.exec(text);
    if (m) return m[1]!;
  }
  for (const re of STATES_NAME_LOOSE) {
    const m = re.exec(text);
    if (m && namesAnInstrument(m[1]!)) return m[1]!;
  }
  return null;
}

/** Words too common to distinguish one instrument from another. */
const COMMON = new Set([
  'act', 'the', 'and', 'for', 'of', 'to', 'ordinance', 'enactment', 'regulations', 'regulation',
  'rules', 'order', 'reprint', 'revised', 'repealed', 'malaysia', 'singapore', 'australia',
  'akta', 'peraturan', 'perintah', 'kaedah', 'enakmen', 'ordinan',
]);

/** A plural and its singular are the same word. "Persons" against "Person's" is not two Acts. */
// And so are "Privatisation" and "Privatization": both spellings are used in the same statute book.
function stem(w: string): string {
  const s = w.replace(/iz/g, 'is');
  return s.length > 3 && s.endsWith('s') && !s.endsWith('ss') ? s.slice(0, -1) : s;
}

/** A name reduced to the words that identify it, in order. */
function keyWords(s: string): string[] {
  const seen = new Set<string>();
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !COMMON.has(w) && !/^\d+$/.test(w))
    .map(stem)
    .filter((w) => (seen.has(w) ? false : (seen.add(w), true)));
}

/**
 * Whether a filed title names an instrument at all.
 *
 * A catalogue row whose title is a web page's theme name -- Malaysia's data protection portal
 * filed one as "Wordpress Revolutionize" -- is not a legal title, so it has nothing to contradict
 * the document with. The document's own words are the better evidence and it takes their name.
 */
// The kinds of instrument a register files, in both official languages of the economies read.
// "Notification", "Direction" and "By-laws" were missing, which left 179 real titles -- every
// Singaporean notification among them -- looking as though they named nothing.
// "Determination" and "Declaration" were missing too, and they are how a delegated instrument is
// most often named where the power is to decide a thing rather than to make a rule about it.
// "Instrument" is deliberately not here: it is the word a drafting template uses for the blank it
// has not filled in, so admitting it would make the emptiest titles look like the fullest.
const NAMES_AN_INSTRUMENT =
  /\b(acts?|ordinance|enactment|regulations?|rules?|orders?|schemes?|notice|notifications?|directions?|directives?|determinations?|declarations?|by-?laws?|guidelines?|guides?|guidance|standards?|circulars?|codes?|bill|constitution|charter|decree|akta|peraturan|perintah|kaedah|undang|garis panduan|pekeliling|pemberitahuan|arahan|notis|piawaian|tata ?amalan|kod)\b/i;

export function namesAnInstrument(title: string): boolean {
  return NAMES_AN_INSTRUMENT.test(title);
}

/** The name a document gives itself, from its opening provisions. Null if it never says. */
export function statedName(sections: Pick<ParsedSection, 'text'>[], within = 14): string | null {
  for (const s of sections.slice(0, within)) {
    const m = nameIn(s.text);
    // The older drafting runs the commencement into the same sentence. That is not the name.
    if (m) return m.replace(/\s+and\s+(?:shall|comes?|is deemed|shall be deemed)\b[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
  }
  return null;
}

/** The Malay drafting formula: "Akta ini bolehlah dinamakan Akta X". */
const STATES_NAME_MS = /boleh(?:lah)?\s+(?:dinamakan|disebut)\s+(?:sebagai\s+)?([A-Z][^.,;]{4,160})/;
/** The words a Malay title names its kind of instrument with. */
const MALAY_KIND = /\b(?:akta|peraturan|perintah|kaedah|enakmen|ordinan)\b/i;

/** A filed title is in Malay if it names its kind of instrument in Malay, and in English otherwise. */
function titleLanguage(title: string): 'ms' | 'en' {
  return MALAY_KIND.test(title) ? 'ms' : 'en';
}

/** Every name a document gives itself in its opening provisions, in each language it gives one. */
export function statedNames(
  sections: Pick<ParsedSection, 'text'>[],
  within = 14,
): { name: string; language: 'ms' | 'en' }[] {
  const out: { name: string; language: 'ms' | 'en' }[] = [];
  const clean = (m: string) =>
    m.replace(/\s+(?:and|dan)\s+(?:shall|comes?|is deemed|shall be deemed|hendaklah|mula)\b[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
  for (const s of sections.slice(0, within)) {
    const m = nameIn(s.text);
    if (m) out.push({ name: clean(m), language: 'en' });
    const ms = STATES_NAME_MS.exec(s.text);
    if (ms) out.push({ name: clean(ms[1]!), language: 'ms' });
  }
  return out;
}

/**
 * A page's own title, with the publisher's name taken off the end of it.
 *
 * A web page is titled for the site it sits on: "Cybersecurity Act | Cyber Security Agency of
 * Singapore", "Guidelines on Use of Telecommunication Riser Ducts | IMDA", "Strategic Goods
 * (Control) Act | Singapore Customs". Registered whole, that is a citation naming a website, and
 * 197 entries in the register carry one -- 89 of them holding text, one of them an Act at 1,822
 * sections. A reviewer following the row is shown the agency where the provision should be.
 *
 * The bar is the same one every title is held to: the part kept has to name an instrument by
 * itself. Where none of them does, the whole thing names no instrument and nothing is recovered
 * -- "Privacy policy | ACMA" is a page about a site and stays that way.
 *
 * Only the pipe, which is the separator a site template uses and a drafter does not. A dash
 * appears inside real titles -- "Communications and Multimedia Act 1998 - Reprint 2006" -- so
 * splitting on it would cut a name in half to fix a name that was never broken.
 *
 * The front only, which is where a template puts the page and a template that leads with the site
 * is left alone. Taking the back as well was measured and withdrawn: a bilingual site names
 * itself on both sides of the pipe -- "Malaysian Communications And Multimedia Commission (MCMC)
 * | Suruhanjaya Komunikasi dan Multimedia Malaysia (SKMM) - Guidelines" -- so the tail names an
 * instrument too and recovering it exchanges one site's name for the same site's other name.
 * A title whose instrument is only in the tail is left as it is: the register says the wrong
 * thing either way, and it says it visibly rather than plausibly.
 */
export function nameBeforeThePublisher(title: string): string | null {
  if (!title.includes('|')) return null;
  const parts = title.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  // The longest leading run that still names an instrument, so a title whose own name carries a
  // pipe is rejoined rather than cut at the first one.
  for (let take = parts.length - 1; take >= 1; take--) {
    const head = parts.slice(0, take).join(' | ');
    if (namesAnInstrument(head)) return head;
  }
  return null;
}

/**
 * The name a document is to be registered under when the register's own title names nothing.
 *
 * Its citation clause first, in either language, because that is the instrument naming itself in
 * law. The parser's guess at a title only after that, and only where the guess names an instrument:
 * a PDF's guess is its running header, which is how a data protection standard came to be called
 * "No. Descriptions" -- the header of a table -- and an online safety regulation "provider or
 * licensed content applications service". A web page's guess is its site template, so the
 * publisher's name comes off it first; see `nameBeforeThePublisher`.
 */
export function ownName(sections: Pick<ParsedSection, 'text'>[], parserTitle: string | null): string | null {
  const names = statedNames(sections);
  const stated = names.find((n) => n.language === 'en') ?? names[0];
  if (stated) return stated.name;
  if (!parserTitle || readsAsAClause(parserTitle)) return null;
  const withoutPublisher = nameBeforeThePublisher(parserTitle);
  if (withoutPublisher) return withoutPublisher;
  return parserTitle.includes('|') ? null : namesAnInstrument(parserTitle) ? parserTitle : null;
}

/**
 * A name is a noun phrase, and this is a piece of a sentence.
 *
 * `namesAnInstrument` asks whether a string mentions a kind of instrument, which a sentence
 * mentioning one does. A registry's policy lists its domain categories -- "for institutions
 * established pursuant to the Universities and University Colleges Act 1971;" -- and the line
 * repeats down the table often enough to be taken for the running header, so the document's own
 * name became a clause about somebody else's Act. What is wrong with it is not the Act it names
 * but that it is not a name: it opens where a sentence was already running and closes on a
 * semicolon, and no drafter titles anything that way.
 *
 * Two marks of a clause, each sufficient and neither about any subject matter: it begins on a
 * word that can only continue a sentence, or it ends on the punctuation that continues one.
 * "The" and "A" are not among the openers, because a title may begin with either, and the
 * opener has to be followed by a space rather than by any break between words: "By-laws" is
 * one word and a whole title, and "by " opens a sentence.
 *
 * A third mark was tried and withdrawn. A verb of obligation looks like the surest sign of a
 * sentence, and across the three registers it caught no clause and seven real titles:
 * "Therapeutic Goods (Medical Devices--Information that Must Accompany Application for
 * Inclusion)" says "must" inside a relative clause, which is a noun phrase and an ordinary name.
 * The Malay openers went the same way and for the same reason: none of them caught anything,
 * and "yang" opens an Act that has been called that since 1957.
 */
const CONTINUES_A_SENTENCE =
  /^(?:pursuant|under|subject|notwithstanding|including|whereas|provided|except|save|which|whose|where|when|while|and|or|but|of|in|on|at|by|for|to|from|with|within|into|upon)\s/i;

export function readsAsAClause(title: string): boolean {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return false;
  return /[;,]$/.test(t) || CONTINUES_A_SENTENCE.test(t);
}

/**
 * A word made of the initials of the other name's words stands for those words.
 *
 * A catalogue abbreviates: Malaysia's filed the Personal Data Protection (Amendment) Act 2024 as
 * "Akta Pdppindaan 2024" -- the initials of Perlindungan Data Peribadi run into "pindaan" -- and it
 * shares no whole word with the name the Act gives itself. Three initials at least, so a word that
 * merely opens with two letters another name's words begin with is not read as an abbreviation.
 */
function spellOut(words: string[], other: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    let expanded: string[] | null = null;
    for (let i = 0; i < other.length && !expanded; i++) {
      for (let k = other.length - i; k >= 3; k--) {
        const initials = other.slice(i, i + k).map((x) => x[0]).join('');
        if (w.startsWith(initials) && !other.includes(w)) {
          const rest = w.slice(initials.length);
          expanded = [...other.slice(i, i + k), ...(rest.length > 2 ? [stem(rest)] : [])];
          break;
        }
      }
    }
    out.push(...(expanded ?? [w]));
  }
  return out;
}

/**
 * The year a name cites its instrument by, or null where it gives none.
 *
 * English drafting puts the year straight after the kind -- "Copyright Act 1968" -- and Malay puts
 * it after the subject -- "Akta Hak Cipta 1987" -- so the rule is the first year at or after the
 * word that names the kind, in either order. That is also what excludes a revised edition's own
 * date, "Copyright Act 1987 (Revised 2006)", which comes later in the name and is not the year the
 * Act is cited by.
 *
 * A number no statute book could be dated by is not a year. A Malaysian Order whose name the parser
 * recovered as "... Order/2063" would otherwise have contradicted its own register entry, and the
 * document it refused is a real instrument -- the defect there is in the parse, not in the filing.
 */
function enactmentYear(name: string): string | null {
  const kind = /\b(?:act|akta|enactment|enakmen|ordinance|ordinan)\b/i.exec(name);
  if (!kind) return null;
  const year = /\b(1[6-9]\d{2}|20\d{2})\b/.exec(name.slice(kind.index))?.[1];
  if (!year) return null;
  return Number(year) <= new Date().getUTCFullYear() + 1 ? year : null;
}

/**
 * Whether two names are the same instrument.
 *
 * Compared head-first in both directions because each side truncates differently: a catalogue
 * title is cut short, and a citation provision runs on into its commencement words. Either name
 * opening with the other's first identifying words is the same instrument.
 */
export function namesMatch(stated: string, title: string): boolean {
  // The year an instrument is named for is part of its name, and keyWords drops every number, so
  // the Copyright Act 1968 and a Copyright Act 1998 compared equal. Where both names state the year
  // after their kind -- "Act 1968", "Akta 1987" -- different years are different instruments. A
  // name that states no year, or a revised edition's later date elsewhere in the name, is no
  // contradiction.
  const ya = enactmentYear(stated);
  const yb = enactmentYear(title);
  if (ya && yb && ya !== yb) return false;
  const a0 = keyWords(stated);
  const b0 = keyWords(title);
  const a = spellOut(a0, b0);
  const b = spellOut(b0, a0);
  if (a.length === 0 || b.length === 0) return true;
  // "Incorporated" and "Incorporation" are one word drafted twice, so a long shared opening is
  // the same word. Eight characters, not six: six joins "arbitration" to "arbitral".
  const same = (x: string, y: string) =>
    x === y || (x.length >= 8 && y.length >= 8 && (x.startsWith(y.slice(0, 8)) || y.startsWith(x.slice(0, 8))));
  const opens = (head: string[], rest: string[]) =>
    head.slice(0, 3).every((w) => rest.some((r) => same(w, r)));
  return opens(a, b) || opens(b, a);
}

/**
 * Whether a name positively identifies the same instrument as the title.
 *
 * `namesMatch` answers a different question -- whether two names contradict each other -- and a
 * name carrying no identifying words cannot contradict anything, so it comes back true. Asked
 * instead which of a page's links is the instrument, that answer is wrong in the worst direction:
 * a link reading "P.U.(A) 123/2025" reduces to nothing, matches every title put to it, and makes
 * a page look as though it names its instrument three times over. A name that identifies nothing
 * identifies nothing.
 */
export function namesTheSame(stated: string, title: string): boolean {
  return keyWords(stated).length > 0 && keyWords(title).length > 0 && namesMatch(stated, title);
}

/**
 * The contradiction, in words, or null where there is none to state.
 *
 * A title the register only guessed at cannot contradict anything, so it is not asked to: the
 * check compares two instrument names, and a placeholder is not one.
 */
export function identityMismatch(
  sections: Pick<ParsedSection, 'text'>[],
  title: string,
  opts: { titleProvisional?: boolean } = {},
): { stated: string; detail: string } | null {
  if (opts.titleProvisional || !namesAnInstrument(title)) return null;
  // A name can only contradict a title in its own language. A bilingual instrument filed under its
  // Malay title and naming itself only in English shares no word with that title and is still the
  // same instrument: three data protection instruments were refused as "another instrument" so.
  const language = titleLanguage(title);
  const names = statedNames(sections).filter((n) => n.language === language);
  if (names.length === 0 || names.some((n) => namesMatch(n.name, title))) return null;
  const stated = names[0]!.name;
  return {
    stated,
    detail: `Filed as "${title}", but the document calls itself "${stated}". It is a different instrument, so nothing in it may be cited under this title.`,
  };
}

/**
 * Whether a provision only instructs an amendment to another Act.
 *
 * "The principal Act is amended by inserting before section 36" was cited as Malaysia's data
 * retention rule. The inserted words are law, but they are law of the Stamp Act; the vehicle that
 * carries them imposes nothing itself, and ESCAP marks an amending act cited in place of its
 * principal at zero.
 */
const AMENDMENT_INSTRUCTION =
  /\b(?:principal|the)\s+Act\s+is\s+amended\b|\bis\s+amended\s+by\s+(?:inserting|substituting|deleting|omitting)\b|\bAmendment\s+of\s+section\b/i;

export function amendsAnotherAct(text: string): boolean {
  return AMENDMENT_INSTRUCTION.test(text.slice(0, 400));
}

/**
 * Whether the words a finding is built on are the words of a definition.
 *
 * A definition says what a term means. It does not require anybody to do anything -- the duty
 * lives in the operative section that uses the term, and a definition that names one is a pointer
 * to it. Singapore's content-licensing cell was answered out of the Broadcasting Act's
 * interpretation section, quoting "a licence granted under section 8 or 9": section 8 is where the
 * requirement is, and the words cited are the dictionary entry that points at it. Australia's
 * cybersecurity cell cited "any cybersecurity officer appointed under section 4(3)" the same way.
 *
 * This is the citation defect ESCAP marks directly -- "section 125 did not mention the minimum 7
 * years period" -- arrived at from the other end: the section cited is real and the words are
 * really in it, but they are not the words that impose anything.
 *
 * The test is on drafting form rather than on heading words, because a definition is a definition
 * wherever it sits: most live under "Interpretation", but operative sections carry them too, in a
 * closing subsection that begins "In this section". So the question asked is not whether the
 * provision is a definitions clause, but whether these particular words fall inside a definition
 * entry in it.
 */
const DEFINITION_ENTRY = /["“]([^"”]{1,90})["”]\s{0,4}(?:means|includes|has the (?:same )?meaning)/gi;

/** Where one definition entry stops: the drafting break between them, or a blank line. */
const ENTRY_END = /[;.]\s*\n|\n\s*\n/;

export function citesADefinition(text: string, words: string | null): boolean {
  const quote = words?.trim();
  if (!quote || quote.length < 3) return false;
  const at = text.indexOf(quote);
  if (at < 0) return false;

  const entries = [...text.matchAll(DEFINITION_ENTRY)];
  const opener = entries.filter((m) => m.index !== undefined && m.index <= at).pop();
  if (!opener || opener.index === undefined) return false;

  // The entry runs until the next one opens, or until the drafting break, whichever comes first.
  const next = entries.find((m) => m.index !== undefined && m.index > at);
  let stop = next?.index ?? text.length;
  const brk = ENTRY_END.exec(text.slice(opener.index + opener[0].length));
  if (brk) stop = Math.min(stop, opener.index + opener[0].length + brk.index);
  return at < stop;
}

/**
 * Does the quoted paragraph take its force from a stem that only confers a power?
 *
 * A lettered paragraph is not a sentence. It borrows its verb from the words before the colon, and
 * quoted on its own it reads as though it had one of its own. Australia's 6.1 was decided by
 * "prohibit the entity from storing or accessing, or providing access to, scheme data outside
 * Australia" -- paragraph (e) of a list whose stem reads "Examples of conditions that **may** be
 * prescribed or imposed are conditions to do any of the following:". Nothing is prohibited. The
 * Digital ID Act answered the same cell with "prohibit ... the holding, storing, handling or
 * transferring of such information outside Australia", under the stem "the Digital ID Rules may:".
 *
 * The reader cannot see this, because the reader is given the paragraph. Both came back with the
 * verb "prohibit", force "forbids" and mandatory true, which is a fair reading of the words it was
 * shown. So the question is asked here, where the whole section is in hand, and it is asked of
 * drafting form rather than of meaning: walk back from the quote to the colon that opens the list,
 * take the stem, and read its last modal. "must" and "shall" impose, and their lists are the
 * conditions of an obligation -- "the provider must not activate the service unless the provider
 * has: (a) obtained information; and (b) verified the identity" is a duty in both its limbs. "may"
 * confers, and its list is a menu of what some other instrument might one day say.
 *
 * A power to prohibit is a real and reportable fact about an economy. It is not a prohibition, and
 * the bands of pillar 6 count measures in force.
 */
const LIST_MODAL = /\b(must not|shall not|may not|must|shall|may)\b/gi;
/** Where the stem begins: the end of whatever sentence came before it. */
const SENTENCE_END = /[.;]\s+(?=[A-Z(])|\n\s*\n/g;

export function inheritsAPower(text: string, quote: string | null): boolean {
  const words = quote?.trim();
  if (!words || words.length < 3) return false;
  const at = text.indexOf(words);
  if (at < 0) return false;

  // The colon that opens the list this paragraph sits in. Only the text before the quote counts,
  // and only the nearest one: a section may open several lists.
  const before = text.slice(0, at);
  const colon = before.lastIndexOf(':');
  if (colon < 0) return false;

  // A stem governs the paragraphs under it, not the rest of the instrument. If a sentence has ended
  // between the colon and the quote, the quote is not in that list.
  if (/[.]\s+[A-Z]/.test(text.slice(colon + 1, at))) return false;

  const starts = [...before.slice(0, colon).matchAll(SENTENCE_END)];
  const stem = before.slice(starts.length ? (starts.at(-1)!.index ?? 0) + starts.at(-1)![0].length : 0, colon);

  const modals = [...stem.matchAll(LIST_MODAL)].map((m) => m[1]!.toLowerCase());
  const last = modals.at(-1);
  return last === 'may';
}


/**
 * The kind the document says it is, where its source says nothing.
 *
 * `registeredKind` settles what a *listing* will support: primary legislation only where the
 * listing states an identifier or a standing, because a regulator's news page states neither and
 * 73 of its articles were being registered as Acts. That test is right about listings and silent
 * about documents, and a regulator that publishes the statute itself falls in the gap. Malaysia's
 * data-protection regulator serves the amending Act as a file in its media library; a media library
 * states nothing about anything, so the Act of Parliament that inserted the economy's breach
 * notification and data-protection-officer duties was registered as advisory guidance, and every
 * cell it answers ruled it out for being advisory.
 *
 * The corroboration `registeredKind` asks for is there, in the document rather than beside it: a
 * gazette print opens with the long title saying what it is, and its section 1 names it. So where
 * the source states nothing, the kind is the one the document's own opening provision states.
 *
 * Both readings are anchored, because unanchored they are the same trap `registeredKind` was built
 * for, arrived at from the other side. Singapore Customs' page for the Chemical Weapons
 * (Prohibition) Act is one sentence long and says the Act "is an Act to provide for" -- which no
 * pattern can tell from a long title except by where it sits, so the long title is only read where
 * the document begins with it. And a page listing an economy's financial legislation prints four
 * Acts' citation provisions in turn, so a head naming more than one instrument is a page about
 * instruments and keeps the kind the listing filed it under.
 */
const OPENS_AS = /^An\s+(Act|Ordinance|Enactment)\s+to\s+\w/i;
const CITES_ITSELF =
  /\bThis\s+(Act|Ordinance|Enactment|Regulations?|Rules?|Order)\s+(?:may\s+be\s+cited\s+as|is)\s+(?:the\s+)?([A-Z][^.,;]{4,160})|\bmay\s+be\s+cited\s+as\s+the\s+([A-Z][^.,;]{4,160})/gi;

const KIND_OF_WORD: Record<string, string> = {
  act: 'act', ordinance: 'act', enactment: 'act',
  regulation: 'regulation', rule: 'rule', order: 'order',
};

/** The kind word in a name, for the citation voice that gives the name but not the kind. */
function kindInName(name: string): string | null {
  const m = /\b(Acts?|Ordinance|Enactment|Regulations?|Rules?|Order)\b/i.exec(name);
  if (!m) return null;
  return KIND_OF_WORD[m[1]!.toLowerCase().replace(/s$/, '')] ?? null;
}

export function statedKind(
  sections: Pick<ParsedSection, 'text'>[],
  title: string,
  within = 6,
): string | null {
  const head = sections.slice(0, within).map((s) => s.text.slice(0, 600));
  if (!head.length) return null;

  // Every distinct instrument the head names, so a page that names several names none.
  const named = new Map<string, string>();
  for (const text of head) {
    for (const m of text.matchAll(CITES_ITSELF)) {
      const name = (m[2] ?? m[3] ?? '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const kind = m[1] ? KIND_OF_WORD[m[1].toLowerCase().replace(/s$/, '')] ?? null : kindInName(name);
      if (kind) named.set(name.toLowerCase(), kind);
    }
  }
  if (named.size > 1) return null;
  // A name read out of the head has to be a name for this document. The looser citation voice
  // also fits ordinary prose -- a regulator's portal manual says "the primary purpose of this Act
  // is to protect the personal data of individuals", which reads as a citation provision naming an
  // instrument called "to protect the personal data of individuals" -- and a name the register does
  // not know this document by is the surest sign the sentence was about something else.
  if (named.size === 1) {
    const [name, kind] = [...named.entries()][0]!;
    return namesMatch(name, title) ? kind : null;
  }

  // No citation provision read. A gazette print still opens with its long title, and only there.
  const opening = OPENS_AS.exec(head[0]!.replace(/\s+/g, ' ').trim());
  return opening ? KIND_OF_WORD[opening[1]!.toLowerCase()] ?? null : null;
}

/**
 * Whether a document registered as guidance says, in its own opening, that it binds.
 *
 * A regulator publishes its binding instruments beside its guidance, under one word. Bank Negara
 * calls both "policy documents", and a register that files them all as guidance rules every one of
 * them out of every cell as advisory -- though each says which of its paragraphs bind: '"S" denotes
 * a standard, an obligation, a requirement ... which must be complied with. Non-compliance may
 * result in enforcement action.' The Commission's prepaid registration guidelines say it another
 * way: "condition 10.2 requires that licensee shall comply with any guidelines issued by the
 * Commission". Either binds the persons the document is addressed to, which is what the register's
 * notice tier means.
 *
 * Naming the power a document is issued under is not the test: "The guidance in this policy
 * document is issued pursuant to section 266" and "These Guidelines are issued pursuant to section
 * 321 of the SFA" name the power to give guidance, and say of it exactly that it is guidance. And a
 * document that says it does not bind is taken at its word, whatever else it says.
 */
const BINDS = [
  /\bdenotes\s+a\s+standard,\s+an\s+obligation,\s+a\s+requirement\b/i,
  /\bnon-?compliance\s+(?:with\s+[^.]{0,60}?)?may\s+result\s+in\s+enforcement\s+action\b/i,
  /\blicensees?\s+(?:shall|must)\s+comply\s+with\s+(?:any|all|the)\s+guidelines\s+issued\b/i,
];
const DOES_NOT_BIND =
  /\b(?:not\s+legally\s+binding|do(?:es)?\s+not\s+have\s+the\s+force\s+of\s+law|will\s+not\s+(?:of\s+itself\s+)?attract\s+(?:criminal\s+)?(?:liability|penalt))/i;

export function statesItsForce(sections: Pick<ParsedSection, 'text'>[], within = 40): boolean {
  const head = sections.slice(0, within).map((s) => s.text.replace(/\s+/g, ' '));
  if (head.some((t) => DOES_NOT_BIND.test(t))) return false;
  return head.some((t) => BINDS.some((re) => re.test(t)));
}

/**
 * Whether the words a finding rests on are words the amending provision sets out for insertion.
 *
 * `amendsAnotherAct` rules out a provision that only instructs a change to another Act, on the
 * ground that the vehicle imposes nothing itself. That is right about the instruction and wrong
 * about what the instruction carries. An amending section has two parts: the direction, "The
 * principal Act is amended in Part II by inserting after section 12 the following division", and
 * then the division itself, set out in full between quotation marks -- "12A. (1) A data controller
 * shall appoint one or more data protection officers". The first imposes nothing. The second is the
 * duty, in the words the legislature enacted, and it is the only place those words exist until the
 * next consolidation is printed.
 *
 * Ruling both out reads an economy's newest law as absent. Malaysia's 2024 amendment inserted the
 * duties scored for seven cells; the consolidation on the statute book is current to 1 July 2023
 * and contains the words "breach" and "data protection officer" no times at all.
 *
 * ESCAP's own method allows both readings -- its extraction slide says of an amendment, "insert in
 * main law, or a single file" -- and its guide scores a safe-harbour provision straight out of New
 * Zealand's Copyright (New Technologies) Amendment Act. So the line is not between the principal
 * Act and the amending one. It is between an instruction and the text the instruction enacts, and
 * only the second is a provision. What it is a provision *of* is the principal Act, which is what
 * `amends_instrument_id` is for and what a citation built on this has to say.
 */
const SETS_OUT_TEXT = /\b(?:inserting|substituting|adding|inserted|substituted)\b[^:"“]{0,160}[:,]?\s*["“]/gi;

/**
 * Compared with the line breaks taken out of both sides.
 *
 * A quote is a span of words; where the lines break in it is the PDF's decision, not the
 * legislature's. Section 6 of Malaysia's Personal Data Protection (Amendment) Act 2024 sets out
 * the whole of the new Division 1A -- "A data controller shall appoint one or more data protection
 * officers" among it -- and the text layer puts a newline between "more" and "data". `indexOf`
 * missed the span by that one character, so the gate above read a section that sets out four
 * subsections of new duties as an instruction setting out nothing, and indicator 7.4 scored zero
 * on a duty printed inside its own evidence. Every other quote check in the system normalises
 * first; this was the one place comparing raw.
 */
const flattenForQuote = (s: string): string => s.replace(/\s+/g, ' ');

export function insertsTheQuotedWords(raw: string, words: string | null): boolean {
  const quote = flattenForQuote(words?.trim() ?? '');
  if (quote.length < 3) return false;
  const text = flattenForQuote(raw);
  const at = text.indexOf(quote);
  if (at < 0) return false;

  for (const opener of text.matchAll(SETS_OUT_TEXT)) {
    if (opener.index === undefined) continue;
    const from = opener.index + opener[0].length;
    if (from > at) continue;
    // The passage runs to the closing quotation mark, or to the end of what we were given: a
    // section cut at the page break still sets out everything up to the cut.
    const closed = /["”]/.exec(text.slice(from));
    const to = closed ? from + closed.index : text.length;
    if (at >= from && at < to) return true;
  }
  return false;
}

/**
 * The instrument an amending document says it amends, as that document names it.
 *
 * Words inserted by an amendment are the principal Act's words, so a finding built on them has to
 * cite the principal Act. Which Act that is cannot be taken from the amending instrument's title --
 * a title names the principal only when its drafters chose to, and Malaysia's "Anti-Fake News
 * (Repeal) Act 2020" and "Temporary Measures for Government Financing Act" are both counterexamples
 * in the same register. It can be taken from the document, because an amending Act is required to
 * say what it amends and says it with the principal's own gazette identifier: "The Personal Data
 * Protection Act 2010 [Act 709], which is referred to as the 'principal Act' in this Act".
 *
 * That identifier is the whole value of reading it here. Resolving a principal by title is a
 * fuzzy match against thousands of rows; resolving "Act 709" is an equality test, and it is either
 * right or it finds nothing.
 *
 * The clause has to be an amending clause. An Act's opening sections cite other Acts constantly --
 * for definitions, for the tribunal that hears its appeals, for the tax its fees are exempt from --
 * and the first bracketed number in a head is as often one of those as it is the principal. So the
 * name is read only where the words around it say this document amends it, or where the document
 * goes on to call it the principal Act.
 */
/**
 * How a document is cited by its own identifier: the name, then the identifier in brackets.
 *
 * Written out three times rather than composed, because composing a pattern through a template
 * literal turns every escape in it into the character it names -- the same hazard that puts a
 * literal backspace in a source file, one level up.
 */
/** "An Act to amend the X [id]" -- the long title of an amending Act. */
const AMENDS_CLAUSE =
  /\b(?:to\s+amend|amendment\s+of)\s+(?:the\s+)?([A-Z][A-Za-z'()’-]*(?:\s+[A-Za-z'()&’-]+){0,12}?\s+(?:Act|Ordinance|Enactment|Regulations?|Rules?|Orders?)(?:\s+\d{4})?)\s*\[\s*([^\]]{2,40}?)\s*\]/i;
/** "The X [id], which is referred to as the principal Act" -- the naming clause. */
const PRINCIPAL_CLAUSE =
  /([A-Z][A-Za-z'()’-]*(?:\s+[A-Za-z'()&’-]+){0,12}?\s+(?:Act|Ordinance|Enactment|Regulations?|Rules?|Orders?)(?:\s+\d{4})?)\s*\[\s*([^\]]{2,40}?)\s*\]\s*,?\s*(?:which\s+is\s+)?referred\s+to\s+as\s+the\s+["“]?principal/i;
/** "The X [id] is amended" -- the subsidiary voice, naming the instrument before the change. */
const IS_AMENDED_CLAUSE =
  /([A-Z][A-Za-z'()’-]*(?:\s+[A-Za-z'()&’-]+){0,12}?\s+(?:Act|Ordinance|Enactment|Regulations?|Rules?|Orders?)(?:\s+\d{4})?)\s*\[\s*([^\]]{2,40}?)\s*\]\s+(?:is|are)\s+amended\b/i;

export function amendsWhat(
  sections: Pick<ParsedSection, 'text'>[],
  within = 4,
): { name: string; officialNumber: string } | null {
  const head = sections.slice(0, within).map((s) => s.text).join('\n').replace(/\s+/g, ' ').slice(0, 1600);
  const m = PRINCIPAL_CLAUSE.exec(head) ?? AMENDS_CLAUSE.exec(head) ?? IS_AMENDED_CLAUSE.exec(head);
  if (!m) return null;
  // The definite article belongs to the sentence, not to the name: the register files the
  // instrument as "Sales Tax ... Order 2018" and the clause writes "The Sales Tax ... Order 2018".
  return {
    name: m[1]!.replace(/^The\s+/i, '').trim(),
    officialNumber: m[2]!.replace(/\s+/g, ' ').trim(),
  };
}
