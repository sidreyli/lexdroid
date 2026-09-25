/**
 * A clause numbered through more than two levels.
 *
 * `PROVISION_LINE` asks for digits, a dot and a non-space, so "8.2.1.1 A company incorporated
 * under..." answered with the label "8" -- and so did 8.1.1, 8.2.1 and every other clause of a
 * chapter numbered this way. All of them keyed as section 8, and the rule that collapses an
 * arrangement of sections against the provisions it lists kept the last and dropped the rest. What
 * it drops is each clause's own first line, the one carrying the subject, so MYNIC's Registrant
 * Policy kept "Companies Act 2016, as the case may be;" and lost "8.2.1.1 A company incorporated
 * under the Companies Act 1965 or the": the criteria deciding who may hold a .my domain read as a
 * list of statute names with no rule attached, and indicator 12.7 had nothing to cite.
 *
 * Measured over 168 documents of the three economies: 223,868 characters recovered across 24 of
 * them, none lost. One Singapore guideline went from 4,338 characters to 67,056.
 */
import { describe, expect, it } from 'vitest';
import { sectionise } from '../src/parse/pdf.js';

describe('a clause numbered through more than two levels', () => {
  const built = sectionise([
    {
      page: 1,
      lines: [
        '8. Eligibility Criteria for .My Domain Name (2LD & 3LD)',
        '8.1 Eligibility Criteria Applicable to .MY 2LD',
        '8.1.1 The registration of .my 2LD is open to all individuals or entities from any',
        'country with no geographic restriction.',
        '8.2 Eligibility Criteria for Third Level Domain Name (3LD)',
        '8.2.1.1 A company incorporated under the Companies Act 1965 or the',
        'Companies Act 2016, as the case may be;',
        '8.2.1.2 A business registered with the Registrar of Business pursuant to the',
        'Registration of Businesses Act 1956;',
      ],
    },
  ]);
  const labels = built.sections.map((s) => s.label);

  it('carries its whole number, not its first one', () => {
    expect(labels).toContain('8.1.1');
    expect(labels).toContain('8.2.1.1');
    expect(labels).toContain('8.2.1.2');
  });

  it('keeps the line that carries the clause its subject', () => {
    const text = built.text;
    expect(text).toContain('A company incorporated under the Companies Act 1965');
    expect(text).toContain('A business registered with the Registrar of Business');
    // The continuation stays with the clause it continues, rather than adrift with no label.
    const company = built.sections.find((s) => s.label === '8.2.1.1');
    expect(company?.text).toContain('Companies Act 2016, as the case may be;');
  });

  it('no longer collapses a chapter onto the label of its own heading', () => {
    // Every one of these keyed as "8" before, so only the last of them survived whole.
    expect(labels.filter((l) => l === '8')).toHaveLength(1);
  });
});

describe('a dotted number that is a date', () => {
  // The schedule of entities designated under Malaysia's anti-terrorism financing order gives each
  // person's date of birth a column of its own. Read as a clause number, "13.2.1975" opened a
  // provision in the middle of the table and pushed 4,139 characters of it out.
  const built = sectionise([
    {
      page: 1,
      lines: [
        '3. The following entities are designated.',
        '8. KDN.I.30-2014 Anas Faizal bin Abdul Malek',
        '13.2.1975 - - Malaysia A3610171 Mengambil bahagian dalam pelakuan',
        'suatu perbuatan keganasan',
      ],
    },
  ]);

  it('is not a provision', () => {
    expect(built.sections.map((s) => s.label)).not.toContain('13.2.1975');
    expect(built.text).toContain('13.2.1975 - - Malaysia A3610171');
  });
});
