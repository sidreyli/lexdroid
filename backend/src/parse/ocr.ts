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
 * Put every packaged language in one local directory because Tesseract accepts one langPath.
 * This is runtime data under backend/data, not a download and not a modification of node_modules.
 */
function localLanguageData(): string {
  const packs = [
    localRequire('@tesseract.js-data/eng') as LanguagePackage,
    localRequire('@tesseract.js-data/hin') as LanguagePackage,
    localRequire('@tesseract.js-data/lao') as LanguagePackage,
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

/**
 * The non-English packs, and what it takes to prefer one over the English pass.
 *
 * Tried in order and only while the one before it has not answered, so a page that reads as
 * Hindi never costs a Lao pass. An English page costs neither: it is answered by the first pass
 * and returns before any of this.
 *
 * Lao is here because the Lao Official Gazette publishes image-only scans -- one sampled at
 * 1.09 MB carried zero /Font and zero /ToUnicode -- so every Lao document reaches the pipeline
 * through this stage or not at all.
 */
const FALLBACK_LANGUAGES: { code: 'hin' | 'lao'; script: RegExp; minCharacters: number }[] = [
  { code: 'hin', script: /[ऀ-ॿ]/g, minCharacters: 20 },
  { code: 'lao', script: /[຀-໿]/g, minCharacters: 20 },
];

export async function createTesseractEngine(): Promise<OcrEngine> {
  const worker = await Tesseract.createWorker(['eng', 'hin', 'lao'], Tesseract.OEM.LSTM_ONLY, {
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
  const useLanguage = async (language: 'eng' | 'hin' | 'lao'): Promise<void> => {
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

      // Not English, so ask the other packs in turn and stop at the first that answers in its own
      // script. A page that reads as Hindi never costs a Lao pass, and an English page reached
      // none of this.
      for (const { code, script, minCharacters } of FALLBACK_LANGUAGES) {
        await useLanguage(code);
        let attempt: OcrRecognition;
        try {
          attempt = await recognize(image);
        } finally {
          await useLanguage('eng');
        }
        const inScript = (attempt.text.match(script) ?? []).length;
        // The script has to actually be there, and the pass must not be markedly worse than the
        // English one -- a wrong pack on an English page produces confident nonsense.
        if (inScript >= minCharacters && attempt.confidence >= english.confidence - 10) return attempt;
      }
      return english;
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
