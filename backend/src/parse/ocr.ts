/** Offline OCR for PDF pages, using local Tesseract language packs and a local canvas renderer. */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Tesseract from 'tesseract.js';

const here = dirname(fileURLToPath(import.meta.url));
const OCR_ROOT = join(here, '..', '..', 'data', 'ocr');
const TESSDATA_DIR = join(OCR_ROOT, 'tessdata');
const TESSERACT_CACHE = join(OCR_ROOT, 'cache');
/** A PDF's own coordinate space is 72 units to the inch, so a render scale is a dpi in disguise. */
const PDF_BASE_DPI = 72;
const RENDER_SCALE = 2.5;
/** What that scale actually renders at -- not the 300 the engine used to be told regardless. */
const RENDER_DPI = Math.round(PDF_BASE_DPI * RENDER_SCALE);
/**
 * The retry scale, genuinely reaching the 300 dpi the engine is told either way.
 *
 * The first pass renders at 2.5x (180 dpi) for speed, which is enough for most pages. Below the
 * shared confidence floor the page is rendered again at this scale before it is given up on --
 * `user_defined_dpi` finally matches what the page was actually drawn at on both passes, where
 * before it claimed 300 unconditionally while rendering 180.
 */
const RETRY_RENDER_SCALE = 300 / PDF_BASE_DPI;
const RETRY_RENDER_DPI = 300;
/**
 * The confidence below which a page's OCR is not simply accepted -- shared with
 * `legalinfo.ts`'s `SCAN_MIN_CONFIDENCE` so a scan is held to the same bar whichever parser reads
 * it. A 22%-confidence page and an 85%-confidence one were being accepted on the same terms; they
 * are not the same evidence.
 */
export const OCR_MIN_CONFIDENCE = 50;
const localRequire = createRequire(import.meta.url);
const pdfRequire = createRequire(localRequire.resolve('pdfjs-dist/package.json'));
const { createCanvas, loadImage } = pdfRequire('@napi-rs/canvas') as {
  createCanvas(width: number, height: number): {
    getContext(type: '2d'): unknown;
    toBuffer(type: 'image/png'): Buffer;
  };
  loadImage(source: Buffer): Promise<{ width: number; height: number }>;
};

/** What a 2d context is asked to do here, and nothing more. */
interface Paint {
  fillStyle: string;
  imageSmoothingQuality: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: unknown, x: number, y: number, w: number, h: number): void;
}

interface LanguagePackage {
  code: string;
  gzip: boolean;
  langPath: string;
}

export interface OcrRecognition {
  text: string;
  confidence: number;
}

export interface OcrEngine {
  recognize(image: Buffer, page: number, dpi?: number): Promise<OcrRecognition>;
  /**
   * One pass over every one of the economy's own scripts at once, alongside English, instead of
   * English first and a script consulted only on its failure. Used for the retry a low-confidence
   * first pass earns, where trying the scripts in sequence is the slower way to find the reading
   * that was there to find; a page with no other script just repeats the English pass.
   */
  recognizeCombined(image: Buffer, page: number, dpi?: number): Promise<OcrRecognition>;
  close(): Promise<void>;
}

export interface OcrPage {
  page: number;
  lines: string[];
  confidence: number;
  /** What the engine returned, blank lines and all: a blank line is where it saw a paragraph end. */
  text?: string;
}

/**
 * The scripts OCR can read besides English, by the language code a profile states: the Tesseract
 * pack, and the characters that show a page really is in that script. A page is only taken as one
 * of these if the pack finds its script on it -- the English pack reads Thai as Latin gibberish,
 * and before Thailand had a pack the Hindi one read a Thai notification as Devanagari.
 */
type Pack = 'hin' | 'tha' | 'lao' | 'mon' | 'rus';

const SCRIPTS: Record<string, { pack: Pack; chars: RegExp }> = {
  hi: { pack: 'hin', chars: /[\u0900-\u097f]/g },
  th: { pack: 'tha', chars: /[\u0e00-\u0e7f]/g },
  // The Lao Official Gazette publishes image-only scans -- one sampled at 1.09 MB carried zero
  // /Font and zero /ToUnicode -- so every Lao document reaches the pipeline through this pack.
  lo: { pack: 'lao', chars: /[\u0e80-\u0eff]/g },
  // legalinfo.mn serves some instruments as a scan pasted into the page -- a Finance Minister's
  // order, a six-page forestry procedure -- with no text beside it. The Cyrillic block is the
  // pack's evidence; the English pass has already declined the page by then.
  mn: { pack: 'mon', chars: /[\u0400-\u04ff]/g },
  // The Eurasian Economic Union's acts before 2015 are copier scans with no text layer (measured
  // 28 September 2026: no /Font), and the English pack read them as Latin gibberish.
  ru: { pack: 'rus', chars: /[\u0400-\u04ff]/g },
};

/** The characters of the script OCR reads for this language, or null where it reads none but English's. */
export function ocrScriptOf(language: string): RegExp | null {
  const script = SCRIPTS[language.toLowerCase().slice(0, 2)];
  return script ? new RegExp(script.chars.source, 'g') : null;
}

/** The packs to consult for an economy's languages. With none stated, Hindi, as before Thailand. */
function secondaryPacks(languages?: readonly string[]): { pack: Pack; chars: RegExp }[] {
  const wanted = (languages ?? ['hi']).map((l) => SCRIPTS[l.toLowerCase().slice(0, 2)]).filter((s) => s !== undefined);
  return wanted.length ? wanted : [SCRIPTS['hi']!];
}

/**
 * Put the packaged languages in one local directory because Tesseract accepts one langPath.
 * This is runtime data under backend/data, not a download and not a modification of node_modules.
 */
function localLanguageData(): string {
  const packs = [
    localRequire('@tesseract.js-data/eng') as LanguagePackage,
    localRequire('@tesseract.js-data/hin') as LanguagePackage,
    localRequire('@tesseract.js-data/tha') as LanguagePackage,
    localRequire('@tesseract.js-data/lao') as LanguagePackage,
    localRequire('@tesseract.js-data/mon') as LanguagePackage,
    localRequire('@tesseract.js-data/rus') as LanguagePackage,
  ];
  mkdirSync(TESSDATA_DIR, { recursive: true });
  mkdirSync(TESSERACT_CACHE, { recursive: true });
  for (const pack of packs) {
    const source = join(pack.langPath, `${pack.code}.traineddata${pack.gzip ? '.gz' : ''}`);
    const target = join(TESSDATA_DIR, `${pack.code}.traineddata${pack.gzip ? '.gz' : ''}`);
    if (!existsSync(source)) throw new Error(`packaged OCR language data is missing: ${source}`);
    if (!existsSync(target) || statSync(target).size !== statSync(source).size) copyFileSync(source, target);
  }
  return TESSDATA_DIR;
}

export async function createTesseractEngine(languages?: readonly string[]): Promise<OcrEngine> {
  const secondary = secondaryPacks(languages);
  const worker = await Tesseract.createWorker(['eng', ...secondary.map((s) => s.pack)], Tesseract.OEM.LSTM_ONLY, {
    langPath: localLanguageData(),
    cachePath: TESSERACT_CACHE,
    gzip: true,
  });
  // Loading both packs makes switching local and deterministic, but asking them to recognize the
  // same English page together changed "17." into "E" in the supplied procurement order. Start
  // with English and consult the economy's other scripts only when the English pass does not
  // look like English prose.
  const parametersAt = (dpi: number) => ({
    // Gazette and legislation scans are single-column pages. AUTO split the narrow paragraph-
    // number column from its headings ("11." through "20." arrived as a block of bare numbers),
    // while SINGLE_BLOCK preserved each number beside the provision it identifies.
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
    // What the page was actually rendered at, not a fixed "300" regardless of the render scale
    // the caller used -- a mismatched dpi is a lie the engine has no way to notice.
    user_defined_dpi: String(dpi),
  });
  // Tesseract's own convention for asking several languages of one pass, "tha+eng": already loaded
  // by createWorker above, so this never triggers a download, only a re-initialisation.
  const useLanguage = async (language: string): Promise<void> => {
    await worker.reinitialize(language);
  };
  await useLanguage('eng');
  const recognizeAt = async (image: Buffer, dpi: number): Promise<OcrRecognition> => {
    // reinitialize resets Tesseract's variables, so the layout assumptions are set fresh for
    // every recognition rather than surviving from whichever language was loaded last.
    await worker.setParameters(parametersAt(dpi));
    const result = await worker.recognize(image, {}, { text: true });
    return { text: result.data.text, confidence: result.data.confidence };
  };
  const recognizeWithFallback = async (image: Buffer, dpi: number): Promise<OcrRecognition> => {
    await useLanguage('eng');
    const english = await recognizeAt(image, dpi);
    const legalEnglish = (english.text.match(/\b(?:the|and|shall|act|rules?|order|government|section)\b/gi) ?? []).length;
    if (english.confidence >= 70 && legalEnglish >= 2) return english;

    let best = english;
    for (const script of secondary) {
      await useLanguage(script.pack);
      let other: OcrRecognition;
      try {
        other = await recognizeAt(image, dpi);
      } finally {
        await useLanguage('eng');
      }
      const found = (other.text.match(script.chars) ?? []).length;
      if (found >= 20 && other.confidence >= best.confidence - 10) best = other;
    }
    return best;
  };

  const engine: OcrEngine = {
    async recognize(image, _page, dpi = RENDER_DPI) {
      return recognizeWithFallback(image, dpi);
    },
    async recognizeCombined(image, _page, dpi = RETRY_RENDER_DPI) {
      if (secondary.length === 0) return recognizeWithFallback(image, dpi);
      const combined = [...new Set([...secondary.map((s) => s.pack), 'eng'])].join('+');
      await useLanguage(combined);
      try {
        return await recognizeAt(image, dpi);
      } finally {
        await useLanguage('eng');
      }
    },
    async close() {
      await worker.terminate();
    },
  };
  return engine;
}

function linesOf(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export async function ocrPdfPages(
  bytes: Buffer,
  pageNumbers: number[],
  suppliedEngine?: OcrEngine,
  languages?: readonly string[],
): Promise<OcrPage[]> {
  if (pageNumbers.length === 0) return [];
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const engine = suppliedEngine ?? (await createTesseractEngine(languages));
  const ownsEngine = suppliedEngine === undefined;
  const pages: OcrPage[] = [];

  const renderAt = async (page: Awaited<ReturnType<typeof doc.getPage>>, scale: number): Promise<Buffer> => {
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context as never, viewport, background: 'white' }).promise;
    return canvas.toBuffer('image/png');
  };

  try {
    for (const pageNumber of pageNumbers) {
      if (pageNumber < 1 || pageNumber > doc.numPages) continue;
      const page = await doc.getPage(pageNumber);
      let recognized = await engine.recognize(await renderAt(page, RENDER_SCALE), pageNumber, RENDER_DPI);
      // Below the shared floor, one retry: a render that actually reaches 300 dpi rather than the
      // 180 the first pass drew at, read with every one of the economy's own scripts alongside
      // English in a single pass rather than English first and a script tried only on its
      // failure. Whichever attempt reads better is kept -- a retry that reads worse is not a
      // reason to prefer it, and a genuine improvement is not thrown away for costing a second pass.
      if (recognized.confidence < OCR_MIN_CONFIDENCE) {
        const retried = await engine.recognizeCombined(await renderAt(page, RETRY_RENDER_SCALE), pageNumber, RETRY_RENDER_DPI);
        if (retried.confidence > recognized.confidence) recognized = retried;
      }
      pages.push({ page: pageNumber, lines: linesOf(recognized.text), confidence: recognized.confidence });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
    if (ownsEngine) await engine.close();
  }
  return pages;
}

/**
 * The narrowest page OCR is given. A scan published for the screen can be small: a Mongolian
 * minister's order came as a 460-pixel-wide JPEG, and read at that size it was 17% confidence
 * with no sentence of it right. Drawn at three times the size the same image read at 84%, every
 * point of the order word for word. Enlarging adds no detail, but the engine's models are trained
 * on letters the size a printed page has at 300 dpi, which is about what this width gives an A4 page.
 */
const MIN_WIDTH = 1400;
/** What `readable()`'s upscale approximates for an A4 page, and what it is honest to tell Tesseract. */
const IMAGE_DPI = 300;

/** An image enlarged to a readable width, on white: a transparent PNG would otherwise read as black. */
async function readable(image: Buffer): Promise<Buffer> {
  const img = await loadImage(image);
  const scale = Math.min(4, Math.max(1, MIN_WIDTH / img.width));
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = createCanvas(width, height);
  const paint = canvas.getContext('2d') as Paint;
  paint.imageSmoothingQuality = 'high';
  paint.fillStyle = 'white';
  paint.fillRect(0, 0, width, height);
  paint.drawImage(img, 0, 0, width, height);
  return canvas.toBuffer('image/png');
}

/** OCR for pages that are images already -- a scan a web page shows in place of its text. Image n is page n. */
export async function ocrImages(
  images: readonly Buffer[],
  languages?: readonly string[],
  suppliedEngine?: OcrEngine,
): Promise<OcrPage[]> {
  if (images.length === 0) return [];
  const engine = suppliedEngine ?? (await createTesseractEngine(languages));
  const pages: OcrPage[] = [];
  try {
    for (const [i, image] of images.entries()) {
      const recognized = await engine.recognize(await readable(image), i + 1, IMAGE_DPI);
      pages.push({ page: i + 1, lines: linesOf(recognized.text), confidence: recognized.confidence, text: recognized.text });
    }
  } finally {
    if (!suppliedEngine) await engine.close();
  }
  return pages;
}
