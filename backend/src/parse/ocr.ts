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
 * The scripts OCR can read besides English, by the language code a profile states: the Tesseract
 * pack, and the characters that show a page really is in that script. A page is only taken as one
 * of these if the pack finds its script on it -- the English pack reads Thai as Latin gibberish,
 * and before Thailand had a pack the Hindi one read a Thai notification as Devanagari.
 */
type Pack = 'hin' | 'tha' | 'lao' | 'rus' | 'mon';

const SCRIPTS: Record<string, { pack: Pack; chars: RegExp }> = {
  hi: { pack: 'hin', chars: /[\u0900-\u097f]/g },
  th: { pack: 'tha', chars: /[\u0e00-\u0e7f]/g },
  // The Lao Official Gazette publishes image-only scans -- one sampled at 1.09 MB carried zero
  // /Font and zero /ToUnicode -- so every Lao document reaches the pipeline through this pack.
  lo: { pack: 'lao', chars: /[\u0e80-\u0eff]/g },
  // The Eurasian Economic Union's acts before 2015 are copier scans with no text layer, and so are
  // some Mongolian laws. Without these packs the English one read both, as Latin gibberish.
  ru: { pack: 'rus', chars: /[\u0400-\u04ff]/g },
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
    localRequire('@tesseract.js-data/rus') as LanguagePackage,
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
