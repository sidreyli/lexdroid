/**
 * The 2025 sample kit's instrument list, for the Discovery Tag.
 *
 * The output template asks of every row whether its instrument was in the sample kit (KNOWN) or
 * found independently (NEW). This module answers that and nothing else, after the rows exist.
 * Nothing upstream of export may import it: if discovery could see the kit, every instrument
 * would be KNOWN by construction and the tag would say nothing about what the tool found.
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const BASELINE_DB_PATH = join(here, '..', '..', 'data', 'baseline.db');

export const BASELINE_SCHEMA = `
PRAGMA journal_mode = WAL;

-- Instrument titles and URLs named anywhere in the sample kit, normalised for lookup.
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
