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
import type { Fetcher, FetchResult } from '../fetch/index.js';
import { RobotsDisallowed, CacheMiss, HostSuspended } from '../fetch/index.js';
import { decodeBody } from '../fetch/decode.js';
import { parseDocument, parseScans, scannedPages, storeDocument, verifyOffsets } from '../parse/index.js';
import { namedDocumentLink, pointedDocumentLink, soleDocumentLink } from '../parse/html.js';
import { namesAnInstrument, ownName, statedKind } from '../parse/identity.js';
import { registeredKind } from './titles.js';
import type { EconomyProfile } from '../profile/types.js';
import { portalId } from '../profile/index.js';
import { cbicDownloadUrl, resolveCbicDocument } from './cbic.js';
import { crawlAdapter } from './crawl.js';
import { drupalAdapter } from './drupal.js';
import { frlAdapter } from './frl.js';
import { indiaCodeAdapter } from './indiacode.js';
import { legalinfoAdapter } from './legalinfo.js';
import { ipsAdapter } from './ips.js';
import { laoGazetteAdapter } from './laogazette.js';
import { ocsAdapter } from './ocs.js';
import { fipcsAdapter } from './fipcs.js';
import { lomAdapter } from './lom.js';
import { lomSubsidAdapter } from './lom-subsid.js';
import { sitemapAdapter } from './sitemap.js';
import { ssoAdapter } from './sso.js';
import { wpAdapter } from './wp.js';
import { instrumentWords } from './titles.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

export * from './types.js';

const ADAPTERS: Record<string, Adapter> = {
  crawl: crawlAdapter,
  drupal: drupalAdapter,
  fipcs: fipcsAdapter,
  frl: frlAdapter,
  indiacode: indiaCodeAdapter,
  legalinfo: legalinfoAdapter,
  ips: ipsAdapter,
  laogazette: laoGazetteAdapter,
  lom: lomAdapter,
  'lom-subsid': lomSubsidAdapter,
  ocs: ocsAdapter,
  sitemap: sitemapAdapter,
  sso: ssoAdapter,
  wp: wpAdapter,
};

export interface RegisterResult {
  portal: string;
  found: number;
  added: number;
  error?: string;
}

export interface RegisterOptions {
  /**
   * Walk only the portals whose name or URL contains this, case-insensitively.
   *
   * Fixing one portal's adapter and re-walking the whole profile to see whether it worked costs
   * every other portal a crawl it did not need, and Malaysia's three Laws of Malaysia listings
   * are sixteen thousand instruments between them. A repair is scoped to the thing repaired.
   */
  portalLike?: string;
}

export async function register(
  db: Db,
  profile: EconomyProfile,
  fetcher: Fetcher,
  log: (line: string) => void = () => {},
  opts: RegisterOptions = {},
): Promise<RegisterResult[]> {
  const results: RegisterResult[] = [];
  const now = new Date().toISOString();

  // What this economy calls its own instruments, read off its Zone 0 profile once for the whole
  // walk. Empty for an economy that publishes in English, which is what leaves those registers
  // exactly as they were.
  const vocabulary = instrumentWords(profile.instrumentTypes);
  if (vocabulary.length > 0) {
    log(`reading titles in ${profile.name}'s own words: ${vocabulary.length} terms`);
  }

  const insert = db.prepare(
    `INSERT INTO instrument (economy_code, title, official_number, kind, status, status_basis,
                             commenced_on, last_amended_on, current_to, timeframe_basis,
                             made_under_name, source_url,
                             discovered_via, discovered_at, title_provisional, also_at)
     VALUES (?, ?, ?, ?, COALESCE(?, 'unknown'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(economy_code, source_url) DO UPDATE SET
       made_under_name = COALESCE(excluded.made_under_name, instrument.made_under_name),
       status = CASE WHEN excluded.status_basis IS NOT NULL THEN excluded.status ELSE instrument.status END,
       status_basis = COALESCE(excluded.status_basis, instrument.status_basis),
       commenced_on = COALESCE(excluded.commenced_on, instrument.commenced_on),
       last_amended_on = COALESCE(excluded.last_amended_on, instrument.last_amended_on),
       current_to = COALESCE(excluded.current_to, instrument.current_to),
       timeframe_basis = COALESCE(excluded.timeframe_basis, instrument.timeframe_basis),
       also_at = COALESCE(excluded.also_at, instrument.also_at)
     WHERE excluded.status_basis IS NOT NULL OR excluded.also_at IS NOT NULL`,
  );

  const want = opts.portalLike?.toLowerCase();
  const portals = want
    ? profile.portals.filter((p) => `${p.name} ${p.url}`.toLowerCase().includes(want))
    : profile.portals;
  if (want && portals.length === 0) {
    throw new Error(`No portal of ${profile.code} has "${opts.portalLike}" in its name or URL.`);
  }

  for (const portal of portals) {
    // A declared portal nothing can read is a hole in the corpus, and it was skipped in silence.
    // Malaysia declares its customs department, its communications commission and seven more
    // regulators, and registers not one document from any of them -- so the orders, guidelines and
    // codes those bodies publish are absent, and a cell reads that absence as "no requirement".
    // Recorded here so the shortfall is a number on the run rather than a thing nobody said.
    if (!portal.adapter) {
      results.push({ portal: portal.name, found: 0, added: 0, error: 'no adapter reads this portal' });
      db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
        .run('discover', portal.url, 'portal-unread', `${portal.name} (${portal.kind}) has no adapter`, now);
      log(`${portal.name} (${portal.url}) -- no adapter reads this portal`);
      continue;
    }
    const adapter = ADAPTERS[portal.adapter];
    if (!adapter) {
      results.push({ portal: portal.name, found: 0, added: 0, error: `no adapter named "${portal.adapter}"` });
      continue;
    }
    log(`${portal.name} (${portal.url})`);
    const id = portalId(db, profile.code, portal.url);

    // Rewritten per walk, not appended to: the question this answers is what the listing looks
    // like now, and a ledger that keeps every walk's answer cannot be read against a threshold.
    const setAsideRows: { subject: string; reason: string; detail: string | null }[] = [];
    const setAside = (entry: { subject: string; reason: string; detail?: string }) => {
      setAsideRows.push({ subject: entry.subject, reason: entry.reason, detail: entry.detail ?? null });
    };

    let found: DiscoveredInstrument[] = [];
    try {
      found = await adapter.discover({ portal, fetcher, log, setAside, vocabulary });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ portal: portal.name, found: 0, added: 0, error: message });
      db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
        .run('discover', portal.url, 'portal-walk-failed', message, now);
      log(`  failed: ${message}`);
      continue;
    }

    let added = 0;
    let publications = 0;
    db.transaction(() => {
      for (const item of found) {
        // A re-walk re-asserts what the listing says: an instrument stays in the register, and
        // its standing is refreshed from the listing it was found on this time.
        const before = db.prepare('SELECT 1 FROM instrument WHERE economy_code = ? AND source_url = ?')
          .get(profile.code, item.url);
        // What the listing corroborates, not what the title claims. `kindOf` reads the title, and
        // a paper named after the Act it discusses reads as that Act -- which is how a regulator's
        // consultation papers came to hold seats in the reserve the shortlist keeps for statutes.
        const kind = registeredKind(item.kind, item);
        if (kind !== item.kind) publications += 1;
        insert.run(
          profile.code, item.title, item.officialNumber ?? null, kind,
          item.status ?? null, item.statusBasis ?? null, item.commencedOn ?? null,
          item.lastAmendedOn ?? null, item.currentTo ?? null, item.currentToBasis ?? null,
          item.madeUnder ?? null, item.url, `portal:${id}`, now,
          item.titleProvisional ? 1 : 0,
          item.alsoAt?.length ? JSON.stringify(item.alsoAt) : null,
        );
        if (!before) added += 1;
      }
    })();
    if (setAsideRows.length > 0) {
      const reasons = [...new Set(setAsideRows.map((r) => r.reason))];
      db.transaction(() => {
        const clear = db.prepare(
          `DELETE FROM discard WHERE stage = 'discover' AND reason = ? AND detail LIKE ?`,
        );
        const write = db.prepare(
          `INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES ('discover', ?, ?, ?, ?)`,
        );
        for (const reason of reasons) clear.run(reason, `${portal.url}%`);
        for (const r of setAsideRows) {
          write.run(r.subject, r.reason, `${portal.url} -- ${r.detail ?? ''}`, now);
        }
      })();
    }
    log(
      `  ${found.length} instrument(s) listed, ${added} new to the register` +
        (publications > 0 ? `, ${publications} registered as publications about the law` : ''),
    );
    // A portal that was walked and yielded nothing is the same hole as a portal nothing can walk,
    // and until now only the second was recorded. Seven of the thirty declared Australian,
    // Malaysian and Singaporean sources are in this state -- the e-Gazette and MyIPO answer 403,
    // the ACCC serves an API the adapter reads as empty, the Border Force publishes no index at
    // all -- and every one of them looked, in the run's own output, exactly like a regulator that
    // happens to publish no instruments. A cell reads that as "no requirement".
    if (found.length === 0) {
      db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
        .run('discover', portal.url, 'portal-yielded-nothing',
          `${portal.name} (${portal.kind}) was walked by the ${portal.adapter} adapter and listed no instruments`, now);
      results.push({
        portal: portal.name,
        found: 0,
        added: 0,
        error: `walked by the ${portal.adapter} adapter and listed no instruments`,
      });
      continue;
    }
    results.push({ portal: portal.name, found: found.length, added });
  }

  const linked = linkStatedParents(db, profile.code);
  if (linked.stated > 0) {
    log(`Parentage -- ${linked.stated} instrument(s) name the Act they are made under, ${linked.linked} of those Acts are in the register`);
  }

  return results;
}

export interface StatedParentage {
  /** Instruments whose register names the Act they are made under. */
  stated: number;
  /** Of those, the ones whose named Act is an Act we have registered. */
  linked: number;
}

/**
 * Link each instrument to the Act its own register says it was made under.
 *
 * Australia's register answers this backwards -- ask an Act what it authorises -- and that is
 * what `linkParents` walks. India's answers it forwards: every rule, regulation, notification and
 * order carries the name of its enabling Act, and the adapter was putting that name in a sentence
 * and throwing it away. Nothing else recovers it; a title is a drafting convention and the
 * instruments that matter break it.
 *
 * Matched on the exact stated name, case-insensitively. A near match is not attempted: linking a
 * rule to the wrong Act would put the wrong instrument at the head of a cell's evidence, and an
 * unlinked rule still carries the name a reviewer can read.
 */
export function linkStatedParents(db: Db, economy: string): StatedParentage {
  const stated = (
    db.prepare(
      `SELECT COUNT(*) n FROM instrument WHERE economy_code = ? AND made_under_name IS NOT NULL`,
    ).get(economy) as { n: number }
  ).n;
  if (stated === 0) return { stated: 0, linked: 0 };

  const acts = new Map<string, number>();
  for (const row of db.prepare(
    `SELECT id, title FROM instrument WHERE economy_code = ? AND kind = 'act'`,
  ).all(economy) as { id: number; title: string }[]) {
    acts.set(row.title.trim().toLowerCase(), row.id);
  }

  const update = db.prepare(
    `UPDATE instrument SET made_under_instrument_id = ?, made_under_basis = ? WHERE id = ?`,
  );
  let linked = 0;
  db.transaction(() => {
    for (const row of db.prepare(
      `SELECT id, made_under_name FROM instrument
        WHERE economy_code = ? AND made_under_name IS NOT NULL AND made_under_instrument_id IS NULL`,
    ).all(economy) as { id: number; made_under_name: string }[]) {
      const parent = acts.get(row.made_under_name.trim().toLowerCase());
      // An Act that names itself as its own parent is the register repeating the title, not a
      // relation, and a row pointing at itself would make the contents walk cycle.
      if (parent === undefined || parent === row.id) continue;
      update.run(
        parent,
        `The register records this instrument as made under "${row.made_under_name}".`,
        row.id,
      );
      linked += 1;
    }
  })();

  return { stated, linked };
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
async function readEdition(
  db: Db, fetcher: Fetcher, instrumentId: number, url: string, languages: readonly string[],
): Promise<number | null> {
  const now = () => new Date().toISOString();
  const discard = (reason: string, detail: string): null => {
    db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
      .run('fetch', url, reason, detail, now());
    return null;
  };
  try {
    const fetched = await fetchDocument(url, fetcher);
    if (fetched.status !== 200) return discard('non-200-response', `HTTP ${fetched.status}`);

    const parsed = await parseDocument(fetched, { languages });
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
  official_number: string | null;
  status: string;
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
  /**
   * Only the instruments nothing could be read out of. When the reason a document was unread is
   * one the parser has since learned to handle, this retries exactly those and nothing else.
   */
  unreadOnly?: boolean;
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

/**
 * The adapter that stands behind an instrument's portal, if the portal declares one.
 *
 * Exported because reading a document is not the only thing that needs it: anything re-parsing the
 * corpus has to resolve a document the way the read path resolves it, and for a long Act that means
 * the adapter joining the EPUB volumes rather than the title page sitting at the document's URL.
 */
/**
 * An instrument's document, for the URLs whose address is a viewer rather than the document. Most
 * are fetched as they stand; a host that serves an app at the public address and the document from
 * an API behind it is asked the way its own page asks, whichever adapter registered the URL.
 */
export async function fetchDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
  return cbicDownloadUrl(url) ? resolveCbicDocument(url, fetcher) : fetcher.fetch(url);
}

export function adapterFor(db: Db, profile: EconomyProfile, via: string): Adapter | null {
  const id = Number(via.replace('portal:', ''));
  const row = db.prepare('SELECT url FROM portal WHERE id = ?').get(id) as { url: string } | undefined;
  const portal = row ? profile.portals.find((p) => p.url === row.url) : undefined;
  return portal?.adapter ? ADAPTERS[portal.adapter] ?? null : null;
}

/**
 * Why a document may read next time when it did not this time: an empty body, which is what a
 * timeout or a rate limit's blank page looks like, and a parser that threw. Everything else -- a
 * scan with no OCR, a landing page, another instrument's text, a type no parser handles -- is a
 * fact about the document, and asking again gets the same answer.
 */
export const RETRYABLE = ['empty', 'parse-error'] as const;

/** Three tries in all: the first, and two more. Past that it is the document, not the moment. */
export const MAX_ATTEMPTS = 3;

/**
 * How much more a linked file must say before it is taken for the instrument the page names.
 *
 * Three, because a page that is publishing itself as a PDF cannot be under a third of its own
 * length, and an announcement of a document always is.
 */
const WRAPPER_GAIN = 3;

/**
 * A file a page links, or null where another host would not give it to us. Mongolia's legalinfo.mn
 * links amendments at old.legalinfo.mn, a name that no longer resolves; three of those in a row
 * suspended that host and the suspension stopped the read of every law still queued on
 * legalinfo.mn itself. The page is still the page: where the file it links is out of reach, the
 * page is what is read. A failure on the page's own host is the page's host failing, and is
 * thrown as it always was.
 */
async function linkedFile(fetcher: Fetcher, url: string, pageUrl: string, log: (line: string) => void): Promise<FetchResult | null> {
  try {
    return await fetcher.fetch(url);
  } catch (err) {
    if (err instanceof CacheMiss || new URL(url).host === new URL(pageUrl).host) throw err;
    log(`  linked file not read, the page is kept: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * The images of a scanned page, in order: decoded where the page carries them inline, fetched where
 * it links them. Null when any page of it cannot be had, since an instrument missing a page is
 * not one to read as whole.
 */
async function scanImages(fetcher: Fetcher, scans: readonly string[], pageUrl: string, log: (line: string) => void): Promise<Buffer[] | null> {
  const images: Buffer[] = [];
  for (const scan of scans) {
    if (scan.startsWith('data:')) {
      images.push(Buffer.from(scan.slice(scan.indexOf(',') + 1), 'base64'));
      continue;
    }
    const fetched = await linkedFile(fetcher, scan, pageUrl, log);
    if (!fetched || fetched.status !== 200 || !/^image\//i.test(fetched.mediaType)) return null;
    images.push(fetched.body);
  }
  return images;
}

/** What a parse actually yielded to search, which is the only comparable measure of a document. */
function textLength(parsed: { sections: { text: string }[] }): number {
  return parsed.sections.reduce((n, s) => n + s.text.length, 0);
}

export async function materialise(
  db: Db,
  profile: EconomyProfile,
  fetcher: Fetcher,
  opts: MaterialiseOptions = {},
): Promise<MaterialiseResult[]> {
  const log = opts.log ?? (() => {});

  const where = opts.unreadOnly
    ? `i.economy_code = ? AND EXISTS (
         SELECT 1 FROM document d JOIN unread_document u ON u.document_id = d.id
          WHERE d.instrument_id = i.id)`
    : opts.reparse
    ? `i.economy_code = ? AND EXISTS (SELECT 1 FROM document d WHERE d.instrument_id = i.id)`
    : opts.refresh
      ? 'i.economy_code = ?'
      : // Nothing fetched yet, or fetched and unreadable for a reason that may not recur. A row
        // existing is not the instrument having been read: an empty page, a timeout's partial body
        // or a parser error left one behind, and the default used to skip every instrument that had
        // one, so a document shortlisted for an answer was never asked for a second time.
        `i.economy_code = ? AND (
           NOT EXISTS (SELECT 1 FROM document d WHERE d.instrument_id = i.id)
           OR (NOT EXISTS (SELECT 1 FROM document d JOIN section s ON s.document_id = d.id WHERE d.instrument_id = i.id)
               AND EXISTS (SELECT 1 FROM document d JOIN unread_document u ON u.document_id = d.id
                            WHERE d.instrument_id = i.id
                              AND u.reason IN (${RETRYABLE.map((r) => `'${r}'`).join(', ')})
                              AND u.attempts < ${MAX_ATTEMPTS})))`;
  const params: unknown[] = [profile.code];
  let sql = `SELECT i.id, i.title, i.source_url, i.discovered_via, i.title_provisional, i.also_at,
                    i.official_number, i.status
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
    const adapter = adapterFor(db, profile, row.discovered_via);
    const base = { instrumentId: row.id, title: row.title, url: row.source_url };
    try {
      let fetched = adapter?.resolveDocument
        ? await adapter.resolveDocument(row.source_url, fetcher)
        : await fetchDocument(row.source_url, fetcher);

      if (fetched.status !== 200) {
        // Recorded, not just reported: an instrument the corpus does not contain has to be
        // countable afterwards, or "we searched and found nothing" quietly includes it.
        db.prepare('INSERT INTO discard (stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?)')
          .run('fetch', row.source_url, 'non-200-response', `HTTP ${fetched.status}`, new Date().toISOString());
        results.push({ ...base, outcome: 'error', detail: `HTTP ${fetched.status}` });
        log(`  [${n + 1}/${rows.length}] ${row.title}: HTTP ${fetched.status}`);
        continue;
      }

      let parsed = await parseDocument(fetched, { languages: profile.officialLanguages });

      // A page of menus that publishes exactly one file is not an index of leads; it is the
      // instrument's own wrapper, and the file is the document to cite.
      let adopted = false;
      const wrapper = parsed.unread?.reason === 'landing-page' || parsed.unread?.reason === 'empty';
      if (wrapper && /html/i.test(fetched.mediaType)) {
        const only = soleDocumentLink(decodeBody(fetched), fetched.finalUrl);
        const inner = only ? await linkedFile(fetcher, only, fetched.finalUrl, log) : null;
        if (only && inner) {
          const reparsed = inner.status === 200 ? await parseDocument(inner, { languages: profile.officialLanguages }) : null;
          if (reparsed && !reparsed.unread) {
            fetched = inner;
            parsed = reparsed;
            adopted = true;
            log(`  [${n + 1}/${rows.length}] the page wraps one document: ${only}`);
          }
        }
      }

      // The harder case, and the one a page of menus does not cover: a page that parses perfectly
      // well and is still not the instrument. A regulator announces a policy document by posting
      // the announcement, and the announcement has prose in it, so it is never unread and the
      // block above never runs. Where exactly one linked file calls itself by the instrument's
      // name and says several times more than the page does, the page was the notice.
      //
      // The gain test is the whole of the guard and it is not decoration. Without it the same
      // rule replaces every ASD cyber-security guideline and a 210,437-character APRA guide for
      // directors with the PDF each one offers of itself -- pages that ARE the instrument, which
      // link their own file under their own name exactly as an announcement does. Measured over
      // all three economies, that is the only thing separating the two: a page publishing itself
      // as a PDF came back between 0.02 and 1.63 times its own length, and every announcement
      // between 14 and 582 times. Nothing landed in between.
      //
      // A link naming the instrument is one of the two ways a page offers its own file. The other
      // is a link naming nothing -- "downloaded here" -- which says which file without saying
      // which document, and is why `pointedDocumentLink` stands beside the named one rather than
      // inside it. Both answer the same question and both are weighed the same way.
      if (!adopted && /html/i.test(fetched.mediaType)) {
        const body = decodeBody(fetched);
        const named = namedDocumentLink(body, fetched.finalUrl, row.title) ?? pointedDocumentLink(body, fetched.finalUrl);
        const inner = named && named !== fetched.finalUrl ? await linkedFile(fetcher, named, fetched.finalUrl, log) : null;
        if (named && inner) {
          const reparsed = inner.status === 200 ? await parseDocument(inner, { languages: profile.officialLanguages }) : null;
          const held = textLength(parsed);
          const offered = reparsed ? textLength(reparsed) : 0;
          if (reparsed && !reparsed.unread && offered > 0 && offered >= held * WRAPPER_GAIN) {
            fetched = inner;
            parsed = reparsed;
            log(
              `  [${n + 1}/${rows.length}] the page announces the document (${held} -> ${offered} chars): ${named}`,
            );
          }
        }
      }

      // A page with nothing to read may be showing the instrument as a scan: read the images.
      if (parsed.unread?.reason === 'empty' && /html/i.test(fetched.mediaType)) {
        const scans = scannedPages(fetched);
        const images = scans.length ? await scanImages(fetcher, scans, fetched.finalUrl, log) : null;
        if (images) {
          parsed = await parseScans(fetched, images, profile.officialLanguages);
          log(`  [${n + 1}/${rows.length}] the page is ${images.length} scanned page(s): ${parsed.unread ? parsed.unread.detail : `${parsed.sections.length} section(s) by OCR`}`);
        }
      }

      const stored = storeDocument(db, { instrumentId: row.id, fetched, parsed });

      // What the document says about itself, which is the only acceptable evidence for a date.
      if (parsed.meta['officialNumber'] || parsed.meta['commencedOn'] || parsed.meta['lastAmendedOn']) {
        db.prepare(
          `UPDATE instrument SET
             official_number = COALESCE(?, official_number),
             commenced_on = COALESCE(?, commenced_on),
             last_amended_on = COALESCE(?, last_amended_on),
             timeframe_basis = COALESCE(?, timeframe_basis)
           WHERE id = ?`,
        ).run(
          parsed.meta['officialNumber'] ?? null,
          parsed.meta['commencedOn'] ?? null,
          parsed.meta['lastAmendedOn'] ?? null,
          [parsed.meta['commencementBasis'], parsed.meta['lastAmendedBasis']].filter(Boolean).join(' | ') || null,
          row.id,
        );
      }

      // The language is what the document is written in, which the parser reads off the text and
      // not off a date line. It used to be set inside the block above, so an instrument whose page
      // published no number and no dates -- most of the Malay-language corpus -- stayed recorded as
      // whatever language the register guessed, and the retrieval side then paired it wrongly.
      const language = parsed.sections[0]?.language ?? null;
      if (language) db.prepare('UPDATE instrument SET language = ? WHERE id = ?').run(language, row.id);

      // A document registered under an upload slug, or under a title that names no instrument at
      // all, takes the name it calls itself by.
      // Its citation provision where the parser found no title: a portal that filed an Order under
      // its own page theme still served a document whose section 1 says what the Order is.
      //
      // Asked only of a filed title that names no instrument, and no longer of every title a crawl
      // marked provisional. `ownName` falls back to the page's own <title> where the document
      // states no name in its provisions, and a page's <title> is the site's name for the page:
      // walking the Commission's guidelines library registered twenty guidelines, each correctly
      // named by the link it was listed under, and renamed every one of them to "Malaysian
      // Communications And Multimedia Commission (MCMC) | ... - Guidelines", which ends in an
      // instrument's noun and so passed the guard. A title that already names an instrument is
      // not improved by a title that names the website. The templates and upload slugs this rule
      // was built for -- "Compilations-Agency prepared template", "250312-LI-TSY_47_0757-Mergers"
      // -- name no instrument either way, so all 48 of those renames stand.
      const callsItself = ownName(parsed.sections, parsed.title);
      if (!namesAnInstrument(row.title) && callsItself) {
        db.prepare('UPDATE instrument SET title = ?, title_provisional = 0 WHERE id = ?')
          .run(callsItself, row.id);
        log(`  [${n + 1}/${rows.length}] names itself "${callsItself}"`);
      }

      // And where the source said nothing about what the document is, the document's own opening
      // provision does. Gated on the same silence `registeredKind` tests for, so a listing that
      // stated an identifier or a standing keeps the kind it stated.
      const sourceSaysNothing =
        (row.official_number ?? '').trim() === '' && (row.status === 'unknown' || !row.status);
      if (sourceSaysNothing) {
        const callsItselfA = statedKind(parsed.sections, row.title);
        const filed = (db.prepare('SELECT kind FROM instrument WHERE id = ?').get(row.id) as { kind: string | null }).kind;
        if (callsItselfA && callsItselfA !== filed) {
          db.prepare('UPDATE instrument SET kind = ? WHERE id = ?').run(callsItselfA, row.id);
          log(`  [${n + 1}/${rows.length}] calls itself a ${callsItselfA}, filed as ${filed ?? 'nothing'}`);
        }
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
        const more = await readEdition(db, fetcher, row.id, url, profile.officialLanguages);
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
