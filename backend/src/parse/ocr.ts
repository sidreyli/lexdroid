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
const RENDER_SCALE = 2.5;
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
  recognize(image: Buffer, page: number): Promise<OcrRecognition>;
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
type Pack = 'hin' | 'tha' | 'lao' | 'mon';

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
};

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
  const parameters = {
    // Gazette and legislation scans are single-column pages. AUTO split the narrow paragraph-
    // number column from its headings ("11." through "20." arrived as a block of bare numbers),
    // while SINGLE_BLOCK preserved each number beside the provision it identifies.
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  };
  const useLanguage = async (language: 'eng' | Pack): Promise<void> => {
    await worker.reinitialize(language);
    // reinitialize resets Tesseract's variables, so keep the document-layout assumptions stable
    // after every language switch.
    await worker.setParameters(parameters);
  };
  await useLanguage('eng');
  const recognize = async (image: Buffer): Promise<OcrRecognition> => {
    const result = await worker.recognize(image, {}, { text: true });
    return { text: result.data.text, confidence: result.data.confidence };
  };
  return {
    async recognize(image) {
      const english = await recognize(image);
      const legalEnglish = (english.text.match(/\b(?:the|and|shall|act|rules?|order|government|section)\b/gi) ?? []).length;
      if (english.confidence >= 70 && legalEnglish >= 2) return english;

      let best = english;
      for (const script of secondary) {
        await useLanguage(script.pack);
        let other: OcrRecognition;
        try {
          other = await recognize(image);
        } finally {
          await useLanguage('eng');
        }
        const found = (other.text.match(script.chars) ?? []).length;
        if (found >= 20 && other.confidence >= best.confidence - 10) best = other;
      }
      return best;
    },
    async close() {
      await worker.terminate();
    },
  };
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

  try {
    for (const pageNumber of pageNumbers) {
      if (pageNumber < 1 || pageNumber > doc.numPages) continue;
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');
      await page.render({
        canvasContext: context as never,
        viewport,
        background: 'white',
      }).promise;
      const recognized = await engine.recognize(canvas.toBuffer('image/png'), pageNumber);
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
      const recognized = await engine.recognize(await readable(image), i + 1);
      pages.push({ page: i + 1, lines: linesOf(recognized.text), confidence: recognized.confidence, text: recognized.text });
    }
  } finally {
    if (!suppliedEngine) await engine.close();
  }
  return pages;
}
