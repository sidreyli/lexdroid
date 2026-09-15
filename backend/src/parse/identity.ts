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

/**
 * Whether two names are the same instrument.
 *
 * Compared head-first in both directions because each side truncates differently: a catalogue
 * title is cut short, and a citation provision runs on into its commencement words. Either name
 * opening with the other's first identifying words is the same instrument.
 */
export function namesMatch(stated: string, title: string): boolean {
  const a = keyWords(stated);
  const b = keyWords(title);
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
  const stated = statedName(sections);
  if (stated === null || namesMatch(stated, title)) return null;
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
