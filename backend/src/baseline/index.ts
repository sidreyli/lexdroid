/**
 * ESCAP's sample kit, quarantined.
 *
 * Read src/baseline/README.md before using anything here. In short: this module answers two
 * questions and no others -- is this instrument in the sample kit (the Discovery Tag), and how do
 * our answers compare to ESCAP's (evaluation). Nothing in the pipeline may import it.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { topBandScoresAbsence } from '../decide/index.js';
import type { Indicator } from '../rubric/types.js';

const here = dirname(fileURLToPath(import.meta.url));
export const BASELINE_DB_PATH = join(here, '..', '..', 'data', 'baseline.db');

export const BASELINE_SCHEMA = `
PRAGMA journal_mode = WAL;

-- One row of ESCAP's own completed research, exactly as they recorded it.
CREATE TABLE IF NOT EXISTS baseline_row (
  id            INTEGER PRIMARY KEY,
  source        TEXT NOT NULL,      -- round-1 | round-2 | legal-inventory | portal-table
  economy       TEXT NOT NULL,
  pillar_id     INTEGER,
  indicator_id  TEXT,               -- TEXT, for the same reason it is TEXT everywhere else
  raw_score     REAL,
  act_or_practice TEXT,
  coverage      TEXT,
  impact        TEXT,
  timeframe     TEXT,
  references_raw TEXT,              -- ESCAP spread URLs across several columns; kept joined
  note          TEXT,
  sheet_row     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_baseline_cell ON baseline_row(economy, indicator_id);

-- Instrument titles and URLs seen anywhere in the sample kit, normalised for lookup.
-- This is what the Discovery Tag is decided against.
CREATE TABLE IF NOT EXISTS baseline_instrument (
  id            INTEGER PRIMARY KEY,
  economy       TEXT NOT NULL,
  title_norm    TEXT NOT NULL,
  title_raw     TEXT NOT NULL,
  url_norm      TEXT,
  source        TEXT NOT NULL,
  UNIQUE (economy, title_norm, url_norm)
);

CREATE INDEX IF NOT EXISTS idx_baseline_instrument_title ON baseline_instrument(economy, title_norm);
`;

export function openBaseline(path: string = BASELINE_DB_PATH): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(BASELINE_SCHEMA);
  return db;
}

/** Lowercase, strip punctuation and collapse space. Titles differ by comma and case constantly. */
export function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9À-￿]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** The word that says what kind of instrument a title names. Two titles with different ones are
 *  different instruments, whatever else they share. */
const KIND_WORDS = ['act', 'regulation', 'rule', 'order', 'code', 'notification', 'bill', 'decree', 'guideline'];

function kindWord(tokens: string[]): string | null {
  return tokens.find((t) => KIND_WORDS.includes(t)) ?? null;
}

/** Tokens, with a trailing plural s removed so "Rule" and "Rules" are one word. */
function stems(title: string): string[] {
  return normaliseTitle(title)
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

/**
 * A word the writer's finger repeated, not a word of the name.
 *
 * Malaysia's sheet cites the Copyright Act as "Copyright Right Act (Act 332) 1987" on three
 * cells. "right" is the tail of the word before it, and it is the only word of the citation the
 * register cannot account for, so those cells reported the Act as never discovered while we held
 * it with 122 sections. A misspelling is handled below by `near`; this is not one -- "right" is a
 * word, spelled correctly, that the citation already contains.
 *
 * Only a proper suffix of the word immediately before it, of four letters or more, so "Act (Act
 * 332)" keeps both of its Acts and a title is never shortened by a word it really carries.
 */
function withoutStutters(tokens: string[]): string[] {
  return tokens.filter((t, i) => {
    const before = i > 0 ? tokens[i - 1] : undefined;
    return !(before !== undefined && t.length >= 4 && t.length < before.length && before.endsWith(t));
  });
}

/**
 * Whether the year in this title is the day an edition was compiled rather than part of the name.
 *
 * A rolling instrument is republished as one text and the portal titles it by the date it is
 * current to: we hold "Commonwealth Procurement Rules 17 November 2025", which is the instrument
 * ESCAP cites as "Commonwealth Procurement Rules 2024", and the register keeps no other edition.
 * The year guard below is what stops the 1997 Act matching the 2014 Regulations, and it was also
 * stopping this; a year sitting after a month is not the kind of year it guards.
 */
const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
function datesAnEdition(tokens: string[]): boolean {
  const i = tokens.findIndex((t) => /^(19|20)\d\d$/.test(t));
  return i > 0 && MONTHS.includes(tokens[i - 1] ?? "");
}

/**
 * Is this instrument the one ESCAP named?
 *
 * Substring containment was the first test and it read as generous, but it is the opposite: one
 * character anywhere defeats it. Measured against Singapore's register, it reported the Government
 * Procurement Act, the Copyright Regulations, the Patents Rules and the Supreme Court of
 * Judicature (Intellectual Property) Rules as never discovered when all four were registered --
 * defeated by "(GPA)", by a singular, by a singular, and by a trailing comma. That turned a
 * ranking problem into a crawl problem in every number the measurement produced.
 *
 * ESCAP's cell text is written by hand: it carries abbreviations, singulars and typos
 * ("Challenage Proceddings"). So the test is on words rather than characters, and the word that
 * says what kind of instrument it is has to agree -- without that, the Copyright Act and the
 * Copyright Regulations are two thirds of the same title.
 */
/**
 * The instruments one cell cites, as separate titles.
 *
 * 105 of ESCAP's 250 cited rows pack several instruments into the one field, separated by a
 * semicolon and a blank line. Read whole, the field names nothing: no register entry matches
 * "Companies Act 2016;\n\nCommunications and Multimedia Act 1998", so the cell reports the law
 * as never registered when both Acts are held.
 */
export function citedInstruments(field: string): string[] {
  return field
    .split(/\s*;?\s*\n\s*\n\s*|\s*;\s+(?=[A-Z0-9])/)
    .map((s) => s.replace(/^[\s;]+|[\s;]+$/g, ''))
    .filter((s) => s.length > 0);
}

export function sameInstrument(candidate: string, cited: string): boolean {
  const a = normaliseTitle(candidate);
  // A parenthesised run of capitals is the writer abbreviating their own citation, not part of
  // the name: "Government Procurement Act (GPA) 1997".
  const b = normaliseTitle(cited.replace(/\([A-Z]{2,6}\)/g, ' '));
  if (a === b) return true;
  // Containment answers a citation that drops or adds a trailing year. Both sides have to be long
  // enough to name something: our register holds an instrument titled "2023", and every Malaysian
  // citation carrying that year contained it.
  if (a.length < 12 || b.length < 12) return false;
  if (contains(a, b) || contains(b, a)) return true;

  const at = withoutStutters(stems(a));
  const bt = withoutStutters(stems(b));
  if (bt.length < 2) return false;

  // A year in both has to be the same year, which is what keeps the 1997 Act off the 2014
  // Regulations when everything else about the two titles agrees.
  const year = (t: string[]): string | null => t.find((x) => /^(19|20)\d\d$/.test(x)) ?? null;
  const ya = year(at);
  const yb = year(bt);
  if (ya && yb && ya !== yb && !datesAnEdition(at) && !datesAnEdition(bt)) return false;

  const ka = kindWord(at);
  const kb = kindWord(bt);
  if (ka && kb && ka !== kb) return false;

  // The kind word and the year are carried by almost every title, so counting them as agreement
  // let one distinguishing word differ: the Banking Act 1959 matched the Civil Aviation
  // (Carriers' Liability) Act 1959 on "act" and "1959" alone, and the Australian Jobs Act 2013
  // matched the Australian Education Act 2013. Identity is in what is left when both are removed.
  // Numbers other than the year are the statutory number -- "(Act 708)", "No.88", "P.U.(A) 123" --
  // and words of two letters are joins. Neither names the instrument; Malaysia's sheet cites both.
  // A month is part of a date and a date stamps an edition, so it names the instrument no more
  // than the day of the month beside it does. Without this the containment runs one way only:
  // the citation's words are all in "Commonwealth Procurement Rules 17 November 2025" and its
  // own "november" is in no citation, so the title we hold looked like a different instrument.
  const identifying = (t: string[]) =>
    t.filter(
      (x) => !KIND_WORDS.includes(x) && !MONTHS.includes(x) && !/^\d+$/.test(x) && x.length > 2,
    );
  const want = identifying(bt);
  const held = identifying(at);
  if (want.length === 0) return false;

  // A hand-written citation misspells a word; it does not replace it. So a word is accounted for
  // by a near spelling, and "challenage" reaches "challenge" where "jobs" never reaches "education".
  // Both directions, because a qualifier the citation does not carry names a different instrument:
  // the Broadcasting Services (Transitional Provisions) Act is not the Broadcasting Services Act.
  const covers = (from: string[], by: string[]) => {
    const missing = from.filter((w) => !by.some((h) => h === w || near(h, w))).length;
    return missing <= Math.floor(from.length / 5);
  };
  return covers(want, held) && covers(held, want);
}

/**
 * A misspelling of a word, not another word. The first letter has to agree: a typo transposes and
 * drops letters inside a word, while "imports" and "exports" differ by two edits and are opposites.
 */
function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  if (a[0] !== b[0]) return false;
  const budget = Math.min(a.length, b.length) >= 8 ? 2 : 1;
  return distance(a, b, budget) <= budget;
}

/** Containment on whole words, so "port" does not find itself inside "airport". */
function contains(haystack: string, needle: string): boolean {
  const i = haystack.indexOf(needle);
  if (i < 0) return false;
  const before = i === 0 || haystack[i - 1] === ' ';
  const end = i + needle.length;
  return before && (end === haystack.length || haystack[end] === ' ');
}

/** Levenshtein, abandoned once the budget is exceeded. */
function distance(a: string, b: string, budget: number): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
      best = Math.min(best, row[j]!);
    }
    if (best > budget) return budget + 1;
    prev = row;
  }
  return prev[b.length]!;
}

/** Scheme, host and path only. Query strings and fragments differ without meaning anything. */
export function normaliseUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

export type DiscoveryTag = 'NEW' | 'KNOWN';

/**
 * Is this instrument in the sample kit?
 *
 * A title match within the same economy, or a URL match, counts as KNOWN. Anything else is NEW,
 * which is a claim we have to be willing to defend -- so the match is deliberately generous.
 */
export function discoveryTag(
  db: Database.Database,
  economy: string,
  title: string,
  url: string | null,
): DiscoveryTag {
  const titleNorm = normaliseTitle(title);
  const urlNorm = url ? normaliseUrl(url) : null;

  const byUrl = urlNorm
    ? db.prepare('SELECT 1 FROM baseline_instrument WHERE url_norm = ? LIMIT 1').get(urlNorm)
    : undefined;
  if (byUrl) return 'KNOWN';

  const byTitle = db
    .prepare('SELECT 1 FROM baseline_instrument WHERE economy = ? AND title_norm = ? LIMIT 1')
    .get(economy, titleNorm);
  if (byTitle) return 'KNOWN';

  // A title that contains, or is contained by, a kit title for the same economy. Catches
  // "Personal Data Protection Act 2012" against "Personal Data Protection Act 2012 (No. 26 of 2012)".
  if (titleNorm.length >= 12) {
    const loose = db
      .prepare(
        'SELECT 1 FROM baseline_instrument WHERE economy = ? ' +
          'AND (instr(title_norm, ?) > 0 OR instr(?, title_norm) > 0) LIMIT 1',
      )
      .get(economy, titleNorm, titleNorm);
    if (loose) return 'KNOWN';
  }

  return 'NEW';
}

/* ---------------------------------------------------------------------------------------------
 * Reading ESCAP's answer for a cell.
 * ------------------------------------------------------------------------------------------- */

/** How the rows were resolved to one score, said in words the scoreboard can print. */
export interface EscapAnswer {
  score: number;
  rows: number;
  how: string;
  /** True when the rows disagree and the ladder cannot combine them. Look before believing it. */
  uncertain: boolean;
}

/** The ladders whose bands are combinations of components rather than a scale of severity. */
const COMBINATION_LADDERS = new Set(['4.2', '4.6', '5.4', '11.3', '12.2']);

/**
 * The band ESCAP escalates a count of lesser measures into, and the band they are counted from.
 *
 * Fifteen indicators carry the sentence, and it is not always the top band that receives them:
 * 3.4 escalates two screening mechanisms into its *second* band, not its first.
 */
function escalation(indicator: Indicator): { into: number; from: number } | null {
  const phrase = /more than one (?:measure|sector|LCR)|at least two|two or more|cases of more than one/i;
  for (let k = 0; k < indicator.bands.length - 1; k++) {
    if (phrase.test(indicator.bands[k]!.criterion)) {
      return { into: indicator.bands[k]!.score, from: indicator.bands[k + 1]!.score };
    }
  }
  return null;
}

/**
 * ESCAP's answer for one cell, from the rows they recorded for it.
 *
 * Their database is one row per measure, each scored as that measure alone would score, so a cell
 * with several rows has to be resolved before it can be compared with anything. Taking the highest
 * was wrong in both directions. On an indicator whose top band is an absence -- "No intermediary
 * liability framework" -- the highest row is the one that found nothing, so Malaysia 8.2 (rows 0
 * and 1) read as "no framework" when one of their own rows cites the framework: there the lowest
 * row is the finding. And on an indicator that escalates on count -- "more than one measure in
 * category (2)" -- Malaysia 6.2's two 0.5 rows are the top band by ESCAP's own sentence, not 0.5.
 */
export function escapScore(indicator: Indicator, scores: (number | null)[]): EscapAnswer {
  const values = scores.map((s) => s ?? 0);
  if (values.length === 0) return { score: 0, rows: 0, how: 'no row', uncertain: false };
  if (values.length === 1) return { score: values[0]!, rows: 1, how: 'one row', uncertain: false };

  const disagree = new Set(values).size > 1;

  if (topBandScoresAbsence(indicator)) {
    return {
      score: Math.min(...values),
      rows: values.length,
      how: 'lowest row: any row that found the thing defeats the absence',
      uncertain: disagree && COMBINATION_LADDERS.has(indicator.id),
    };
  }

  // 1.4 is the only ladder that is a tally: a quarter for each measure, up to one.
  if (indicator.id === '1.4') {
    const measures = values.filter((v) => v > 0).length;
    return {
      score: Math.min(1, 0.25 * measures),
      rows: values.length,
      how: `${measures} measure(s), a quarter each`,
      uncertain: false,
    };
  }

  const highest = Math.max(...values);
  const up = escalation(indicator);
  const counted = up ? values.filter((v) => v === up.from).length : 0;
  if (up && highest < up.into && counted > 1) {
    return {
      score: up.into,
      rows: values.length,
      how: `${counted} measures of the lesser band, which their criteria escalate`,
      uncertain: false,
    };
  }

  return {
    score: highest,
    rows: values.length,
    how: 'highest row: the strongest measure sets the band',
    uncertain: disagree && COMBINATION_LADDERS.has(indicator.id),
  };
}
