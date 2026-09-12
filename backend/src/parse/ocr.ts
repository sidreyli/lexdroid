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
const { createCanvas } = pdfRequire('@napi-rs/canvas') as {
  createCanvas(width: number, height: number): {
    getContext(type: '2d'): unknown;
    toBuffer(type: 'image/png'): Buffer;
  };
};

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
}

/**
 * Put both packaged languages in one local directory because Tesseract accepts one langPath.
 * This is runtime data under backend/data, not a download and not a modification of node_modules.
 */
function localLanguageData(): string {
  const packs = [
    localRequire('@tesseract.js-data/eng') as LanguagePackage,
    localRequire('@tesseract.js-data/hin') as LanguagePackage,
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

export async function createTesseractEngine(): Promise<OcrEngine> {
  const worker = await Tesseract.createWorker(['eng', 'hin'], Tesseract.OEM.LSTM_ONLY, {
    langPath: localLanguageData(),
    cachePath: TESSERACT_CACHE,
    gzip: true,
  });
  // Loading both packs makes switching local and deterministic, but asking them to recognize the
  // same English page together changed "17." into "E" in the supplied procurement order. Start
  // with English and consult Hindi only when the English pass does not look like English prose.
  const parameters = {
    // Gazette and legislation scans are single-column pages. AUTO split the narrow paragraph-
    // number column from its headings ("11." through "20." arrived as a block of bare numbers),
    // while SINGLE_BLOCK preserved each number beside the provision it identifies.
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
  };
  const useLanguage = async (language: 'eng' | 'hin'): Promise<void> => {
    await worker.reinitialize(language);
    // reinitialize resets Tesseract's variables, so keep the document-layout assumptions stable
    // after every English/Hindi switch.
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

      await useLanguage('hin');
      let hindi: OcrRecognition;
      try {
        hindi = await recognize(image);
      } finally {
        await useLanguage('eng');
      }
      const devanagari = (hindi.text.match(/[\u0900-\u097f]/g) ?? []).length;
      return devanagari >= 20 && hindi.confidence >= english.confidence - 10 ? hindi : english;
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
): Promise<OcrPage[]> {
  if (pageNumbers.length === 0) return [];
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;
  const engine = suppliedEngine ?? (await createTesseractEngine());
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
