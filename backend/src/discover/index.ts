/**
 * Zone 1, discovery: what instruments exist, and then their text.
 *
 * Two passes, because they cost differently and fail differently.
 *
 *   register()    walks each portal's own listings and records every instrument it publishes.
 *                 Cheap: a handful of requests per portal for hundreds of instruments.
 *   materialise() fetches and parses one instrument's text. Expensive, rate limited, and
 *                 resumable -- an instrument already parsed is skipped, so a corpus build that
 *                 stops halfway continues rather than starting again.
 *
 * Nothing here reads ESCAP's legal inventory. If it did, every instrument would be KNOWN by
 * construction and the discovery criterion would be unearned. The register is what the portal
 * says it publishes, and where that disagrees with ESCAP's sheet, the disagreement is a finding.
 */
import type { Db } from '../db/index.js';
import type { Fetcher } from '../fetch/index.js';
import { RobotsDisallowed, CacheMiss, HostSuspended } from '../fetch/index.js';
import { parseDocument, storeDocument, verifyOffsets } from '../parse/index.js';
import type { EconomyProfile } from '../profile/types.js';
import { portalId } from '../profile/index.js';
import { frlAdapter } from './frl.js';
import { lomAdapter } from './lom.js';
import { lomSubsidAdapter } from './lom-subsid.js';
import { ssoAdapter } from './sso.js';
import { wpAdapter } from './wp.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

export * from './types.js';

const ADAPTERS: Record<string, Adapter> = {
  frl: frlAdapter,
  lom: lomAdapter,
  'lom-subsid': lomSubsidAdapter,
  sso: ssoAdapter,
  wp: wpAdapter,
};

export interface RegisterResult {
  portal: string;
  found: number;
  added: number;
  error?: string;
}

export async function register(
  db: Db,
  profile: EconomyProfile,
  fetcher: Fetcher,
  log: (line: string) => void = () => {},
): Promise<RegisterResult[]> {
  const results: RegisterResult[] = [];
  const now = new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO instrument (economy_code, title, official_number, kind, status, status_basis,
                             last_amended_on, timeframe_basis, source_url, discovered_via, discovered_at,
                             title_provisional, also_at)
     VALUES (?, ?, ?, ?, COALESCE(?, 'unknown'), ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(economy_code, source_url) DO UPDATE SET
       status = CASE WHEN excluded.status_basis IS NOT NULL THEN excluded.status ELSE instrument.status END,
       status_basis = COALESCE(excluded.status_basis, instrument.status_basis),
       last_amended_on = COALESCE(excluded.last_amended_on, instrument.last_amended_on),
       timeframe_basis = COALESCE(excluded.timeframe_basis, instrument.timeframe_basis),
       also_at = COALESCE(excluded.also_at, instrument.also_at)
     WHERE excluded.status_basis IS NOT NULL OR excluded.also_at IS NOT NULL`,
  );

  for (const portal of profile.portals) {
    if (!portal.adapter) continue;
    const adapter = ADAPTERS[portal.adapter];
    if (!adapter) {
      results.push({ portal: portal.name, found: 0, added: 0, error: `no adapter named "${portal.adapter}"` });
      continue;
    }
    log(`${portal.name} (${portal.url})`);
    const id = portalId(db, profile.code, portal.url);

    let found: DiscoveredInstrument[] = [];
    try {
      found = await adapter.discover({ portal, fetcher, log });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ portal: portal.name, found: 0, added: 0, error: message });
      db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
        .run('discover', portal.url, 'portal-walk-failed', message, now);
      log(`  failed: ${message}`);
      continue;
    }

    let added = 0;
    db.transaction(() => {
      for (const item of found) {
        // A re-walk re-asserts what the listing says: an instrument stays in the register, and
        // its standing is refreshed from the listing it was found on this time.
        const before = db.prepare('SELECT 1 FROM instrument WHERE economy_code = ? AND source_url = ?')
          .get(profile.code, item.url);
        insert.run(
          profile.code, item.title, item.officialNumber ?? null, item.kind,
          item.status ?? null, item.statusBasis ?? null, item.currentTo ?? null,
          item.currentToBasis ?? null, item.url, `portal:${id}`, now,
          item.titleProvisional ? 1 : 0,
          item.alsoAt?.length ? JSON.stringify(item.alsoAt) : null,
        );
        if (!before) added += 1;
      }
    })();
    log(`  ${found.length} instrument(s) listed, ${added} new to the register`);
    results.push({ portal: portal.name, found: found.length, added });
  }

  return results;
}

/** The other files one page publishes, as recorded at registration. */
function alsoAt(row: { also_at: string | null }): string[] {
  if (!row.also_at) return [];
  try {
    const urls = JSON.parse(row.also_at) as unknown;
    return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Read one further edition into an instrument already materialised. Returns its section count, or
 * null when it could not be read -- which is recorded, never a silent absence.
 */
async function readEdition(db: Db, fetcher: Fetcher, instrumentId: number, url: string): Promise<number | null> {
  const now = () => new Date().toISOString();
  const discard = (reason: string, detail: string): null => {
    db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
      .run('fetch', url, reason, detail, now());
    return null;
  };
  try {
    const fetched = await fetcher.fetch(url);
    if (fetched.status !== 200) return discard('non-200-response', `HTTP ${fetched.status}`);

    const parsed = await parseDocument(fetched);
    const stored = storeDocument(db, { instrumentId, fetched, parsed });
    if (stored.unread) return null;

    const check = verifyOffsets(db, stored.documentId);
    if (check.failed.length > 0) {
      return discard('fetch-or-parse-error', `offsets do not round-trip for ${check.failed.length} section(s)`);
    }
    return stored.sectionCount;
  } catch (err) {
    if (err instanceof CacheMiss || err instanceof HostSuspended) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    return discard(err instanceof RobotsDisallowed ? 'robots-disallowed' : 'fetch-or-parse-error', detail);
  }
}

export interface MaterialiseResult {
  instrumentId: number;
  title: string;
  url: string;
  outcome: 'parsed' | 'unread' | 'skipped' | 'error' | 'not-attempted';
  sections?: number;
  detail?: string;
}

interface InstrumentRow {
  id: number;
  title: string;
  source_url: string;
  discovered_via: string;
  title_provisional: number;
  also_at: string | null;
}

export interface MaterialiseOptions {
  limit?: number;
  /** Re-fetch and re-parse instruments already in the corpus. */
  refresh?: boolean;
  /**
   * Re-parse instruments already in the corpus, from the bytes already on disk.
   *
   * The parser changes more often than the law does. When it gains something -- Malay headings, a
   * repealed-provision rule, the fragment anchor a citation deep-links to -- every document already
   * read is stale in exactly that respect, and refetching a corpus to pick it up is both slow and
   * rude. This re-runs the parse over the cache and touches the network not at all, which is the
   * same principle as the response cache one stage further on: redo the stage that changed, and
   * only that stage.
   */
  reparse?: boolean;
  /** Only instruments whose title matches, case-insensitively. Used to prove a path quickly. */
  titleLike?: string;
  /**
   * Only instruments of this kind. Acts before subsidiary legislation is the useful order: an Act
   * is what a cell cites as controlling, and Singapore alone has 5,841 subsidiary instruments
   * against 524 Acts, so reading the Acts first gets a usable corpus in a twentieth of the time.
   */
  kind?: string;
  /**
   * Read exactly these instruments, in exactly this order.
   *
   * This is how a question drives fetching rather than the register's own order. The shortlist
   * stage ranks the register against a cell's queries before anything is fetched, and hands the
   * result here; nothing else in the pipeline decides what is worth retrieving.
   */
  instrumentIds?: number[];
  log?: (line: string) => void;
}

export async function materialise(
  db: Db,
  profile: EconomyProfile,
  fetcher: Fetcher,
  opts: MaterialiseOptions = {},
): Promise<MaterialiseResult[]> {
  const log = opts.log ?? (() => {});
  const adapterFor = (via: string): Adapter | null => {
    const id = Number(via.replace('portal:', ''));
    const row = db.prepare('SELECT url FROM portal WHERE id = ?').get(id) as { url: string } | undefined;
    const portal = row ? profile.portals.find((p) => p.url === row.url) : undefined;
    return portal?.adapter ? ADAPTERS[portal.adapter] ?? null : null;
  };

  const where = opts.reparse
    ? `i.economy_code = ? AND EXISTS (SELECT 1 FROM document d WHERE d.instrument_id = i.id)`
    : opts.refresh
      ? 'i.economy_code = ?'
      : `i.economy_code = ? AND NOT EXISTS (SELECT 1 FROM document d WHERE d.instrument_id = i.id)`;
  const params: unknown[] = [profile.code];
  let sql = `SELECT i.id, i.title, i.source_url, i.discovered_via, i.title_provisional, i.also_at
               FROM instrument i WHERE ${where}`;
  if (opts.titleLike) {
    sql += ' AND i.title LIKE ?';
    params.push(`%${opts.titleLike}%`);
  }
  if (opts.kind) {
    sql += ' AND i.kind = ?';
    params.push(opts.kind);
  }
  if (opts.instrumentIds?.length) {
    // Integers straight from the shortlist's own query, never user text.
    const ids = opts.instrumentIds.map((n) => Math.floor(n)).filter(Number.isFinite);
    sql += ` AND i.id IN (${ids.join(',')})`;
  }
  sql += ' ORDER BY i.id';
  if (opts.limit) sql += ` LIMIT ${Math.floor(opts.limit)}`;

  let rows = db.prepare(sql).all(...params) as InstrumentRow[];

  // The shortlist's order is its finding, so restore it: SQL returned these rows by id, and reading
  // the most relevant instrument first is what makes an interrupted run still useful.
  if (opts.instrumentIds?.length) {
    const order = new Map(opts.instrumentIds.map((id, i) => [id, i]));
    rows = rows.slice().sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  }
  log(`${rows.length} instrument(s) to read`);

  const results: MaterialiseResult[] = [];
  for (const [n, row] of rows.entries()) {
    const adapter = adapterFor(row.discovered_via);
    const base = { instrumentId: row.id, title: row.title, url: row.source_url };
    try {
      const fetched = adapter?.resolveDocument
        ? await adapter.resolveDocument(row.source_url, fetcher)
        : await fetcher.fetch(row.source_url);

      if (fetched.status !== 200) {
        // Recorded, not just reported: an instrument the corpus does not contain has to be
        // countable afterwards, or "we searched and found nothing" quietly includes it.
        db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
          .run('fetch', row.source_url, 'non-200-response', `HTTP ${fetched.status}`, new Date().toISOString());
        results.push({ ...base, outcome: 'error', detail: `HTTP ${fetched.status}` });
        log(`  [${n + 1}/${rows.length}] ${row.title}: HTTP ${fetched.status}`);
        continue;
      }

      const parsed = await parseDocument(fetched);
      const stored = storeDocument(db, { instrumentId: row.id, fetched, parsed });

      // What the document says about itself, which is the only acceptable evidence for a date.
      if (parsed.meta['officialNumber'] || parsed.meta['commencedOn'] || parsed.meta['lastAmendedOn']) {
        db.prepare(
          `UPDATE instrument SET
             official_number = COALESCE(?, official_number),
             commenced_on = COALESCE(?, commenced_on),
             last_amended_on = COALESCE(?, last_amended_on),
             timeframe_basis = COALESCE(?, timeframe_basis),
             language = COALESCE(?, language)
           WHERE id = ?`,
        ).run(
          parsed.meta['officialNumber'] ?? null,
          parsed.meta['commencedOn'] ?? null,
          parsed.meta['lastAmendedOn'] ?? null,
          [parsed.meta['commencementBasis'], parsed.meta['lastAmendedBasis']].filter(Boolean).join(' | ') || null,
          parsed.sections[0]?.language ?? null,
          row.id,
        );
      }

      // A document registered under an upload slug takes the name it calls itself by.
      if (row.title_provisional && parsed.title) {
        db.prepare('UPDATE instrument SET title = ?, title_provisional = 0 WHERE id = ?')
          .run(parsed.title, row.id);
        log(`  [${n + 1}/${rows.length}] names itself "${parsed.title}"`);
      }

      if (parsed.meta['partial']) {
        db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
          .run('parse', row.source_url, 'partial-document', parsed.meta['partial'], new Date().toISOString());
      }

      if (stored.unread) {
        const why = stored.unreadReason ?? parsed.unread;
        results.push({ ...base, outcome: 'unread', detail: why?.detail ?? 'no reason recorded' });
        log(`  [${n + 1}/${rows.length}] ${row.title}: unread -- ${why?.detail ?? why?.reason ?? 'no reason recorded'}`);
        continue;
      }

      const check = verifyOffsets(db, stored.documentId);
      if (check.failed.length > 0) {
        throw new Error(`offsets do not round-trip for ${check.failed.length} section(s): ${check.failed.slice(0, 3).join('; ')}`);
      }

      // The other files the same page publishes belong to the same instrument, so one code of
      // practice in two languages is one instrument citing two documents, not two instruments.
      let extra = 0;
      for (const url of alsoAt(row)) {
        const more = await readEdition(db, fetcher, row.id, url);
        if (more === null) log(`  [${n + 1}/${rows.length}] also at ${url}: not read`);
        else extra += more;
      }

      results.push({ ...base, outcome: 'parsed', sections: stored.sectionCount + extra });
      log(`  [${n + 1}/${rows.length}] ${row.title}: ${stored.sectionCount + extra} section(s)`);
    } catch (err) {
      if (err instanceof CacheMiss) throw err;

      // The host has stopped serving us. Everything still queued for it is recorded as not
      // attempted rather than as an error: a document we never asked for has told us nothing about
      // itself, and filing it next to documents that genuinely failed to parse would put a hole in
      // the corpus where an interruption belongs.
      if (err instanceof HostSuspended) {
        for (const rest of rows.slice(n)) {
          results.push({
            instrumentId: rest.id, title: rest.title, url: rest.source_url,
            outcome: 'not-attempted', detail: err.message,
          });
        }
        log(`  stopped after ${n} of ${rows.length}: ${err.message}`);
        break;
      }

      const detail = err instanceof RobotsDisallowed ? 'robots.txt disallows this URL' : err instanceof Error ? err.message : String(err);
      db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
        .run('fetch', row.source_url, err instanceof RobotsDisallowed ? 'robots-disallowed' : 'fetch-or-parse-error', detail, new Date().toISOString());
      results.push({ ...base, outcome: 'error', detail });
      log(`  [${n + 1}/${rows.length}] ${row.title}: ${detail}`);
    }
  }
  return results;
}
