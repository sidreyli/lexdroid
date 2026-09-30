/**
 * `pdf.ts`'s OCR acceptance gated on confidence, not just character count.
 *
 * `ocrReplacesThePage` compared only lengths, so a page OCR read at 22% confidence was accepted
 * exactly as one read at 85% would be, provided it yielded more legible characters than the
 * unreadable original -- measured against three Mongolian licensing orders in
 * bench-pack/lexdroid.bench-mng.db (doc#4957, #10186, #10990; confidence 22, 34, 26) that went
 * through this path rather than `legalinfo.ts`'s own gated one, on 30 September 2026. The floor
 * is shared with `legalinfo.ts`'s `SCAN_MIN_CONFIDENCE` via `OCR_MIN_CONFIDENCE`, so a scan is
 * held to the same bar whichever parser reads it.
 */
import { describe, expect, it } from 'vitest';
import { ocrReplacesThePage } from '../src/parse/pdf.js';
import { OCR_MIN_CONFIDENCE } from '../src/parse/ocr.js';

describe('OCR acceptance below the shared confidence floor', () => {
  it('refuses a sparse page that reads long but unconfidently', () => {
    const scanned = 'Act 589';
    const long = 'A'.repeat(200);
    // Long enough and clean enough to pass on the old, length-only test.
    expect(ocrReplacesThePage('sparse', scanned, long, 99)).toBe(true);
    // The same reading, at a Mongolian scan's own measured confidence, is refused.
    expect(ocrReplacesThePage('sparse', scanned, long, 26)).toBe(false);
    expect(ocrReplacesThePage('sparse', scanned, long, OCR_MIN_CONFIDENCE - 1)).toBe(false);
    expect(ocrReplacesThePage('sparse', scanned, long, OCR_MIN_CONFIDENCE)).toBe(true);
  });

  it('refuses a damaged page recovered unconfidently, even though it reads clean', () => {
    const before = 'date of publication in the Gazette ... \u0018\u00185 october \u0018998';
    const after = 'Date of publication in the Gazette 15 October 1998';
    expect(ocrReplacesThePage('damaged', before, after, 80)).toBe(true);
    expect(ocrReplacesThePage('damaged', before, after, 30)).toBe(false);
  });

  it('refuses an unscripted-page recovery below the floor', () => {
    const legacyFont =
      "c~i2sj c5u ,~ @'l:1JscmsJJm1J{iimiJrnc;Sn tr1sDn; L1J~sJmiJm1J{iimiJcsc;Sn tnsDn @~1J~ns1Jsu cc;J~ ~j~.1.J1J°c";
    const lao =
      'ມາດຕາ 1 ຈຸດປະສົງ ດຳລັດສະບັບນີ້ ກຳນົດຫຼັກການ, ລະບຽບການ ແລະ ມາດຕະການ ກ່ຽວກັບການຄຸ້ມຄອງ ການຄ້າທາງເອເລັກໂຕຣນິກ ເພື່ອເຮັດໃຫ້ການຄ້າທາງເອເລັກໂຕຣນິກ';
    expect(ocrReplacesThePage('unscripted', legacyFont, lao, 80)).toBe(true);
    expect(ocrReplacesThePage('unscripted', legacyFont, lao, 10)).toBe(false);
  });

  it('defaults to accepting on the character-count tests alone when no confidence is given', () => {
    // Callers -- and the rest of this file's sibling test, parse-corrupt-text-layer.test.ts -- that
    // judge a reading with no Tesseract confidence at all must see exactly the old behaviour.
    expect(ocrReplacesThePage('sparse', 'Act 589', 'A'.repeat(200))).toBe(true);
  });
});
