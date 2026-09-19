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
  /(?:may be|is)\s+cited\s+as\s+the\s+([A-Z][^.,;]{4,110})/,
  /This\s+(?:Act|Ordinance|Enactment|Regulations?|Rules|Order)\s+is\s+the\s+([A-Z][^.,;]{4,110})/,
];

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
const NAMES_AN_INSTRUMENT =
  /\b(act|ordinance|enactment|regulations?|rules?|order|notice|guidelines?|code|bill|constitution|charter|decree|akta|peraturan|perintah|kaedah|undang)\b/i;

export function namesAnInstrument(title: string): boolean {
  return NAMES_AN_INSTRUMENT.test(title);
}

/** The name a document gives itself, from its opening provisions. Null if it never says. */
export function statedName(sections: Pick<ParsedSection, 'text'>[], within = 14): string | null {
  for (const s of sections.slice(0, within)) {
    for (const re of STATES_NAME) {
      const m = re.exec(s.text);
      // The older drafting runs the commencement into the same sentence. That is not the name.
      if (m) return m[1]!.replace(/\s+and\s+(?:shall|comes?|is deemed|shall be deemed)\b[\s\S]*$/i, '').replace(/\s+/g, ' ').trim();
    }
  }
  return null;
}

/** The Malay drafting formula: "Akta ini bolehlah dinamakan Akta X". */
const STATES_NAME_MS = /boleh(?:lah)?\s+(?:dinamakan|disebut)\s+(?:sebagai\s+)?([A-Z][^.,;]{4,110})/;
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
    for (const re of STATES_NAME) {
      const m = re.exec(s.text);
      if (m) out.push({ name: clean(m[1]!), language: 'en' });
    }
    const ms = STATES_NAME_MS.exec(s.text);
    if (ms) out.push({ name: clean(ms[1]!), language: 'ms' });
  }
  return out;
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
 * Whether two names are the same instrument.
 *
 * Compared head-first in both directions because each side truncates differently: a catalogue
 * title is cut short, and a citation provision runs on into its commencement words. Either name
 * opening with the other's first identifying words is the same instrument.
 */
export function namesMatch(stated: string, title: string): boolean {
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
