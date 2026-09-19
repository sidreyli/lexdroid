/**
 * An arrangement of sections whose Part headings the scan mangled.
 *
 * The parser collapses an Act's arrangement against the Act by keeping only the last copy of each
 * (Part, label). That only works when both copies were filed under the same Part, and the
 * arrangement's Part headings are the lines a scan most often breaks: "C hapter I" is not read as a
 * Chapter. The Finance (No. 2) Act 2023 kept 96 of its arrangement entries as sections with nothing
 * under them, ahead of the real ones -- 6,211 such sections across Malaysia, the ones a search can
 * return and a reader can cite for a provision whose text is somewhere else.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

const one = (text: string): boolean => text.trim().split('\n').length === 1;

describe('an arrangement entry filed under a different Part from its provision', () => {
  const built = sectionise([
    {
      page: 1,
      lines: ['ARRANGEMENT OF SECTIONS', 'C hapter III', '31. Amendment of Schedule 1', '32. Amendment of Schedule 3'],
    },
    {
      page: 9,
      lines: [
        'PART XI',
        'Amendment of Schedule 1',
        '31. Schedule 1 to the principal Act is amended by inserting after',
        'item 4 the following item.',
        'Amendment of Schedule 3',
        '32. Schedule 3 to the principal Act is amended by deleting item 7.',
        'and substituting the following item.',
      ],
    },
  ]);

  it('keeps the provision and drops the entry that pointed at it', () => {
    expect(built.sections.filter((s) => s.label === '31')).toHaveLength(1);
    expect(built.sections.filter((s) => s.label === '32')).toHaveLength(1);
    expect(built.sections.some((s) => one(s.text))).toBe(false);
    expect(built.sections.find((s) => s.label === '31')!.text).toContain('inserting after');
  });
});

describe('a one-line provision that shares its number with a later one', () => {
  // A code that restarts its numbering in each Part: this 2.1 is one line, and it is the provision.
  const built = sectionise([
    { page: 1, lines: ['PART 4 : BROADCASTING', '2.1 A broadcaster shall schedule content by its classification.'] },
    {
      page: 2,
      lines: ['PART 5 : CARRIERS', '2.1 A carrier is not liable for content it merely carries,', 'unless it knows of it.'],
    },
  ]);

  it('is kept, because its words are not repeated anywhere after it', () => {
    const texts = built.sections.map((s) => s.text).join('\n');
    expect(texts).toContain('A broadcaster shall schedule content');
    expect(texts).toContain('A carrier is not liable');
  });
});

describe('a list in a Schedule', () => {
  const built = sectionise([
    { page: 1, lines: ['1. Short title', 'This Act may be cited as the Example Act.', '2. Offence', 'No person shall advertise a cure.'] },
    { page: 2, lines: ['SCHEDULE', '1. Diseases of the kidney.', '2. Diseases of the heart.'] },
  ]);

  it('keeps its one-line entries, since nothing after them carries their numbers', () => {
    const texts = built.sections.map((s) => s.text).join('\n');
    expect(texts).toContain('Diseases of the kidney.');
    expect(texts).toContain('Diseases of the heart.');
  });
});
