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
const STATES_NAME = [
  /(?:may be|is)\s+cited\s+as\s+the\s+([A-Z][^.,;()\n]{4,110})/,
  /This\s+(?:Act|Ordinance|Enactment|Regulations?|Rules|Order)\s+is\s+the\s+([A-Z][^.,;()\n]{4,110})/,
];

/** Words too common to distinguish one instrument from another. */
const COMMON = new Set([
  'act', 'the', 'and', 'for', 'of', 'to', 'ordinance', 'enactment', 'regulations', 'regulation',
  'rules', 'order', 'reprint', 'revised', 'repealed', 'malaysia', 'singapore', 'australia',
]);

/** A plural and its singular are the same word. "Persons" against "Person's" is not two Acts. */
function stem(w: string): string {
  return w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
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
      if (m) return m[1]!.replace(/\s+/g, ' ').trim();
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
  const opens = (head: string[], rest: string[]) => head.slice(0, 3).every((w) => rest.includes(w));
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
