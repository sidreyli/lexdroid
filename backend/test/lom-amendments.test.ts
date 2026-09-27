import { describe, expect, it } from 'vitest';
import { amendmentHistory, amendmentTable } from '../src/parse/lom.js';

/** The table as the revision prints it, with the heading that opens it and the one that closes it. */
function printed(body: string, closed = true): string {
  return [
    'Particulars under paragraphs 7(ii) and (iii) of the',
    'Revision of Laws Act 1968 [Act 1]',
    'LIST OF AMENDMENTS',
    'Amending law Short title In force from',
    body,
    closed ? 'LIST OF LAWS OR PARTS THEREOF SUPERSEDED\nNo. Title\nAct 437 Something' : '',
  ].join('\n');
}

describe('the table a revised Act prints about itself', () => {
  it('runs from its own heading to the heading that closes it', () => {
    const table = amendmentTable(printed('Act A1398 An Amendment Act 2011\n01-09-2011'));
    expect(table).toContain('Act A1398');
    expect(table).not.toContain('LIST OF LAWS');
  });

  it('is absent from a document that does not carry one', () => {
    expect(amendmentTable('An Act to provide for something. 1. Short title.')).toBeNull();
  });
});

describe('the last amendment the table records', () => {
  it('is the latest date in it, attributed to the law named on that row', () => {
    const found = amendmentHistory(
      printed(
        [
          'Act A1398 Co-operative Institute (Incorporation)',
          '(Amendment) Act 2011',
          '01-09-2011',
          'Act A1589 Co-operative Institute (Incorporation)',
          '(Amendment) Act 2019',
          '03-05-2019',
        ].join('\n'),
      ),
    );
    expect(found?.on).toBe('2019-05-03');
    expect(found?.by).toBe('Act A1589');
    expect(found?.basis).toContain('Revision of Laws Act 1968');
  });

  it('reads the date the way the revision prints it, day first', () => {
    // 03-05-2019 is 3 May, not 5 March. Reading it the other way moves the date two months.
    expect(amendmentHistory(printed('Act A1 A Title\n03-05-2019'))?.on).toBe('2019-05-03');
  });

  it('reads the prose form the newer revisions use', () => {
    const found = amendmentHistory(
      printed('Act 831 Finance Act 2020 1 January 2021\nAct 862 Finance Act 2024 1 January 2025'),
    );
    expect(found?.on).toBe('2025-01-01');
    expect(found?.by).toBe('Act 862');
  });

  it('takes the latest date even where the printing puts it out of order', () => {
    const found = amendmentHistory(printed('P.U. (A) 12/2001 A Title\n01-01-2001\nAct A9 A Title\n01-01-1999'));
    expect(found?.on).toBe('2001-01-01');
  });

  it('is nothing at all where the table says the Act has never been amended', () => {
    expect(amendmentHistory(printed('-NIL-'))).toBeNull();
  });

  it('is nothing where the typesetter wrote NIL with a horizontal bar rather than a hyphen', () => {
    // 173 Acts of the 639 carrying a table say it this way; read as a hyphen they looked unparsed.
    expect(amendmentHistory(printed('―NIL―'))).toBeNull();
    expect(amendmentHistory(printed('– NIL –'))).toBeNull();
  });

  it('refuses a date the scan mangled rather than recording a wrong one', () => {
    // Real rows out of the corpus: "18-18-2016", "3-0-98", "03-09-999".
    expect(amendmentHistory(printed('Act A1514 An Amendment Act 2016\n18-18-2016'))).toBeNull();
    expect(amendmentHistory(printed('Act A534 An Amendment Act\n3-0-98'))).toBeNull();
  });

  it('reads a date the column break split, because the table printed one date', () => {
    expect(amendmentHistory(printed('Act A1354 An Amendment Act 2009\n01-11- 2009'))?.on).toBe('2009-11-01');
  });

  it('is nothing where the row states a tax year instead of a date', () => {
    const body = 'Act 719 Finance Act 2011 Year of assessment 2008 and subsequent years of assessment';
    expect(amendmentHistory(printed(body))).toBeNull();
  });

  it('records the date without a law where the table names none before it', () => {
    const found = amendmentHistory(printed('A short title with no citation\n01-09-2011'));
    expect(found?.on).toBe('2011-09-01');
    expect(found?.by).toBeNull();
  });

  it('does not reach past the closing heading for a date', () => {
    // The printer's docket sits below the table and carries a date of its own: "WJW24/0050 17-01-2025".
    const found = amendmentHistory(
      `${printed('Act A1 A Title\n01-09-2011')}\nWJW24/0050 17-01-2025`,
    );
    expect(found?.on).toBe('2011-09-01');
  });
});
