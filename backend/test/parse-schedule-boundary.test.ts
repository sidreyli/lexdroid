/**
 * A Schedule restarts the numbering, and it is a container as a Part is.
 *
 * The parser keeps the last copy of each (Part, label) -- that is how an Act's arrangement of
 * sections collapses against the Act. With no Schedule boundary, a Schedule's "1." and the Act's
 * section 1 are the same key, and the Schedule wins: the Medicines (Advertisement and Sale) Act
 * 1956 lost sections 1 to 6, its offences among them, to the Schedule's list of diseases.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

const act = [
  {
    page: 1,
    lines: ['ARRANGEMENT OF SECTIONS', 'Section', '1. Short title', '2. Offence', 'SCHEDULE'],
  },
  { page: 2, lines: ['LAWS OF MALAYSIA', 'Act 290'] },
  {
    page: 3,
    lines: [
      'An Act to prohibit certain advertisements relating to medical matters.',
      'Short title',
      '1. This Act may be cited as the Medicines Act 1956.',
      'Offence',
      '2. No person shall advertise a cure for a disease specified',
      'in the Schedule.',
      'Schedule',
      '3. The Minister may amend the Schedule by order in the Gazette',
      'published for that purpose.',
    ],
  },
  { page: 4, lines: ['SCHEDULE', '[Section 2]', '1. Diseases of the kidney.', '2. Diseases of the heart.'] },
  { page: 5, lines: ['SCHEDULE', '3. Diabetes.'] },
];

describe('an Act whose Schedule numbers its entries from 1', () => {
  const built = sectionise(act);
  const texts = built.sections.map((s) => s.text).join('\n');

  it("keeps the Act's own sections 1 and 2", () => {
    expect(texts).toContain('may be cited as the Medicines Act 1956');
    expect(texts).toContain('No person shall advertise a cure');
  });

  it("keeps the Schedule's entries, filed under the Schedule", () => {
    const kidney = built.sections.find((s) => s.text.includes('Diseases of the kidney'))!;
    expect(kidney.headingPath.startsWith('SCHEDULE')).toBe(true);
  });

  it('gives the Schedule a section of its own, so its heading text is searchable', () => {
    expect(built.sections.some((s) => s.label === null && s.text.includes('[Section 2]'))).toBe(true);
  });

  it('reads a "Schedule" marginal note as the heading of the section under it, not a Schedule', () => {
    const s3 = built.sections.find((s) => s.label === '3' && s.text.includes('The Minister may amend'))!;
    expect(s3.headingPath.startsWith('SCHEDULE')).toBe(false);
  });

  it("treats the Schedule's name at the head of its next page as a running header", () => {
    expect(built.sections.filter((s) => s.label === null && s.text.trim() === 'SCHEDULE')).toHaveLength(0);
    expect(texts).toContain('Diabetes.');
  });

  it("does not make a section of the arrangement's closing SCHEDULE and the cover after it", () => {
    expect(built.sections.some((s) => s.text.includes('Act 290'))).toBe(false);
  });
});
