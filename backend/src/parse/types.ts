/**
 * What a parser produces.
 *
 * The invariant every parser must hold, and which a test asserts for each one:
 *
 *     text.slice(section.charStart, section.charEnd) === section.text
 *
 * That is what makes a citation checkable. The only defence against "the cited section does not
 * say that" is an offset into stored text that can be re-read.
 */

export type Extraction = 'html' | 'pdf-text' | 'ocr' | 'plain' | 'none';

/** Why nothing could be read. Recorded; never turned into an empty document. */
export type UnreadReason =
  | 'landing-page'
  | 'scanned-no-ocr'
  | 'ocr-below-threshold'
  | 'empty'
  | 'parse-error'
  | 'unsupported-media-type'
  | 'another-instrument'
  /** Published about an instrument -- a consultation, a release, a headline -- rather than one. */
  | 'not-an-instrument';

export interface ParsedSection {
  ordinal: number;
  /** "Part 6 TRANSFER OF PERSONAL DATA OUTSIDE SINGAPORE > 26 Transfer of personal data outside Singapore" */
  headingPath: string;
  /** The citable label alone: "26", "26A", "Reg 5". Null when the document has no numbering. */
  label: string | null;
  text: string;
  charStart: number;
  charEnd: number;
  page: number | null;
  language: string | null;
  /**
   * A repealed or deleted provision. Kept, because a reader needs to see that a section is gone
   * rather than find nothing; excluded from evidence by the verifier.
   */
  repealed: boolean;
  /** A fragment anchor on the source site, so a citation can deep-link to the provision. */
  anchor: string | null;
}

export interface ParsedDocument {
  extraction: Extraction;
  /** The whole document's text. Section offsets index into this string and nothing else. */
  text: string;
  sections: ParsedSection[];
  /** Non-null when nothing usable came out. sections is then empty. */
  unread: { reason: UnreadReason; detail: string } | null;
  title: string | null;
  /** Whatever the source states about itself: act number, commencement, last amendment. */
  meta: Record<string, string>;
  /** Which parser ran, named in the run record so a bad parse is traceable to code. */
  parser: string;
}

/** Assemble document text from sections so the offset invariant holds by construction. */
export class SectionBuilder {
  private readonly parts: string[] = [];
  private cursor = 0;
  readonly sections: ParsedSection[] = [];

  /** Text that belongs to the document but is not a citable section: a long title, a preamble. */
  addProse(text: string): void {
    const t = text.trim();
    if (!t) return;
    this.parts.push(t, '\n\n');
    this.cursor += t.length + 2;
  }

  add(s: Omit<ParsedSection, 'ordinal' | 'charStart' | 'charEnd'>): void {
    const text = s.text.trim();
    if (!text) return;
    const charStart = this.cursor;
    this.parts.push(text, '\n\n');
    this.cursor += text.length + 2;
    this.sections.push({
      ...s,
      text,
      ordinal: this.sections.length,
      charStart,
      charEnd: charStart + text.length,
    });
  }

  get text(): string {
    return this.parts.join('');
  }
}
