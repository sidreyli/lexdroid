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
import { SectionBuilder, type ParsedDocument } from './types.js';
import { ocrPdfPages, type OcrEngine } from './ocr.js';

/** Below this many characters per page, the page is an image of text rather than text. */
const MIN_CHARS_PER_PAGE = 80;

const PROVISION_LINE = /^\s*(\d+[A-Z]{0,2})\.\s*(?:—|-|–)?\s*(?:\(1\))?\s*(?=\S)/;
/** India notifications sometimes number a paragraph "12.5 Definitions" without a second dot. */
const DECIMAL_PROVISION_LINE = /^\s*[‘'"]?(\d+\.\d+[A-Z]{0,2})(?:\s+(?=\S)|\s*$)/;
const provisionAt = (line: string): RegExpExecArray | null =>
  DECIMAL_PROVISION_LINE.exec(line) ?? PROVISION_LINE.exec(line);
const PART_LINE = /^\s*(PART\s+[IVXLC0-9]+[A-Z]?\b.*|Part\s+\d+[A-Z]?\b.*)$/;
/** A PDF's text layer can split a heading's letters -- Malaysia's Acts render "Part II" as
 *  "P art II" -- so the test is on the letters, not on how the page happened to space them. */
const PART_SPLIT = /^PART([IVXLC]+|\d+)([A-Z]?)$/i;
/** An Act states its purpose in its long title, which is the best evidence of what it is for. */
const LONG_TITLE = /^An Act to\b/i;
const ENACTING = /^ENACTED by\b/i;

export interface PageText {
  page: number;
  lines: string[];
  language?: string | null;
  ocrConfidence?: number;
}

function languageOf(text: string): string | null {
  const devanagari = (text.match(/[\u0900-\u097f]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (devanagari > latin && devanagari > 3) return 'hi';
  if (latin > 3) return 'en';
  return null;
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
    pages.push({ page: p, lines, language: languageOf(lines.join(' ')) });
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
  const repeated = [...at.values()].filter(enough);
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
  }
  const items: ({ prose: string } | Candidate)[] = [];
  let part = '';
  let titlePending = false;
  let open: Candidate | null = null;

  for (const p of pages) {
    for (const line of p.lines) {
      const split = line.length < 40 ? PART_SPLIT.exec(line.replace(/\s+/g, '')) : null;
      if (split) {
        open = null;
        part = `Part ${split[1]!.toUpperCase()}${split[2] ?? ''}`;
        titlePending = true;
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

  const builder = new SectionBuilder();
  for (const [n, it] of items.entries()) {
    if (!('lines' in it)) {
      builder.addProse(it.prose);
      continue;
    }
    if (it.label && lastAt.get(key(it)) !== n) continue;
    const text = it.lines.join('\n').trim();
    if (!text) continue;
    builder.add({
      headingPath: [it.part, it.heading].filter(Boolean).join(' > '),
      label: it.label,
      text,
      page: it.page,
      language: it.language ?? languageOf(text),
      repealed: /\[?\bRepealed\b/i.test(text.slice(0, 120)),
      anchor: null,
    });
  }

  return builder;
}

export interface ParsePdfOptions {
  /** Supplied by tests or specialist deployments; the default is local English + Hindi Tesseract. */
  ocrEngine?: OcrEngine;
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

  const sparse = pages
    .filter((page) => page.lines.join(' ').length < MIN_CHARS_PER_PAGE)
    .map((page) => page.page);
  const ocrUsed: number[] = [];
  const ocrFailed: number[] = [];
  const confidences: number[] = [];
  let ocrError: string | null = null;
  if (sparse.length > 0) {
    try {
      const recovered = await ocrPdfPages(bytes, sparse, opts.ocrEngine);
      const byPage = new Map(recovered.map((page) => [page.page, page]));
      pages = pages.map((page) => {
        if (!sparse.includes(page.page)) return page;
        const ocr = byPage.get(page.page);
        const text = ocr?.lines.join(' ') ?? '';
        if (!ocr || text.length < MIN_CHARS_PER_PAGE) {
          ocrFailed.push(page.page);
          return page;
        }
        ocrUsed.push(page.page);
        confidences.push(ocr.confidence);
        return {
          page: page.page,
          lines: ocr.lines,
          language: languageOf(text),
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

  const builder = sectionise(pages);

  if (builder.sections.length === 0) {
    // Text came out but no provision structure did. Keep it as one section rather than discard it:
    // a guideline or a policy document is often genuinely unnumbered, and it is still evidence.
    const whole = pages.map((p) => p.lines.join('\n')).join('\n').trim();
    builder.add({
      headingPath: url, label: null, text: whole, page: 1,
      language: languageOf(whole), repealed: false, anchor: null,
    });
  }

  return {
    extraction: ocrUsed.length > 0 ? 'ocr' : 'pdf-text',
    text: builder.text,
    sections: builder.sections,
    unread: null,
    title: runningHeader(pages) ?? titleFromSections(builder) ?? subjectTitle(pages),
    meta: {
      pages: String(pages.length),
      ...(ocrUsed.length ? { ocrPages: ocrUsed.join(',') } : {}),
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
