/**
 * An Indian notification leaves its first paragraph unnumbered and numbers the rest from 2.
 *
 * The paragraph that names the goods and says "hereby imposes" was filed as front matter, which no
 * search reaches, and the duty column's wrapped "75.72%" opened a provision 75 in the middle of the
 * table. CBIC's notice imposing anti-dumping duty on printed circuit boards came out as five
 * fragments of its table and its duration clause, and indicator 1.4 never found it.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

describe('a notification whose numbering starts at 2', () => {
  const built = sectionise([
    {
      page: 1,
      lines: [
        'GOVERNMENT OF INDIA',
        'NOTIFICATION',
        "G.S.R. (E).- Whereas in the matter of `Printed Circuit Boards (PCB)' (hereinafter referred to as the",
        'subject goods) originating in, or exported from China PR,',
        'the Central Government hereby imposes on the subject goods an anti-dumping duty, namely:-',
        'TABLE',
        'China PR Any country Kinwong Electronic Technology Co., Ltd.',
        '75.72% including China PR',
        '8.23% Shenzhen Xinweisai Electronics Co., Ltd.',
        '2. The anti-dumping duty imposed under this notification shall be effective for a period of five years',
        'from the date of publication of this notification in the Official Gazette.',
      ],
    },
  ]);

  it('keeps the unnumbered first paragraph as a section of its own', () => {
    const first = built.sections[0]!;
    expect(first.label).toBeNull();
    expect(first.text).toContain('hereby imposes');
    expect(first.text).toContain('Printed Circuit Boards');
  });

  it('does not read a percentage as a provision number', () => {
    expect(built.sections.map((s) => s.label)).toEqual([null, '2']);
    expect(built.sections[0]!.text).toContain('75.72%');
  });
});

describe('a document that has its own paragraph 1', () => {
  const built = sectionise([
    { page: 1, lines: ['THE GAZETTE', '1. Short title.', 'This Act may be cited as the Act.', '2. Definitions.', 'In this Act, words mean things.'] },
  ]);

  it('keeps what comes before it as front matter', () => {
    expect(built.sections.map((s) => s.label)).toEqual(['1', '2']);
  });
});
