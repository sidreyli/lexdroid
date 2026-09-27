/**
 * A Thai notification published as a PDF is cited by its clauses, "ข้อ ๘", as the OCS parser cites them.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

describe('the clauses of a Thai notification in a PDF', () => {
  const built = sectionise([
    {
      page: 1,
      lines: [
        'ประกาศกระทรวงดิจิทัลเพื่อเศรษฐกิจและสังคม',
        'ข้อ ๑ ประกาศนี้เรียกว่า “ประกาศกระทรวง”',
        'ข้อ ๘ ผู้ให้บริการต้องจัดให้มีระบบการพิสูจน์และยืนยันตัวตนทางดิจิทัล',
        'สำหรับผู้ใช้บริการทุกคน',
        'ข้อ ๑๒ ผู้ให้บริการต้องเก็บรักษาข้อมูลจราจรคอมพิวเตอร์',
      ],
    },
  ]);

  it('are sections of their own, labelled in the digits a citation uses', () => {
    expect(built.sections.map((s) => s.label)).toEqual(['ข้อ 1', 'ข้อ 8', 'ข้อ 12']);
    expect(built.sections.find((s) => s.label === 'ข้อ 8')!.text).toContain('สำหรับผู้ใช้บริการทุกคน');
  });

  it('are not opened by a line that only mentions a clause', () => {
    const b = sectionise([{ page: 1, lines: ['ข้อ ๑ ประกาศนี้', 'ตามที่กำหนดในข้อ ๕ ให้ผู้ให้บริการ'] }]);
    expect(b.sections.map((s) => s.label)).toEqual(['ข้อ 1']);
  });
});
