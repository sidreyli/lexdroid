/**
 * Loading Zone 0 profiles, and writing them into the store.
 *
 * The profile is the only place an economy is described by hand. Everything downstream reads it
 * out of the store, so an economy the tool has never seen becomes tractable by adding one JSON
 * file -- which is the live-test scenario, where a profile is filled in during the hour.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EconomyProfile } from './types.js';
import type { Db } from '../db/index.js';

const here = dirname(fileURLToPath(import.meta.url));
export const PROFILE_DIR = join(here, '..', '..', 'data', 'profiles');

export function profilePath(code: string): string {
  return join(PROFILE_DIR, `${code.toUpperCase()}.json`);
}

export function loadProfile(code: string): EconomyProfile {
  const path = profilePath(code);
  if (!existsSync(path)) {
    throw new Error(
      `No Zone 0 profile for ${code}. Write ${code.toUpperCase()}.json in data/profiles ` +
        `naming the legal system, the languages law is published in, and the official portals.`,
    );
  }
  const parsed = EconomyProfile.safeParse(JSON.parse(readFileSync(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`${code}.json is not a valid profile:\n  ${parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n  ')}`);
  }
  if (parsed.data.code !== code.toUpperCase()) {
    throw new Error(`${code}.json declares code "${parsed.data.code}"; the filename must match.`);
  }
  return parsed.data;
}

export function availableProfiles(): string[] {
  if (!existsSync(PROFILE_DIR)) return [];
  return readdirSync(PROFILE_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

/**
 * Write the profile into the store, replacing what was there.
 *
 * Portals keep any robots.txt result already recorded against them: that is a fact about the
 * server, learned by the fetcher, not something the profile author knows.
 */
export function applyProfile(db: Db, profile: EconomyProfile): void {
  const now = new Date().toISOString();
  const gazette = profile.portals.find((p) => p.kind === 'gazette')?.url ?? null;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO economy (code, name, legal_system, official_languages, gazette_url, notes, profiled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(code) DO UPDATE SET
         name = excluded.name, legal_system = excluded.legal_system,
         official_languages = excluded.official_languages, gazette_url = excluded.gazette_url,
         notes = excluded.notes, profiled_at = excluded.profiled_at`,
    ).run(
      profile.code,
      profile.name,
      `${profile.legalSystem.family}: ${profile.legalSystem.note}`,
      JSON.stringify(profile.officialLanguages),
      gazette,
      profile.notes,
      now,
    );

    const upsertPortal = db.prepare(
      `INSERT INTO portal (economy_code, name, url, kind, authority, pillars)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(economy_code, url) DO UPDATE SET
         name = excluded.name, kind = excluded.kind, authority = excluded.authority,
         pillars = excluded.pillars`,
    );
    for (const p of profile.portals) {
      upsertPortal.run(profile.code, p.name, p.url, p.kind, p.authority, JSON.stringify(p.pillars));
    }

    const upsertCommitment = db.prepare(
      `INSERT INTO commitment (economy_code, name, status, source_url) VALUES (?, ?, ?, ?)
       ON CONFLICT(economy_code, name) DO UPDATE SET
         status = excluded.status, source_url = excluded.source_url`,
    );
    for (const c of profile.commitments) {
      upsertCommitment.run(profile.code, c.name, c.status, c.sourceUrl);
    }
  })();
}

/** The portal row id for a profile portal, so discovery can record what it walked. */
export function portalId(db: Db, economyCode: string, url: string): number {
  const row = db
    .prepare('SELECT id FROM portal WHERE economy_code = ? AND url = ?')
    .get(economyCode, url) as { id: number } | undefined;
  if (!row) throw new Error(`Portal ${url} is not recorded for ${economyCode}. Apply the profile first.`);
  return row.id;
}

export * from './types.js';
