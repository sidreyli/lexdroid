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
export function sameInstrument(candidate: string, cited: string): boolean {
  const a = normaliseTitle(candidate);
  // A parenthesised run of capitals is the writer abbreviating their own citation, not part of
  // the name: "Government Procurement Act (GPA) 1997".
  const b = normaliseTitle(cited.replace(/\([A-Z]{2,6}\)/g, ' '));
  if (a === b) return true;
  if (b.length < 12) return false;
  if (a.includes(b) || b.includes(a)) return true;

  const at = stems(a);
  const bt = stems(b);
  if (bt.length < 2) return false;

  // A year in both has to be the same year, which is what keeps the 1997 Act off the 2014
  // Regulations when everything else about the two titles agrees.
  const year = (t: string[]): string | null => t.find((x) => /^(19|20)\d\d$/.test(x)) ?? null;
  const ya = year(at);
  const yb = year(bt);
  if (ya && yb && ya !== yb) return false;

  const ka = kindWord(at);
  const kb = kindWord(bt);
  if (ka && kb && ka !== kb) return false;

  const have = new Set(at);
  const shared = bt.filter((t) => have.has(t)).length;
  // Two thirds where both name a kind of instrument, which is the check that makes room for a
  // typo; four fifths where neither does and there is nothing else holding them apart.
  return shared / bt.length >= (ka && kb ? 2 / 3 : 0.8);
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
