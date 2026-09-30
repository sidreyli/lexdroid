/**
 * A PDF text layer that reports characters the page does not have.
 *
 * pdf.js says what the font's ToUnicode map tells it. In Malaysia's AGC reprints one embedded font
 * maps the "1" glyph *and* the "2" glyph to U+0018, so the Malaysian Communications and Multimedia
 * Commission Act's contents page reads 10, 11, 11, 13, 14, 15 where the Act prints 10 to 15, and
 * its section 4 opens "4. ( )". Two digits arriving as one codepoint cannot be repaired by
 * substitution -- the run "( )" gives no way to know which digit is gone -- and the damage is not
 * cosmetic: `PROVISION_LINE` cannot see a section number beginning with a control byte, so those
 * sections were stored with no label and no quote of them could be matched.
 *
 * 403 pages across 23 Malaysian PDFs carry it, including 49 of the Communications and Multimedia
 * Act 1998 and 32 of the Commission Act -- the two instruments four of Malaysia's cells turn on.
 * The glyphs are drawn correctly; only the map from glyph to character is wrong. So the page is
 * rendered and read, as a page with no text layer at all is: OCR returns "23 September 1998" where
 * the text layer offers the same codepoint for both digits.
 */
import { describe, expect, it } from 'vitest';
import { hasCorruptTextLayer, isInAnotherScript, ocrReplacesThePage } from '../src/parse/pdf.js';

// The Commission Act's own commencement line, as pdf.js reports it and as the page prints it.
const AS_REPORTED = 'date of Royal assent \u0018\u00183 september \u0018998';
const AS_PRINTED = 'Date of Royal Assent 23 September 1998';

describe('a text layer reporting characters the page does not have', () => {
  it('is detected by the control characters no statute contains', () => {
    expect(hasCorruptTextLayer([AS_REPORTED])).toBe(true);
    expect(hasCorruptTextLayer([AS_PRINTED])).toBe(false);
  });

  it('does not call ordinary punctuation, tabs or line breaks damage', () => {
    expect(hasCorruptTextLayer(['“A licensee shall—', '\t(a) be a company;', '\r\n(b) pay the fee.'])).toBe(false);
  });

  it('takes a clean reading that carries as much of the page, though it is shorter', () => {
    // OCR drops the dot leaders the text layer counts, so the recovery is shorter in characters
    // and longer in the ones that mean anything. Length is the wrong question for a damaged page.
    const before = 'date of publication in the Gazette ... … … … \u0018\u00185 october \u0018998';
    expect(before.length).toBeGreaterThan(AS_PRINTED.length);
    expect(ocrReplacesThePage('damaged', before, 'Date of publication in the Gazette 15 October 1998')).toBe(true);
  });

  it('holds a reading that lost the page, however clean it came back', () => {
    // The Commission Act's cover is a logo, and OCR reads it as "LEE) B / £1:1 0.4%". The text
    // layer had the Act's name on it and one stray control byte; that is still the better reading.
    expect(ocrReplacesThePage('damaged', '\u0018Malaysian Communications and Multimedia Commission', 'LEE) B £1:1 0.4%')).toBe(false);
  });

  it('holds a reading that is still damaged, because it has not read the page either', () => {
    expect(ocrReplacesThePage('damaged', AS_REPORTED, `${AS_PRINTED} \u0018`)).toBe(false);
  });

  it('leaves the sparse page to the test it always had: longer, and a page at all', () => {
    const scanned = 'Act 589';
    expect(ocrReplacesThePage('sparse', scanned, 'too short to be a page')).toBe(false);
    expect(ocrReplacesThePage('sparse', scanned, 'A'.repeat(200))).toBe(true);
    // And a sparse page is never replaced by something no longer than it already had.
    expect(ocrReplacesThePage('sparse', 'B'.repeat(300), 'C'.repeat(300))).toBe(false);
  });
});

describe('a text layer in Latin letters on a page printed in another script', () => {
  // The Decree on Electronic Commerce, as its pre-Unicode Lao font reports it, a line at a time.
  const LEGACY_FONT = [
    "c~i2sj c5u ,~ @'l:1JscmsJJm1J{iimiJrnc;Sn tr1sDn; L1J~sJmiJm1J{iimiJcsc;Sn tnsDn @~1J~ns1Jsu cc;J~ ~j~.1.J1J°c",
    "airniavuuf,n Uvqrfitlvtm Uvqr{uam fiufiuru Genualn tlvqrfiuv EluiayuvSn rJvqrff rJvtn r_/vqrQuaro Sufforru",
  ];
  const ENGLISH = [
    'Article 16 Personal data may be disclosed to a third party at the request of the competent State organisation',
    'as provided by the law, and the data controller shall inform the owner of the data of the disclosure.',
  ];

  it('is detected in an economy that publishes in Lao', () => {
    expect(isInAnotherScript(LEGACY_FONT, ['lo'])).toBe(true);
  });

  it('leaves an English translation in the same corpus alone', () => {
    expect(isInAnotherScript(ENGLISH, ['lo'])).toBe(false);
  });

  it('leaves a page that is in the script alone', () => {
    expect(isInAnotherScript(['ມາດຕາ 16 ການເປີດເຜີຍຂໍ້ມູນສ່ວນບຸກຄົນ ໃຫ້ພາກສ່ວນທີສາມ', ...LEGACY_FONT.slice(0, 1)], ['lo'])).toBe(false);
  });

  it('is never asked of an economy that publishes in a language OCR cannot read, or in English', () => {
    expect(isInAnotherScript(LEGACY_FONT, ['en'])).toBe(false);
    // Not Russian any more: its pack came with the Eurasian Economic Union's scans.
    expect(isInAnotherScript(LEGACY_FONT, ['ko'])).toBe(false);
    expect(isInAnotherScript(LEGACY_FONT, ['lo', 'en'])).toBe(false);
    expect(isInAnotherScript(LEGACY_FONT, undefined)).toBe(false);
  });

  it('takes the OCR reading only when it comes back in a script other than Latin', () => {
    const lao = 'ມາດຕາ 1 ຈຸດປະສົງ ດຳລັດສະບັບນີ້ ກຳນົດຫຼັກການ, ລະບຽບການ ແລະ ມາດຕະການ ກ່ຽວກັບການຄຸ້ມຄອງ ການຄ້າທາງເອເລັກໂຕຣນິກ ເພື່ອເຮັດໃຫ້ການຄ້າທາງເອເລັກໂຕຣນິກ';
    expect(ocrReplacesThePage('unscripted', LEGACY_FONT.join(' '), lao)).toBe(true);
    // An English page it was wrong to doubt comes back English, and the text layer stays.
    expect(ocrReplacesThePage('unscripted', ENGLISH.join(' '), ENGLISH.join(' '))).toBe(false);
    expect(ocrReplacesThePage('unscripted', LEGACY_FONT.join(' '), 'ມາດຕາ 1')).toBe(false);
  });
});
