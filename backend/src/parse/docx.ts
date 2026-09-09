/**
 * Word (.docx) text extraction.
 *
 * China's National Laws and Regulations Database (flk.npc.gov.cn) serves its gazette text as Word,
 * not PDF or HTML -- confirmed live against the Personal Information Protection Law. Without this
 * every Chinese instrument arrives as `unsupported-media-type` and the economy has no corpus at
 * all, so the format is a precondition for the economy rather than a nicety.
 *
 * There is no OCR concern on this path and no line-wrapping ambiguity to undo: a `.docx` is a zip
 * of XML, and each `<w:p>` is a real paragraph boundary in the source rather than a rasterised
 * line break. That makes it a more faithful starting point than a text PDF, where a paragraph has
 * to be reassembled from flush-left geometry and guessed at.
 */
import { unzipSync } from 'fflate';
import * as cheerio from 'cheerio';
import { SectionBuilder, type ParsedDocument } from './types.js';

export const DOCX_MEDIA_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The part of the archive holding the body text. Fixed by the OOXML packaging convention. */
const BODY_PART = 'word/document.xml';

export class NotADocx extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'NotADocx';
  }
}

/**
 * Every paragraph of the document body, in document order.
 *
 * Empty paragraphs are preserved rather than dropped: a caller that cares about them can see the
 * spacing, and every parser downstream already treats a blank line as insignificant. Dropping them
 * here would be a decision taken in the wrong place.
 */
export function docxParagraphs(bytes: Buffer): string[] {
  // A .docx is a zip archive, which always begins "PK". Checking the bytes rather than the
  // Content-Type the server claimed is the same rule parseDocument applies to "%PDF": a portal
  // that mislabels a login page as a Word document should fail here, loudly, and not parse as an
  // empty statute.
  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new NotADocx(
      `expected a .docx (a zip archive, "PK"), got ${bytes.length} bytes starting ${JSON.stringify(
        bytes.subarray(0, 16).toString('latin1'),
      )}`,
    );
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(bytes), { filter: (f) => f.name === BODY_PART });
  } catch (err) {
    throw new NotADocx(`the archive could not be read: ${err instanceof Error ? err.message : String(err)}`);
  }

  const body = files[BODY_PART];
  if (!body) throw new NotADocx(`the archive contains no ${BODY_PART}, so it is not a Word document`);

  const $ = cheerio.load(Buffer.from(body).toString('utf8'), { xml: true });
  return $('w\\:p')
    .toArray()
    .map((p) =>
      $(p)
        .find('w\\:t')
        .toArray()
        .map((t) => $(t).text())
        .join(''),
    );
}

/**
 * The generic Word path: text, with no structure claimed.
 *
 * A .docx carries no numbering convention of its own -- "第七条", "s 7" and "Article 7" are all
 * just paragraph text -- so a parser that knows the jurisdiction is what turns paragraphs into
 * citable sections. This is the fallback for a host with no such parser: the document is readable
 * and searchable, and it says plainly that it has no sections rather than inventing boundaries.
 */
export function parseDocx(bytes: Buffer, url: string): ParsedDocument {
  let paragraphs: string[];
  try {
    paragraphs = docxParagraphs(bytes);
  } catch (err) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      title: null,
      meta: {},
      parser: 'docx',
      unread: {
        reason: err instanceof NotADocx ? 'unsupported-media-type' : 'parse-error',
        detail: `${url}: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  const text = paragraphs.map((p) => p.trim()).filter(Boolean).join('\n');
  if (!text) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      title: null,
      meta: {},
      parser: 'docx',
      unread: { reason: 'empty', detail: `${url} is a Word document containing no text.` },
    };
  }

  const builder = new SectionBuilder();
  builder.add({
    headingPath: url,
    label: null,
    text,
    page: null,
    language: null,
    repealed: false,
    anchor: null,
  });

  return {
    extraction: 'plain',
    text: builder.text,
    sections: builder.sections,
    unread: null,
    title: paragraphs.map((p) => p.trim()).find(Boolean) ?? null,
    meta: {},
    parser: 'docx',
  };
}
