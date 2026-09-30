/**
 * A code of practice restarts its numbering in every Part.
 *
 * The parser drops every copy of a provision label but the last, which is how an Act's arrangement
 * of sections is collapsed against the Act. An Act numbers its sections once through the whole
 * statute, so that is safe there. A code of practice numbers clause 2.1 in each of its ten Parts,
 * and the rule kept one of them.
 *
 * The Malaysian Communications and Multimedia Content Code 2022 came out of this as 103 sections
 * of a 74-page code -- Part 5 reduced to a single stub clause, Part 7 gone entirely, and 56,036
 * characters stored where the document holds 153,635. Part 5 clause 2.1 is the innocent carrier
 * rule, and it is the provision Malaysia's 8.2 turns on, so the cell was unanswerable from
 * a document the corpus supposedly held. With the Part in the key: 324 sections and 134,577
 * characters.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

describe('a document that restarts its numbering in each Part', () => {
  // Shaped like the Content Code: the same clause numbers under different Parts.
  const pages = [
    {
      page: 1,
      lines: [
        'PART 4 : SPECIFIC BROADCASTING',
        '2.1 A broadcaster shall schedule content according to the classification it carries.',
      ],
    },
    {
      page: 2,
      lines: [
        'PART 5 : SPECIFIC ONLINE GUIDELINES',
        '2.1 Code Subjects providing Access to any Content but have neither control over the',
        'composition of such Content nor any knowledge of such Content is deemed an innocent',
        'carrier for the purposes of this Code. An innocent carrier is not responsible for the',
        'Content provided.',
      ],
    },
    {
      page: 3,
      lines: [
        'PART 6 : SPECIFIC AUDIOTEXT HOSTING SERVICE GUIDELINES',
        '2.1 An audiotext hosting service provider shall verify the age of its subscribers.',
      ],
    },
  ];
  const built = sectionise(pages);

  it('keeps clause 2.1 of every Part, not only the last one', () => {
    const clauses = built.sections.filter((s) => s.label === '2.1');
    expect(clauses).toHaveLength(3);
  });

  it('keeps the rule the cell turns on, which was the copy being dropped', () => {
    const online = built.sections.find((s) => s.headingPath.startsWith('PART 5'));
    // The parser keeps the document's own line breaks, so the rule is matched on its words.
    expect(online?.text.replace(/\s+/g, ' ')).toContain('is not responsible for the Content provided');
  });

  it('files each copy under the Part it belongs to', () => {
    const parts = built.sections.filter((s) => s.label === '2.1').map((s) => s.headingPath.split(' > ')[0]);
    expect(parts).toEqual([
      'PART 4 : SPECIFIC BROADCASTING',
      'PART 5 : SPECIFIC ONLINE GUIDELINES',
      'PART 6 : SPECIFIC AUDIOTEXT HOSTING SERVICE GUIDELINES',
    ]);
  });

  it('holds the offset invariant across the Parts', () => {
    for (const s of built.sections) expect(built.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
});

describe('an arrangement of sections that repeats its Part headings', () => {
  // The reason the Part can go in the key at all: a Laws of Malaysia reprint prints its Part
  // headings in the arrangement as well as in the body, so both copies share a key and collapse.
  const pages = [
    {
      page: 1,
      lines: ['ARRANGEMENT OF SECTIONS', 'PART I : PRELIMINARY', '1. Short title', 'PART II : DUTIES', '12. Duty to notify'],
    },
    { page: 2, lines: ['PART I : PRELIMINARY', '1. This Act may be cited as the Test Act 2019.'] },
    { page: 3, lines: ['PART II : DUTIES', '12. A licensee shall notify the Commission within seven days.'] },
  ];
  const built = sectionise(pages);

  it('still indexes each provision once, from the copy that has a body', () => {
    expect(built.sections.filter((s) => s.label === '1')).toHaveLength(1);
    expect(built.sections.filter((s) => s.label === '12')).toHaveLength(1);
    expect(built.sections.find((s) => s.label === '12')?.text).toContain('within seven days');
  });
});
