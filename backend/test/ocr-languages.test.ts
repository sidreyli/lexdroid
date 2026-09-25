/**
 * The OCR language packs, and that they are packaged rather than fetched.
 *
 * Lao PDR's Official Gazette publishes image-only scans -- one sampled at 1,087,136 bytes carried
 * zero /Font and zero /ToUnicode -- so every Lao document reaches the pipeline through OCR or not
 * at all. The stage was built for India and hardcoded to English and Hindi, which meant Lao could
 * be reached, registered and fetched and still produce nothing readable.
 *
 * Two properties are worth a test rather than a comment.
 *
 * The packs are npm dependencies copied into backend/data/ocr/tessdata at runtime, not downloads.
 * That is what lets Section 3 say the core pipeline runs with no proprietary API and what lets the
 * 30-minute clean-machine deployment work offline; a language added by fetching a .traineddata at
 * run time would break both quietly.
 *
 * And the fallback order has to stay cheap. An English page is answered by the first pass. A page
 * that reads as Hindi must never cost a Lao pass, or every Indian scan pays for Lao's presence.
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const localRequire = createRequire(import.meta.url);

interface LanguagePackage {
  code: string;
  gzip: boolean;
  langPath: string;
}

describe('the OCR language packs', () => {
  it('are declared as dependencies, so nothing is downloaded at run time', () => {
    for (const name of ['eng', 'hin', 'lao']) {
      const pack = localRequire(`@tesseract.js-data/${name}`) as LanguagePackage;
      expect({ name, code: pack.code }).toEqual({ name, code: name });
      const file = join(pack.langPath, `${pack.code}.traineddata${pack.gzip ? '.gz' : ''}`);
      expect(existsSync(file), `${name} pack resolves but ${file} is not on disk`).toBe(true);
    }
  });

  it('covers every script an economy profile says its law is published in', () => {
    // The point of the test: a profile can declare a language the OCR stage cannot read, and
    // nothing would say so until a scan of that economy came back empty. Scripts that need OCR
    // support are the non-Latin ones; Latin-script economies are served by the English pack.
    const needsOwnPack: Record<string, string> = {
      hi: 'hin',
      lo: 'lao',
      th: 'tha',
    };
    for (const [language, pack] of Object.entries(needsOwnPack)) {
      expect(() => localRequire(`@tesseract.js-data/${pack}`), `${language} has no OCR pack`).not.toThrow();
    }
  });

  /**
   * Mongolia and Russia are deliberately absent from the list above.
   *
   * Both write Cyrillic, and neither portal has yet been found serving a scan: legalinfo.mn
   * renders its documents as HTML and publication.pravo.gov.ru is server-rendered. Adding `rus`
   * and `mon` before a scan turns up would be building against a guess, which is what
   * docs/thailand-integration-plan.md's "what shouldn't be built speculatively" section warns
   * against. Both packs exist on npm at MIT if one does.
   */
  it('does not package a language no profile has yet needed', () => {
    const declared = localRequire('../package.json') as { dependencies: Record<string, string> };
    const packs = Object.keys(declared.dependencies).filter((d) => d.startsWith('@tesseract.js-data/'));
    expect(packs.sort()).toEqual([
      '@tesseract.js-data/eng',
      '@tesseract.js-data/hin',
      '@tesseract.js-data/lao',
      '@tesseract.js-data/tha',
    ]);
  });
});
