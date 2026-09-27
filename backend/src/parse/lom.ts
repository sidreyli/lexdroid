/**
 * The amendment history a revised Malaysian Act prints about itself.
 *
 * The register could not answer this. The Laws of Malaysia catalogue publishes an "As At" date --
 * the day the reprint it serves is current to -- and that is a weaker claim than an amendment:
 * the Personal Data Protection Act is served as at 2023 while the duty ESCAP scores arrived in a
 * 2024 amendment. Reporting the reprint date as the last amendment said the Act had not changed
 * since 2023. It had.
 *
 * The document answers it properly. Every Act revised under the Revision of Laws Act 1968 closes
 * with a table required by paragraph 7 of that Act -- amending law, short title, and the day each
 * amendment came into force. That is a statement of amendments, made by the law revision
 * commissioner, naming the instrument that did the amending.
 *
 * Written to the printed table rather than to any particular Act: the heading, the column names
 * and the terminator are all furniture of the revision, so a document that does not carry the
 * table yields nothing rather than a guess.
 */

/** The table's own heading, and the headings that close it. */
const OPENS = /LIST\s+OF\s+AMENDMENTS/i;
const CLOSES = /LIST\s+OF\s+LAWS\s+OR\s+PARTS\s+THEREOF\s+SUPERSEDED|LIST\s+OF\s+SECTIONS?\s+AMENDED/i;
/**
 * The older revisions print dates as 01-09-2011. The single space is the column break landing
 * inside the date -- "01-11- 2009" is one date in the printed table, not two numbers.
 */
const NUMERIC_DATE = /\b(\d{2}) ?- ?(\d{2}) ?- ?(\d{4})\b/g;
/** The newer ones print them as "1 January 2021", in the same column. */
const PROSE_DATE =
  /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi;
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
/**
 * How the table names an amending law: an amendment Act, a principal Act amending another, or a
 * gazetted P.U., ordinance or notification. All are citations, which is what makes the date
 * attributable to something rather than floating.
 */
const AMENDING_LAW =
  /\b(Act\s+A?\d+|P\.?\s?U\.?\s*\([AB]\)\s*[\d/]+|Ord\.?\s*(?:No\.?\s*)?[\d/]+(?:\s+of\s+\d{4})?|L\.?N\.?\s*[\d/]+)/gi;
/**
 * What the table prints when the Act has never been amended.
 *
 * The dash is whichever one the typesetter used -- hyphen, en, em or horizontal bar. 44 Acts say
 * NIL in ASCII; the rest say it in U+2015 and were being counted as tables we could not read.
 */
const NONE = /[-‐-―]\s*NIL\s*[-‐-―]/i;

/** The table's own text, from its heading to whichever heading closes it. */
export function amendmentTable(text: string): string | null {
  const open = OPENS.exec(text);
  if (!open) return null;
  const after = text.slice(open.index + open[0].length);
  const close = CLOSES.exec(after);
  const body = close ? after.slice(0, close.index) : after;
  return body.trim() ? body : null;
}

export interface AmendmentHistory {
  /** ISO date of the latest amendment the table records as in force. */
  on: string;
  /** The amending law the table attributes it to, where the table names one. */
  by: string | null;
  basis: string;
}

/**
 * The last amendment the Act's own revision table records, or null where it records none.
 *
 * The latest date is taken rather than the last one printed: the table is chronological but a
 * wrapped short title can put a row's date on a line of its own, and ordering by value does not
 * depend on the wrapping surviving the PDF.
 */
export function amendmentHistory(text: string): AmendmentHistory | null {
  const table = amendmentTable(text);
  if (!table || NONE.test(table)) return null;

  const dates: { iso: string; at: number }[] = [];
  const pad = (n: number): string => String(n).padStart(2, '0');
  for (const m of table.matchAll(NUMERIC_DATE)) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    // The revision prints day first. A row that came out of the PDF as 2011-09-01 is a misread,
    // and a misread date is worse than no date.
    if (month < 1 || month > 12 || day < 1 || day > 31) continue;
    dates.push({ iso: `${m[3]}-${m[2]}-${m[1]}`, at: m.index });
  }
  for (const m of table.matchAll(PROSE_DATE)) {
    const day = Number(m[1]);
    const month = MONTHS.indexOf(m[2]!.toLowerCase()) + 1;
    if (month < 1 || day < 1 || day > 31) continue;
    dates.push({ iso: `${m[3]}-${pad(month)}-${pad(day)}`, at: m.index });
  }
  if (dates.length === 0) return null;

  const latest = dates.reduce((a, b) => (b.iso > a.iso ? b : a));

  // The amending law opens its own row and the date closes it, so the law we want is the first
  // citation standing between the previous row's date and this one. Taking the last citation
  // before the date instead would take the year out of the short title -- "Act 831 Finance Act
  // 2020 1 January 2021" cites Act 831 and is about the Finance Act 2020, and they are different
  // instruments.
  const rowStart = dates
    .map((d) => d.at)
    .filter((at) => at < latest.at)
    .reduce((a, b) => Math.max(a, b), 0);
  let by: string | null = null;
  for (const m of table.matchAll(AMENDING_LAW)) {
    if (m.index < rowStart) continue;
    if (m.index >= latest.at) break;
    by = m[1]!.replace(/\s+/g, ' ').trim();
    break;
  }

  return {
    on: latest.iso,
    by,
    basis:
      `The Act's own list of amendments, printed under paragraph 7 of the Revision of Laws Act 1968, ` +
      `records ${by ? `${by} as` : 'its latest amendment as'} in force from ${latest.iso}.`,
  };
}
