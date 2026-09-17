/**
 * A tariff code is written like a clause, and is not one.
 *
 * `DECIMAL_PROVISION_LINE` exists for Indian notifications that number a paragraph "12.5
 * Definitions" with no second dot. A Harmonised System code has exactly that shape -- "0705.29.00
 * 00 - - Other" -- so every line of every customs and sales tax schedule was stored as a provision
 * of its own. Measured on 18 September 2026, Malaysia's corpus held 31,812 of them: 36% of the
 * economy, in nine orders, one of which minted 5,224 "provisions" with 92% of them under 200
 * characters.
 *
 * That is not a harmless surplus. Retrieval's depth is denominated in provisions, so a corpus
 * diluted with table rows spends its reading budget on them: Malaysia's mean provision fell from
 * 859 characters to 537, and the engine was put in front of 61% less text than before.
 *
 * The rows are not deleted. They stay in the document and remain searchable as part of the section
 * they sit under. What they stop being is a rule that can be retrieved and cited on its own.
 */
import { describe, expect, it } from 'vitest';
import { sectionise, type PageText } from '../src/parse/pdf.js';

function pages(lines: string[]): PageText[] {
  return [{ page: 1, lines, language: 'en' }];
}
const labels = (ls: string[]): (string | null)[] => sectionise(pages(ls)).sections.map((s) => s.label);

describe('a schedule of tariff codes', () => {
  it('does not mint a provision for a code with a leading zero', () => {
    const got = labels([
      'PART I RATES OF DUTY',
      '0705.29.00 00 - - Other',
      '0705.40.00 00 - Witloof chicory',
      '05.11 Animal products not elsewhere specified',
    ]);
    expect(got).not.toContain('0705.29');
    expect(got).not.toContain('05.11');
  });

  it('does not mint a provision for a bare figure in a price schedule', () => {
    // The price control orders print a column of bare numbers: "0.41", "3.00".
    expect(labels(['SCHEDULE', '0.41', '3.00'])).not.toContain('0.41');
  });

  it('does not mint a provision for an HS heading and subheading', () => {
    expect(labels(['6811.82 - - Other sheets, panels, tiles'])).not.toContain('6811.82');
  });

  it('keeps a real clause numbered with a decimal', () => {
    // The reason DECIMAL_PROVISION_LINE is there at all, and the reason the Content Code parses.
    expect(labels(['12.5 Definitions', 'In this notification, unless the context otherwise requires'])).toContain('12.5');
    expect(labels(['2.1 An innocent carrier is not responsible for the Content provided.'])).toContain('2.1');
  });

  it('folds an HS heading into the rows it heads, rather than standing alone', () => {
    const ls = [
      '2208. - Undenatured ethyl alcohol',
      '2208.20 - Spirits obtained by distilling grape wine',
      '2208.30 - Whiskies',
    ];
    const built = sectionise(pages(ls));
    expect(built.sections.map((s) => s.label)).not.toContain('2208');
    // The words are still in the document: the heading names what the rows below it are.
    expect(built.text).toContain('Undenatured ethyl alcohol');
  });

  it('keeps a four-digit section that heads nothing', () => {
    // Australia's Corporations Act has a section 1274 and the Social Security Act a section 1190.
    // No label shape tells those from an HS heading; the document does, because a statute with a
    // section 1274 has no section 1274.2 and a tariff schedule always does.
    const ls = [
      '1274. Registers',
      '(1) ASIC must, subject to this Act, keep such registers as it considers necessary.',
      '1275. Inspection of registers',
    ];
    expect(labels(ls)).toContain('1274');
  });

  it('keeps the text of a schedule even where no row is a provision', () => {
    const ls = ['PART II SCHEDULE OF RATES', '0705.29.00 00 - - Other', '0705.40.00 00 - Witloof chicory'];
    const text = sectionise(pages(ls)).text;
    expect(text).toContain('Witloof chicory');
  });
});
