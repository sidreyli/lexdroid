/**
 * A PDF guesses its own name from the line it repeats on its own pages, and a table repeated down
 * three pages repeats its lines too. A registry's policy lists its domain categories, one per row,
 * and "pursuant to the Universities and University Colleges Act 1971;" was taken for the running
 * header -- so the document was registered under a clause about somebody else's statute.
 *
 * What is wrong with it is not the Act it names but that it is not a name.
 */
import { describe, expect, it } from 'vitest';
import { ownName, readsAsAClause } from '../src/parse/identity.js';
import { runningHeader } from '../src/parse/pdf.js';

const page = (n: number, lines: string[]) => ({ page: n, lines, language: 'en' as const });

describe('a title that is a piece of a sentence', () => {
  it('knows a clause by the word it opens on', () => {
    for (const t of [
      'pursuant to the Universities and University Colleges Act 1971',
      'under the Broadcasting Act',
      'in exercise of the powers conferred by section 6 of the Act',
      'notwithstanding anything in these Regulations',
      'and the Rules made under it',
    ]) {
      expect(readsAsAClause(t), t).toBe(true);
    }
  });

  it('knows one by the punctuation that continues the sentence', () => {
    expect(readsAsAClause('alteration unless otherwise specified in these Guidelines;')).toBe(true);
    expect(readsAsAClause('Environment (Protection) Rules, 1986,')).toBe(true);
  });

  it('leaves a title that carries a relative clause, because that is a noun phrase', () => {
    // Seven Australian instruments are named this way. A verb of obligation was tried as a third
    // mark of a clause and withdrawn: it caught these and nothing else.
    expect(
      readsAsAClause('Therapeutic Goods (Medical Devices--Information that Must Accompany Application)'),
    ).toBe(false);
    expect(readsAsAClause('Yang di-Pertuan Agong (Exercise of Functions) Act 1957')).toBe(false);
  });

  it('leaves a real title alone, including one that opens on an article', () => {
    for (const t of [
      'Registrant Policy',
      'The Constitution of the Republic',
      'A Guide to the Privacy Act',
      'Guidelines on Reproduction of Currency Note and Currency Coin',
      'Notice of Entry into Force of the Agreement',
      'Peraturan-Peraturan Perlindungan Data Peribadi 2013',
      'Garis Panduan Pendaftaran Pengguna Akhir',
      'Companies Act 2016',
      'By-laws',
    ]) {
      expect(readsAsAClause(t), t).toBe(false);
    }
  });

  it('is not the name a document gives itself, however many instruments it mentions', () => {
    expect(ownName([], 'pursuant to the Universities and University Colleges Act 1971;')).toBeNull();
    expect(ownName([], 'Guidelines on the Reproduction of Currency')).toBe('Guidelines on the Reproduction of Currency');
  });
});

describe('the line a document repeats on its own pages', () => {
  const header = (extra: string[] = []) =>
    Array.from({ length: 8 }, (_, i) =>
      page(i + 1, ['Guidelines on Reproduction of Currency Note', `body text for page ${i + 1}`, ...extra]),
    );

  it('is the name it repeats', () => {
    expect(runningHeader(header())).toBe('Guidelines on Reproduction of Currency Note');
  });

  it('is the name even where a clause repeats more often', () => {
    // The clause sits on every page twice over; the header only once. Counting alone loses.
    const pages = header().map((p) => ({
      ...p,
      lines: [...p.lines, 'pursuant to the Universities and University Colleges Act 1971;'],
    }));
    const doubled = pages.map((p) => ({ ...p, lines: [...p.lines, 'under the Majlis Amanah Rakyat Act 1966;'] }));
    expect(runningHeader(doubled)).toBe('Guidelines on Reproduction of Currency Note');
  });

  it('is nothing at all where every repeat is a clause, so the document can be asked instead', () => {
    const clausesOnly = Array.from({ length: 8 }, (_, i) =>
      page(i + 1, [
        'pursuant to the Universities and University Colleges Act 1971;',
        'under the Majlis Amanah Rakyat Act 1966;',
        `body text for page ${i + 1}`,
      ]),
    );
    expect(runningHeader(clausesOnly)).toBeNull();
  });
});
