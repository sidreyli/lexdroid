/**
 * PDFs.
 *
 * Text-layer PDFs are read with pdf.js. Pages with no usable text layer are rendered locally and
 * read with the packaged English and Hindi Tesseract models. OCR remains visibly marked in the
 * stored extraction method and export confidence; a weak result is unread, never clean evidence.
 *
 * ESCAP marks this directly: "a tool that flags text it could not read is better built than one
 * that presents everything with equal confidence."
 */
import { detectLanguage } from './language.js';
import { SectionBuilder, type ParsedDocument } from './types.js';
import { readsAsAClause } from './identity.js';
import { ocrPdfPages, type OcrEngine } from './ocr.js';
import { amendmentHistory } from './lom.js';

/** Below this many characters per page, the page is an image of text rather than text. */
const MIN_CHARS_PER_PAGE = 80;

/**
 * A text layer that is reporting something other than the page's characters.
 *
 * A C0 control character is not text and no statute contains one. Where pdf.js emits one it is
 * saying what the font's ToUnicode map told it, and that map is wrong: in Malaysia's AGC reprints
 * one embedded font maps the "1" glyph *and* the "2" glyph to U+0018, so the Malaysian
 * Communications and Multimedia Commission Act's own contents page reads "10, 11, 11, 13, 14, 15"
 * where the Act prints 10 to 15, and its section 4 opens "4. ( )". The damage is not repairable by
 * substitution -- two digits arrive as one codepoint, and which one is gone -- and it is not
 * cosmetic: `PROVISION_LINE` cannot see a section number that starts with a control byte, so those
 * sections are stored with no label at all, and no quote of them can be matched.
 *
 * 403 pages across 23 Malaysian PDFs are affected, including 49 of the Communications and
 * Multimedia Act 1998 and 32 of the Commission Act -- the two instruments four of Malaysia's cells
 * are decided on. The glyphs are drawn correctly; only the map from glyph to character is wrong.
 * So the page is rendered and read, exactly as a page with no text layer at all is, and OCR
 * recovers "23 September 1998" where the text layer offers "*3 September *998".
 */
const CORRUPT_TEXT_LAYER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;

/** What a reading of a page is worth, counted in the characters that carry meaning. */
const legibleChars = (s: string): number => s.replace(/[^\p{L}\p{N}]/gu, '').length;

/** Whether a page's text layer is reporting characters the page does not have. */
export function hasCorruptTextLayer(lines: readonly string[]): boolean {
  return CORRUPT_TEXT_LAYER.test(lines.join(''));
}

/**
 * Whether what OCR read replaces what the text layer gave, for the two reasons a page is re-read.
 *
 * A sparse page had almost nothing, so OCR has to beat it and be a page at all. The length test
 * alone would let OCR overwrite a short but accurate page with a longer misreading.
 *
 * A damaged page had plenty, and what it had was wrong, so length is the wrong question: OCR drops
 * the dot leaders and the decorative rules that the text layer counts, and asking it to be longer
 * would hold every recovery. What it must do instead is read the page -- carrying at least as many
 * letters and digits as the corrupt layer claimed -- and come back clean, because a reading that
 * still holds control characters has not read the page either. Over Malaysia's 403 damaged pages
 * that takes 363 and holds 40, and the 40 are cover pages whose OCR is the logo: the Commission
 * Act's front page reads "LEE) B / £1:1 0.4%".
 */
export function ocrReplacesThePage(why: 'sparse' | 'damaged', before: string, after: string): boolean {
  if (why === 'damaged') {
    return !CORRUPT_TEXT_LAYER.test(after) && legibleChars(after) >= legibleChars(before) && legibleChars(after) > 0;
  }
  return after.length >= MIN_CHARS_PER_PAGE && after.length > before.length;
}


const PROVISION_LINE = /^\s*(\d+[A-Z]{0,2})\.\s*(?:—|-|–)?\s*(?:\(1\))?\s*(?=\S)/;
/** India notifications sometimes number a paragraph "12.5 Definitions" without a second dot. */
const DECIMAL_PROVISION_LINE = /^\s*[‘'"]?(\d+\.\d+[A-Z]{0,2})(?:\s+(?=\S)|\s*$)/;
/**
 * A clause numbered through more than two levels carries its whole number, not its first one.
 *
 * `PROVISION_LINE` asks for digits, a dot, and a non-space after it, and "8.2.1.1 A company
 * incorporated under..." answers that with the label "8". So does 8.1.1, and 8.2.1, and every
 * other clause of a chapter numbered this way -- they all become section 8, they all share one
 * key, and the rule that collapses an arrangement of sections against the provisions it lists
 * then keeps the last of them and drops the rest. What it drops is each clause's own first line,
 * which is the line carrying the subject: MYNIC's Registrant Policy kept "Companies Act 2016, as
 * the case may be;" and lost "8.2.1.1 A company incorporated under the Companies Act 1965 or
 * the", so the eligibility criteria that decide who may hold a .my domain read as a list of
 * statute names with no rule attached. Indicator 12.7 found nothing to cite and scored zero.
 *
 * Tried before `DECIMAL_PROVISION_LINE` because that one stops at two levels and would take "8.2"
 * out of "8.2.1" if it matched at all -- it does not, since it wants a space after the number and
 * finds a dot, which is exactly how these lines fell through to the rule that mislabels them.
 *
 * No component runs past three digits, because a dotted number ending in a year is a date. The
 * schedule of entities designated under Malaysia's anti-terrorism financing order gives each
 * person's date of birth a column of its own, and "13.2.1975" read as a clause number opened a
 * provision in the middle of the table and pushed 4,139 characters of it out. Clause numbering
 * counts up from one and reaches a thousand at no level; a date always does.
 */
const DEEP_PROVISION_LINE = /^\s*[‘'"]?(\d{1,3}(?:\.\d{1,3}){2,}[A-Z]{0,2})\.?(?:\s+(?=\S)|\s*$)/;
/**
 * A tariff code is not a provision.
 *
 * A customs or sales tax order is a table of Harmonised System codes, and an HS code is written
 * exactly like a numbered clause: "0705.29.00 00 - - Other". `DECIMAL_PROVISION_LINE` was added for
 * Indian notifications that number a paragraph "12.5 Definitions", and it matches every line of
 * every tariff schedule. Malaysia's corpus carried 31,812 of these -- 36% of the economy, spread
 * over nine orders, one of which alone minted 5,224 "provisions" of which 92% were under 200
 * characters. They are real text and they stay in the document; what they are not is a rule that
 * can be retrieved, cited and read on its own.
 *
 * Two shapes say so from the label alone, and neither costs Australia or Singapore a single
 * section: an integer part that starts with a zero ("0705.29", "05", the bare "0.41" of a price
 * schedule), and four digits before the dot ("6811.82"), which is an HS heading and subheading.
 * A bare four-digit label cannot be separated this way -- Australia's Corporations Act has a
 * section 1274 and its Social Security Act a section 1190 -- so that one is left to `tableHeadings`
 * below, which reads the document rather than the label.
 */
const TARIFF_LABEL = /^(?:0|\d{4}\.\d)/;
const numberedAt = (line: string): RegExpExecArray | null =>
  DEEP_PROVISION_LINE.exec(line) ?? DECIMAL_PROVISION_LINE.exec(line) ?? PROVISION_LINE.exec(line);
const provisionAt = (line: string): RegExpExecArray | null => {
  const found = numberedAt(line);
  return found && TARIFF_LABEL.test(found[1]!) ? null : found;
};
/** The label a numbered line carries when that label is a tariff code and not a provision. */
const tariffLabelAt = (line: string): string | null => {
  const found = numberedAt(line);
  return found && TARIFF_LABEL.test(found[1]!) ? found[1]! : null;
};
const PART_LINE = /^\s*(PART\s+[IVXLC0-9]+[A-Z]?\b.*|Part\s+\d+[A-Z]?\b.*)$/;
/** A PDF's text layer can split a heading's letters -- Malaysia's Acts render "Part II" as
 *  "P art II" -- so the test is on the letters, not on how the page happened to space them. */
const PART_SPLIT = /^PART([IVXLC]+|\d+)([A-Z]?)$/i;
/**
 * A Schedule is a container as a Part is, and it restarts the numbering. Keyed without it, the
 * Schedule's "1." and the Act's section 1 are the same (Part, label), the last copy wins, and the
 * Medicines (Advertisement and Sale) Act 1956 lost sections 1 to 6 -- the offences -- to a list of
 * diseases. Tested on the letters for the same reason as a Part.
 */
// English puts the ordinal before the noun and Malay after it ("JADUAL KEDUA"); either may letter
// its Schedules instead ("JADUAL A").
const SCHEDULE_LINE =
  /^(?:FIRST|SECOND|THIRD|FOURTH|FIFTH|SIXTH|SEVENTH|EIGHTH|NINTH|TENTH|ELEVENTH|TWELFTH)?(SCHEDULE|JADUAL)(PERTAMA|KEDUA|KETIGA|KEEMPAT|KELIMA|KEENAM|KETUJUH|KELAPAN|KESEMBILAN|KESEPULUH|[IVXLC]+|\d+[A-Z]?|[A-Z])?$/i;
/** An Act states its purpose in its long title, which is the best evidence of what it is for. */
const LONG_TITLE = /^An Act to\b/i;
const ENACTING = /^ENACTED by\b/i;

export interface PageText {
  page: number;
  lines: string[];
  language?: string | null;
  ocrConfidence?: number;
}

/**
 * The language of a page or a provision, asked of the shared detector and among the languages the
 * economy publishes law in. The copy that used to live here called any Latin script English, so a
 * Malay page was recorded as English: the export's Language of Source column said so, and the two
 * halves of a bilingual gazette carried the same key and overwrote each other.
 */
function languageOf(text: string, candidates?: readonly string[]): string | null {
  return detectLanguage(text, candidates?.length ? { candidates } : {});
}

/**
 * A page too short to tell is in the language of the page before it: a page holding a Schedule's
 * heading or a signature block is not a change of language, and reading it as one would split a
 * document's numbering in two.
 */
function languageOfPages(pages: PageText[], candidates?: readonly string[]): PageText[] {
  let last: string | null = null;
  return pages.map((page) => {
    const language = languageOf(page.lines.join(' '), candidates) ?? last;
    last = language;
    return { ...page, language };
  });
}

export async function extractPages(bytes: Buffer): Promise<PageText[]> {
  // The legacy build is the one that runs under plain Node without a DOM.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    // Nothing is fetched: a PDF that references an external font simply loses that font.
    disableFontFace: true,
  }).promise;

  const pages: PageText[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let current = '';
    let lastY: number | null = null;

    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = Math.round((item.transform as number[])[5] ?? 0);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
        current = '';
      }
      current += item.str;
      if (item.hasEOL) {
        if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
        current = '';
      }
      lastY = y;
    }
    if (current.trim()) lines.push(current.replace(/\s+/g, ' ').trim());
    pages.push({ page: p, lines, language: null });
    page.cleanup();
  }
  await doc.destroy();
  return pages;
}

/** A trailing division marker on a running header: "... Sector Schedule 1", "... Jadual 4". */
const TAIL = /\s+(schedule|appendix|annex|jadual|lampiran|bahagian|part)\s+\d+$/i;

/**
 * The name a document repeats on its own pages.
 *
 * Cover pages are laid out graphically and come out of the extractor in the wrong order -- one of
 * Malaysia's codes reads "Protection Code / Of Practice / For The Banking And" -- so the cover is
 * not a title. A running header is set in reading order and repeats, and where two headers differ
 * only in a trailing schedule number, what they share is the name.
 */
export function runningHeader(pages: PageText[]): string | null {
  if (pages.length < 4) return null;
  const at = new Map<string, { text: string; where: Map<number, number> }>();
  const lineAt = new Map<string, string>();
  for (const p of pages) {
    p.lines.forEach((raw, i) => {
      const line = raw.replace(/\s+/g, ' ').trim().replace(TAIL, '');
      if (line.length < 12 || line.length > 160) return;
      // Rules and dot leaders repeat on every page and name nothing.
      if (line.replace(/[^A-Za-z]/g, '').length < line.length * 0.6) return;
      const key = line.toLowerCase();
      const seen = at.get(key) ?? { text: line, where: new Map<number, number>() };
      if (!seen.where.has(p.page)) seen.where.set(p.page, i);
      at.set(key, seen);
      lineAt.set(`${p.page}:${i}`, key);
    });
  }
  const enough = (v: { where: Map<number, number> }): boolean =>
    v.where.size >= 3 && v.where.size >= pages.length * 0.15;
  // A repeated line is only a header if it is a name. A registry's policy lists its domain
  // categories in a table and "pursuant to the Universities and University Colleges Act 1971;"
  // runs down three pages of it, which was enough to be taken for the document's own name and to
  // rename the instrument after somebody else's Act. Where every repeat is a clause the document
  // has no running header, and saying so lets its citation provision be asked instead.
  const repeated = [...at.values()].filter((v) => enough(v) && !readsAsAClause(v.text));
  if (repeated.length === 0) return null;
  repeated.sort((a, b) => b.where.size - a.where.size || b.text.length - a.text.length);

  // A header set on two lines arrives as two repeats, each meaningless alone: the water code's
  // is "Personal Data Protection" above "for the utilities sector (water)". Rejoin the neighbours.
  const best = repeated[0]!;
  const grow = (step: -1 | 1): string | null => {
    const votes = new Map<string, number>();
    for (const [page, i] of best.where) {
      const key = lineAt.get(`${page}:${i + step}`);
      if (key) votes.set(key, (votes.get(key) ?? 0) + 1);
    }
    const [key, n] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
    const found = key ? at.get(key) : undefined;
    return found && n !== undefined && n >= best.where.size * 0.8 && enough(found) ? found.text : null;
  };
  return [grow(-1), best.text, grow(1)].filter(Boolean).join(' ');
}

/** A page number on a line of its own, however the printer chose to write it. */
const PAGE_NUMBER = /^(?:page\s+)?[ivxlcdm\d]+(?:\s*(?:of|\/)\s*[ivxlcdm\d]+)?$/i;
/** How far in from the top and the bottom of a page furniture is allowed to sit. */
const EDGE = 2;

/**
 * A repeated line reduced to the part of it that does not change from page to page.
 *
 * The page number is the part that changes, and in these PDFs it is not on a line of its own:
 * the Communications and Multimedia Act's text layer emits "137Communications and Multimedia"
 * as one line. Keying on the whole line makes every page's header unique and the repetition
 * invisible -- which is why `runningHeader` above finds nothing in that Act.
 */
function furnitureKey(line: string): string {
  return line.replace(/[^A-Za-z ]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The pages without the header, footer and page number printed around their text.
 *
 * A PDF has no idea that a page break falls mid-sentence, so the furniture is emitted in the
 * middle of the provision it interrupts. Section 264 of the Communications and Multimedia Act
 * is stored as "...applications service provider or content applications service /
 * 137Communications and Multimedia / provider or any of his employees, shall not be liable...",
 * and it is the correct rule for Malaysia's 8.2 -- refused, because the quote the engine reads
 * off the page is not the text we hold. Corpus-wide this is on 7,746 of 55,232 Malaysian
 * sections, and 26% of the quotes refused as not-in-the-provision are on such a section against
 * a 14% base rate.
 *
 * Only the first and last couple of lines of a page are eligible, because that is where
 * furniture is printed and a wrongly dropped line is a lost provision. A line that opens a
 * provision or names a Part is never dropped however often it repeats.
 */
export function stripPageFurniture(pages: PageText[]): PageText[] {
  if (pages.length < 4) return pages;
  const edges = (p: PageText): number[] => {
    if (p.lines.length < 6) return [];
    const last = p.lines.length - 1;
    return [0, 1, last - 1, last];
  };
  const structural = (line: string): boolean =>
    provisionAt(line) !== null ||
    PART_LINE.test(line) ||
    (line.length < 40 && PART_SPLIT.test(line.replace(/\s+/g, '')));

  const at = new Map<string, Set<number>>();
  for (const p of pages) {
    for (const i of edges(p)) {
      const line = p.lines[i]!;
      if (line.length > 120 || structural(line)) continue;
      const key = furnitureKey(line);
      if (key.length < 4 && !PAGE_NUMBER.test(line.trim())) continue;
      const seen = at.get(key) ?? new Set<number>();
      seen.add(p.page);
      at.set(key, seen);
    }
  }
  // The same bar `runningHeader` sets: repeated on at least three pages, and on a real share of
  // them, so that a body line landing at a page edge twice is not mistaken for a header. A header
  // alternates recto and verso and so reaches only half the pages; a bare number carries no words
  // to be recognised by, so it has to be printed like a page number on nearly every page before
  // it is read as one -- otherwise the last figure in a schedule of fees is furniture.
  const furniture = new Set(
    [...at.entries()]
      .filter(([key, seen]) => seen.size >= 3 && seen.size >= pages.length * (key ? 0.15 : 0.6))
      .map(([key]) => key),
  );
  if (furniture.size === 0) return pages;

  return pages.map((p) => {
    const drop = new Set(
      edges(p).filter((i) => {
        const line = p.lines[i]!;
        if (line.length > 120 || structural(line)) return false;
        const key = furnitureKey(line);
        return furniture.has(key) && (key.length >= 4 || PAGE_NUMBER.test(line.trim()));
      }),
    );
    if (drop.size === 0) return p;
    return { ...p, lines: p.lines.filter((_, i) => !drop.has(i)) };
  });
}

/** A heading set in capitals, allowing for the punctuation and numerals a title carries. */
function isCapitalised(line: string): boolean {
  const letters = line.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/**
 * The lines of a document, sectioned.
 *
 * Separate from the extraction above so the rule below can be exercised without a PDF to hand.
 */
export function sectionise(pages: PageText[]): SectionBuilder {
  interface Candidate {
    label: string | null;
    heading: string;
    part: string;
    page: number;
    lines: string[];
    language: string | null;
    schedule?: boolean;
  }
  const items: ({ prose: string } | Candidate)[] = [];
  // Every dotted number the document carries, provision or tariff code, kept by its integer part.
  // This is what tells an HS heading from a section numbered in the thousands, further down.
  const dotted = new Set<string>();
  let part = '';
  let titlePending = false;
  let open: Candidate | null = null;

  let pageLanguage: string | null = null;
  const partIn = new Map<string, string>();

  for (const p of pages) {
    // Each language's text keeps its own container. A bilingual instrument prints its Malay text
    // and then its English one, and the Malay text's closing JADUAL, left open, filed the English
    // section 1 inside it -- where it took the Schedule's own item 1's place. And a Schedule's forms
    // are printed in alternating languages, so the English Schedule is picked up again, not closed,
    // when the English pages resume: closed, its form's item 1 took the English section 1's place.
    if (p.language && pageLanguage && p.language !== pageLanguage) {
      partIn.set(pageLanguage, part);
      part = partIn.get(p.language) ?? '';
      titlePending = false;
    }
    pageLanguage = p.language ?? pageLanguage;
    for (const [at, line] of p.lines.entries()) {
      const split = line.length < 40 ? PART_SPLIT.exec(line.replace(/\s+/g, '')) : null;
      if (split) {
        open = null;
        part = `Part ${split[1]!.toUpperCase()}${split[2] ?? ''}`;
        titlePending = true;
        continue;
      }
      // "Schedule" is also the marginal note of the section that brings the Schedule in, and that
      // note sits directly above its section's number; a Schedule's own heading never does.
      const next = p.lines[at + 1];
      const schedule =
        line.length < 40 && !(next && provisionAt(next)) ? SCHEDULE_LINE.exec(line.replace(/\s+/g, '')) : null;
      if (schedule) {
        const name = line.replace(/\s+/g, ' ').trim().toUpperCase();
        // The same name again at the head of the Schedule's next page is its running header.
        if (name === part) continue;
        part = name;
        titlePending = false;
        // The Schedule is text in its own right -- a list of offences, of diseases, of forms -- so
        // it opens a section of its own. Left as loose prose it reached no search at all, and the
        // Criminal Procedure Code lost a quarter of its text that way.
        open = { label: null, heading: name, part: '', page: p.page, lines: [line], language: p.language ?? null, schedule: true };
        items.push(open);
        continue;
      }
      const partMatch = PART_LINE.exec(line);
      if (partMatch && line.length < 120) {
        open = null;
        part = partMatch[1]!.trim();
        titlePending = false;
        continue;
      }
      // A Part's subject is on the lines under its number, set in capitals, and it is often the
      // only place the subject appears at all -- "Part IV" alone tells a search nothing.
      if (titlePending) {
        if (line.length < 80 && isCapitalised(line) && !provisionAt(line)) {
          part = `${part} ${line}`;
          continue;
        }
        titlePending = false;
      }
      // The long title arrives in the front matter, which in these PDFs follows the arrangement of
      // sections, so it has to break out of whatever entry happened to be open.
      if (LONG_TITLE.test(line)) {
        // The long title opens the operative text, so whatever container the arrangement named
        // last -- its closing "SCHEDULE", most often -- does not carry over onto section 1.
        part = '';
        titlePending = false;
        open = {
          label: null, heading: 'Long title', part: '', page: p.page,
          lines: [line], language: p.language ?? null,
        };
        items.push(open);
        continue;
      }
      if (open && open.heading === 'Long title' && ENACTING.test(line)) {
        open = null;
        continue;
      }
      // A tariff row is not opened as a provision, but its number is still evidence about what the
      // numbers around it are: "2208.20" is why the bare "2208" above it is a heading.
      const tariff = tariffLabelAt(line);
      if (tariff !== null && tariff.includes('.')) dotted.add(tariff.slice(0, tariff.indexOf('.')));
      const provMatch = provisionAt(line);
      if (provMatch) {
        open = {
          label: provMatch[1]!, heading: line.slice(0, 120), part, page: p.page,
          lines: [line], language: p.language ?? null,
        };
        items.push(open);
        continue;
      }
      if (open) open.lines.push(line);
      else items.push({ prose: line });
    }
  }

  // The heading of a tariff table, folded back into the text it heads.
  //
  // "2208" opens a run of "2208.20", "2208.30", "2208.40" -- it is the HS heading those subheadings
  // hang under, and on its own it says nothing a search could use. No label shape separates it from
  // a real provision numbered in the thousands: the Corporations Act has a section 1274 and the
  // Social Security Act a section 1190, both of them substantial. The document does separate them.
  // A statute that has a section 1190 does not also have a section 1190.2, and a tariff schedule
  // always does. Measured across all three economies, this drops 4,310 Malaysian table headings and
  // leaves every one of Australia's 638 four-digit sections standing.
  for (const it of items) {
    if (!('lines' in it) || !it.label) continue;
    const dot = it.label.indexOf('.');
    if (dot > 0) dotted.add(it.label.slice(0, dot));
  }
  const heads = (label: string | null): boolean =>
    label !== null && /^\d{4}$/.test(label) && dotted.has(label);
  if (items.some((it) => 'lines' in it && heads(it.label))) {
    const folded: typeof items = [];
    for (const it of items) {
      if ('lines' in it && heads(it.label)) {
        // The words stay in the document: they are the table's own heading, and the rows beneath
        // them are read with them. What they stop being is a provision of their own.
        const prev = folded[folded.length - 1];
        if (prev && 'lines' in prev) prev.lines.push(...it.lines);
        else for (const line of it.lines) folded.push({ prose: line });
        continue;
      }
      folded.push(it);
    }
    items.length = 0;
    items.push(...folded);
  }

  // A document that opens with its own arrangement of sections lists every provision twice: once
  // as a heading with nothing under it, and once as the provision itself. The arrangement always
  // comes first, so the real one is the last copy: length is a worse test, because the front
  // matter that follows the arrangement glues itself onto whichever entry was open.
  //
  // The Part belongs in the key. An Act numbers its sections once through the whole statute, so
  // dropping every earlier copy of "12." is right there; a code of practice restarts at 1 in each
  // Part, so the same key names a different provision six times over and only the last survived.
  // The Malaysian Communications and Multimedia Content Code 2022 came out of this as 103 sections
  // of a 74-page code, its Part 5 reduced to a single stub and its Part 7 gone -- and Part 5
  // clause 2.1 is the innocent carrier rule, which is the provision ESCAP cites for Malaysia's
  // 8.2. An arrangement of sections repeats its Part headings along with its entries, so keying on
  // both still collapses the arrangement against the body.
  const lastAt = new Map<string, number>();
  const key = (it: { language?: string | null; part?: string; label: string | null }): string =>
    `${it.language ?? ''}:${it.part ?? ''}:${it.label}`;
  items.forEach((it, n) => {
    if ('lines' in it && it.label) lastAt.set(key(it), n);
  });
  // The Part only collapses the two copies when both were filed under the same one, and the
  // arrangement's own Part headings are the lines a scan most often mangles: "C hapter I" is not a
  // Chapter, so the Finance (No. 2) Act 2023 listed 96 of its sections as empty headings ahead of
  // the real ones. So a contents entry is also recognised by what it is, whatever Part or language
  // it landed in: a line with nothing under it, whose number turns up again later with a body, and
  // whose words turn up again later too -- as the marginal note set beside the real provision.
  //
  // The words are what keep a one-line provision. A code that restarts its numbering in each Part
  // can hold "2.1 A broadcaster shall schedule content..." on a single line with a longer 2.1 after
  // it, and that sentence is the provision, not an entry pointing at one: it is not repeated.
  const words = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');
  const bodiedAt = new Map<string, number>();
  const startsAt: number[] = [];
  let later = '';
  items.forEach((it, n) => {
    startsAt[n] = later.length;
    later += words('lines' in it ? it.lines.join(' ') : it.prose);
    if ('lines' in it && it.label && it.lines.length > 1) bodiedAt.set(it.label, n);
  });
  const listed = (it: Candidate, n: number): boolean => {
    if (it.lines.length !== 1 || (bodiedAt.get(it.label ?? '') ?? -1) <= n) return false;
    const entry = words(it.lines[0]!.replace(/^\s*[\d.]+[A-Z]{0,2}\.?/, ''));
    return entry.length >= 6 && later.indexOf(entry, startsAt[n + 1] ?? later.length) >= 0;
  };

  // The first provision that survives with a body: an arrangement entry never does, since its copy
  // under the real provision comes later.
  const firstBodied = items.findIndex(
    (it, n) => 'lines' in it && it.label !== null && it.lines.length > 1 && lastAt.get(key(it)) === n && !listed(it, n),
  );
  const builder = new SectionBuilder();
  /**
   * What accumulated under an entry that is about to be dropped.
   *
   * It is kept as a section and not as prose, because prose reaches no search: the Criminal
   * Procedure Code lost a quarter of its text that way, which is why a Schedule opens a section
   * of its own. It carries no label, because the label belonged to the entry being dropped and
   * that entry's real copy is elsewhere in the document -- so this text is citable by offset and
   * findable by its words, without claiming to be a provision it is not.
   */
  const keep = (it: Candidate): void => {
    if (it.lines.length < 2) return;
    const text = it.lines.slice(1).join('\n').trim();
    if (!text) return;
    builder.add({
      headingPath: it.part,
      label: null,
      text,
      page: it.page,
      language: it.language ?? null,
      repealed: false,
      anchor: null,
    });
  };
  for (const [n, it] of items.entries()) {
    if (!('lines' in it)) {
      builder.addProse(it.prose);
      continue;
    }
    // A duplicate entry is dropped, but what accumulated underneath it is not a duplicate of
    // anything. Lines that match no provision are filed onto whichever entry was open, so an
    // arrangement of sections collects the front matter printed after it, and a numbered list
    // that is not an arrangement at all -- the committee of contributors an agency prints on its
    // second page -- collects the body of the guideline that follows. Dropping the entry dropped
    // those lines with it, unsearchable and uncited: Malaysia's Data Protection Officer
    // Competency Guideline kept 1,414 characters of the 15,783 its pages carry, and the thirteen
    // it kept were the contributors' names. The entry's own line is the duplicate; the rest is
    // the document, and it is kept as prose because it is text without being a citable provision.
    if (it.label && (lastAt.get(key(it)) !== n || listed(it, n))) {
      keep(it);
      continue;
    }
    // The arrangement closes by listing the Schedules, before any provision has a body. That copy
    // collects the cover pages that follow it, and it is not the Schedule.
    // Nothing is kept from this one: what it collected is the cover pages printed after the
    // arrangement, which the Schedule's real copy carries again further down.
    if (it.schedule && !(firstBodied < n)) continue;
    const text = it.lines.join('\n').trim();
    if (!text) continue;
    builder.add({
      headingPath: [it.part, it.heading].filter(Boolean).join(' > '),
      label: it.label,
      text,
      page: it.page,
      language: it.language ?? null,
      repealed: /\[?\bRepealed\b/i.test(text.slice(0, 120)),
      anchor: null,
    });
  }

  return builder;
}

export interface ParsePdfOptions {
  /** Supplied by tests or specialist deployments; the default is local English + Hindi Tesseract. */
  ocrEngine?: OcrEngine;
  /** The languages the economy publishes law in, from its profile. Language is guessed among these. */
  languages?: readonly string[];
}

function titleFromSections(builder: SectionBuilder): string | null {
  for (const section of builder.sections) {
    const match = /\b(?:may be called|may be cited as)\s+(?:the\s+)?(.+?(?:Act|Rules?|Regulations?|Order|Code)(?:,?\s*\d{4})?)[.;]/is.exec(section.text);
    if (match?.[1]) return match[1].replace(/\s+/g, ' ').trim();
  }
  return null;
}

function subjectTitle(pages: PageText[]): string | null {
  for (const page of pages.slice(0, 2)) {
    for (const line of page.lines) {
      const match = /^Subject\s*:-?\s*(.+)$/i.exec(line);
      if (match?.[1]) return match[1].replace(/[.\s]+$/, '').trim();
    }
  }
  return null;
}

export async function parsePdf(bytes: Buffer, url: string, opts: ParsePdfOptions = {}): Promise<ParsedDocument> {
  let pages: PageText[];
  try {
    pages = await extractPages(bytes);
  } catch (err) {
    return {
      extraction: 'none', text: '', sections: [], title: null, meta: {}, parser: 'pdf',
      unread: { reason: 'parse-error', detail: `${url}: ${err instanceof Error ? err.message : String(err)}` },
    };
  }

  const original = new Map(pages.map((page) => [page.page, page.lines.join(' ').length]));
  const sparse = pages
    .filter((page) => page.lines.join(' ').length < MIN_CHARS_PER_PAGE)
    .map((page) => page.page);
  // A page whose text layer emits control characters is read again for the same reason a page with
  // no text layer is: what came back is not what is printed. It is held separately because the two
  // failures are accepted on different evidence -- see the test below.
  const damaged = pages
    .filter((page) => hasCorruptTextLayer(page.lines))
    .map((page) => page.page);
  const reread = [...new Set([...sparse, ...damaged])].sort((a, b) => a - b);
  const ocrUsed: number[] = [];
  const ocrFailed: number[] = [];
  const confidences: number[] = [];
  let ocrError: string | null = null;
  if (reread.length > 0) {
    try {
      const recovered = await ocrPdfPages(bytes, reread, opts.ocrEngine, opts.languages);
      const byPage = new Map(recovered.map((page) => [page.page, page]));
      pages = pages.map((page) => {
        if (!reread.includes(page.page)) return page;
        const ocr = byPage.get(page.page);
        const text = ocr?.lines.join(' ') ?? '';
        const accepted =
          !!ocr &&
          ocrReplacesThePage(
            damaged.includes(page.page) ? 'damaged' : 'sparse',
            page.lines.join(' '),
            text,
          );
        if (!ocr || !accepted) {
          ocrFailed.push(page.page);
          return page;
        }
        ocrUsed.push(page.page);
        confidences.push(ocr.confidence);
        return {
          page: page.page,
          lines: ocr.lines,
          language: null,
          ocrConfidence: ocr.confidence,
        };
      });
    } catch (err) {
      ocrError = err instanceof Error ? err.message : String(err);
      ocrFailed.push(...sparse);
    }
  }

  const chars = pages.reduce((n, p) => n + p.lines.join(' ').length, 0);
  if (pages.length === 0 || chars / pages.length < MIN_CHARS_PER_PAGE) {
    return {
      extraction: 'none', text: '', sections: [], title: null, parser: 'pdf',
      meta: {
        pages: String(pages.length),
        charsPerPage: String(Math.round(chars / Math.max(1, pages.length))),
        ...(ocrFailed.length ? { ocrFailedPages: ocrFailed.join(',') } : {}),
        ...(ocrError ? { ocrError } : {}),
      },
      unread: {
        reason: 'ocr-below-threshold',
        detail:
          `${url} has ${pages.length} page(s) carrying ${Math.round(chars / Math.max(1, pages.length))} usable characters each after OCR` +
          (ocrError ? ` failed: ${ocrError}` : '; the result is below the evidence threshold.'),
      },
    };
  }

  // `runningHeader` below still reads the pages as printed: the header is what it is looking for.
  const clean = stripPageFurniture(languageOfPages(pages, opts.languages));
  const builder = sectionise(clean);

  if (builder.sections.length === 0) {
    // Text came out but no provision structure did. Keep it as one section rather than discard it:
    // a guideline or a policy document is often genuinely unnumbered, and it is still evidence.
    const whole = clean.map((p) => p.lines.join('\n')).join('\n').trim();
    builder.add({
      headingPath: url, label: null, text: whole, page: 1,
      language: languageOf(whole, opts.languages), repealed: false, anchor: null,
    });
  }

  // A revised Malaysian Act closes with the law revision commissioner's own table of amendments.
  // The register could only say which reprint it serves, so without this the store had no date
  // for when a Malaysian Act was actually last changed.
  const amended = amendmentHistory(builder.text);

  return {
    extraction: ocrUsed.length > 0 ? 'ocr' : 'pdf-text',
    text: builder.text,
    sections: builder.sections,
    unread: null,
    title: runningHeader(pages) ?? titleFromSections(builder) ?? subjectTitle(pages),
    meta: {
      pages: String(pages.length),
      ...(amended ? { lastAmendedOn: amended.on, lastAmendedBasis: amended.basis } : {}),
      ...(ocrUsed.length ? { ocrPages: ocrUsed.join(',') } : {}),
      ...(damaged.length ? { corruptTextLayerPages: damaged.join(',') } : {}),
      ...(confidences.length
        ? { ocrConfidence: String(Math.round(confidences.reduce((sum, n) => sum + n, 0) / confidences.length)) }
        : {}),
      ...(ocrFailed.length
        ? {
            ocrFailedPages: ocrFailed.join(','),
            partial: `OCR could not recover usable text from page(s) ${ocrFailed.join(', ')}.`,
          }
        : {}),
      ...(ocrError ? { ocrError } : {}),
    },
    parser: 'pdf',
  };
}
