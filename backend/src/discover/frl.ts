/**
 * Discovery on the Federal Register of Legislation.
 *
 * Australia publishes its statute book through a public OData API, so the register is enumerated
 * rather than scraped: the portal states how many titles are in force and hands them over a page
 * at a time. That makes the shortfall check exact -- the API's own count against the rows read --
 * where on a scraped site it is inferred from a results line.
 *
 * Two behaviours of the live service, measured on 7 September 2026 rather than assumed:
 *
 *   - a filter of three conjoined clauses is refused ("Exception has been thrown by the target of
 *     an invocation"), while two are served. So the collection and the in-force test go to the
 *     API and the principal test is applied to the rows here.
 *   - the /latest/text page is an application shell. The authored text lives in the EPUB the
 *     register builds, and the register's own table of contents links straight into it, fragment
 *     and all. That is the link a citation should carry, so it is the document we fetch.
 */
import { createHash } from 'node:crypto';
import { HostSuspended, type Fetcher, type FetchResult } from '../fetch/index.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

const DEFAULT_API = 'https://api.prod.legislation.gov.au/v1/';
/** The API refuses $top=1000 and serves 100, so pages are 100 and the count says when to stop. */
const PAGE = 100;
const MAX_PAGES = 1000;

/** The fields a register entry needs. Selecting them keeps a page from carrying every amendment. */
const SELECT =
  'id,name,collection,status,isInForce,isPrincipal,seriesType,year,number,makingDate,statusHistory';

interface CollectionConfig {
  collection: string;
  kind: DiscoveredInstrument['kind'];
  listing?: string;
}

interface StatusPeriod {
  status: string | null;
  start: string | null;
}

interface TitleRow {
  id: string;
  name: string;
  collection: string;
  status: string | null;
  isInForce: boolean;
  isPrincipal: boolean;
  seriesType: string | null;
  year: number | null;
  number: number | null;
  /** The day the title was made. Not the day it commenced, and regularly years apart from it. */
  makingDate?: string | null;
  /** Every standing the title has held, with the day each began. */
  statusHistory?: StatusPeriod[] | null;
}

const STATUS: Record<string, DiscoveredInstrument['status']> = {
  inforce: 'in-force',
  repealed: 'repealed',
  ceased: 'repealed',
  nevereffective: 'draft',
};

/** The canonical page for a title. Its host routes the fetch through resolveDocument below. */
export function titleUrl(id: string): string {
  return `https://www.legislation.gov.au/${id}/latest/text`;
}

/**
 * Every EPUB document the register's table of contents links to, in document order.
 *
 * A long Act is compiled into several volumes -- the Corporations Act 2001 is seven -- and each is
 * a separate file. Reading only the first would index a fraction of the Act and then report that
 * the rest of it says nothing.
 */
export function textDocumentUrls(shellHtml: string): string[] {
  const found = new Set<string>();
  const re = /https:\/\/www\.legislation\.gov\.au\/[^"'\s]*?\/epub\/OEBPS\/[^"'\s#]+\.html/g;
  for (const m of shellHtml.matchAll(re)) found.add(m[0]);
  return [...found].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

/** Marks where one EPUB volume ends and the next begins, so provisions link to their own volume. */
export const PART_MARKER = 'lexdroid-frl-part';

function apiUrl(base: string, collection: string, skip: number): string {
  const params = new URLSearchParams({
    $filter: `collection eq '${collection}' and isInForce eq true`,
    $select: SELECT,
    $orderby: 'id',
    $top: String(PAGE),
    $count: 'true',
  });
  if (skip > 0) params.set('$skip', String(skip));
  return `${base}titles?${params.toString()}`;
}

/** Pages of children read per Act. Twenty is 2,000 instruments, and more says only how long a list is. */
const MAX_AUTHORISED_PAGES = 20;

/** The register id in a title's own URL: "F2025L01263" in .../F2025L01263/latest/text. */
export function registerIdOf(url: string): string | null {
  return /legislation\.gov\.au\/([A-Z]\d{4}[A-Z]\d{5})(?![A-Za-z0-9])/i.exec(url)?.[1]?.toUpperCase() ?? null;
}

/**
 * One page of the titles an Act authorises.
 *
 * The relation is the register's own: every legislative instrument says which title authorises it,
 * and the API serves the question backwards. In force only, because a repealed instrument is not a
 * requirement a row could cite -- and because it is what takes the Customs Act from 11,891 to
 * 7,649. A second conjoined clause is refused by the service, so the principal test is left out.
 */
function authorisedUrl(base: string, actId: string, skip: number): string {
  const params = new URLSearchParams({
    $filter: 'isInForce eq true',
    $select: 'id,name',
    $orderby: 'id',
    $top: String(PAGE),
    $count: 'true',
  });
  if (skip > 0) params.set('$skip', String(skip));
  return `${base}titles/search(criteria='authorises("${actId}")')?${params.toString()}`;
}

export interface AuthorisedTitle {
  id: string;
  name: string;
}

export interface AuthorisedTitles {
  titles: AuthorisedTitle[];
  /** What the register says the total is, against what was read. Truncation is reported, not hidden. */
  stated: number | null;
  complete: boolean;
}

/**
 * Everything the register says is made under one Act.
 *
 * Capped, because the Customs Act authorises 7,649 in-force tariff concession orders and by-laws.
 * Past the cap the title-stem fallback is what it always was, so truncation loses nothing.
 */
export async function authorisedTitles(
  fetcher: Fetcher,
  actId: string,
  opts: { base?: string; maxPages?: number; log?: (line: string) => void } = {},
): Promise<AuthorisedTitles> {
  const base = opts.base ?? DEFAULT_API;
  const maxPages = opts.maxPages ?? MAX_AUTHORISED_PAGES;
  const log = opts.log ?? ((): void => {});
  const titles: AuthorisedTitle[] = [];
  let stated: number | null = null;
  let skip = 0;

  for (let page = 0; page < maxPages; page += 1) {
    let res;
    try {
      res = await fetcher.fetch(authorisedUrl(base, actId, skip));
    } catch (err) {
      log(`    ${actId}: not read -- ${err instanceof Error ? err.message : String(err)}`);
      return { titles, stated, complete: false };
    }
    if (res.status !== 200) {
      log(`    ${actId}: HTTP ${res.status}`);
      return { titles, stated, complete: false };
    }

    let body: { value?: AuthorisedTitle[]; '@odata.count'?: number };
    try {
      body = JSON.parse(res.body.toString('utf8')) as typeof body;
    } catch {
      log(`    ${actId}: the API answered with something that is not JSON`);
      return { titles, stated, complete: false };
    }
    const rows = body.value;
    if (!Array.isArray(rows)) return { titles, stated, complete: false };
    if (stated === null) stated = body['@odata.count'] ?? null;

    titles.push(...rows);
    skip += rows.length;
    if (rows.length === 0) break;
    if (stated !== null && skip >= stated) break;
  }

  return { titles, stated, complete: stated === null ? true : titles.length >= stated };
}

/**
 * The day the register says the title came into force, and the sentence that says it.
 *
 * Read off `statusHistory` rather than `makingDate`, because the two disagree whenever Parliament
 * backdates or defers: the Taxation Laws Amendment Act (No. 8) 2000 was made on 21 December 2000
 * and is in force from 22 December 1999. `makingDate` is the easier field and the wrong one.
 *
 * The earliest InForce period is the answer; a title that has been repealed and revived holds
 * more than one, and the first is when the instrument began.
 */
export function commencement(row: TitleRow): { on: string; basis: string } | null {
  const started = (row.statusHistory ?? [])
    .filter((p) => (p?.status ?? '').toLowerCase() === 'inforce' && typeof p.start === 'string')
    .map((p) => p.start!.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const on = started[0];
  if (!on) return null;
  return {
    on,
    basis: `The Federal Register of Legislation's status history for this title opens "InForce" on ${on}.`,
  };
}

function officialNumber(row: TitleRow): string | null {
  if (row.number === null || row.year === null) return row.id;
  return `${row.seriesType ?? row.collection} No. ${row.number}, ${row.year}`;
}

export const frlAdapter: Adapter = {
  name: 'frl',

  async discover(ctx) {
    const base = (ctx.portal.adapterConfig['apiBase'] as string | undefined) ?? DEFAULT_API;
    const configs = (ctx.portal.adapterConfig['collections'] as CollectionConfig[] | undefined) ?? [];
    const askedOn = new Date().toISOString().slice(0, 10);
    const found: DiscoveredInstrument[] = [];
    const seen = new Set<string>();

    for (const cfg of configs) {
      let expected: number | null = null;
      let read = 0;
      let skip = 0;

      for (let page = 0; page < MAX_PAGES; page += 1) {
        let res;
        try {
          res = await ctx.fetcher.fetch(apiUrl(base, cfg.collection, skip));
        } catch (err) {
          if (err instanceof HostSuspended) {
            ctx.log(`    stopped enumerating ${cfg.collection}: ${err.message}`);
            break;
          }
          ctx.log(`    ${cfg.collection} from ${skip}: not read -- ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
        if (res.status !== 200) {
          ctx.log(`    ${cfg.collection} from ${skip}: HTTP ${res.status}`);
          break;
        }

        let body: { value?: TitleRow[]; '@odata.count'?: number };
        try {
          body = JSON.parse(res.body.toString('utf8')) as typeof body;
        } catch {
          // The API answers a malformed query with a plain sentence and HTTP 200. Enumerating on
          // is how a partial register gets certified as complete, so this stops the collection.
          ctx.log(`    ${cfg.collection} from ${skip}: the API answered with something that is not JSON`);
          break;
        }
        const rows = body.value;
        if (!Array.isArray(rows)) {
          ctx.log(`    ${cfg.collection} from ${skip}: the response carried no rows`);
          break;
        }
        if (expected === null) {
          expected = body['@odata.count'] ?? null;
          ctx.log(`  ${cfg.collection}: ${expected ?? 'an unstated number of'} title(s) in force`);
        }

        let added = 0;
        for (const row of rows) {
          read += 1;
          // An amending Act's text is instructions to change another Act, never a requirement a
          // row could cite; the register serves the amended text under the principal title.
          if (!row.isPrincipal) continue;
          const url = titleUrl(row.id);
          if (seen.has(url)) continue;
          seen.add(url);
          const began = commencement(row);
          found.push({
            title: row.name,
            url,
            kind: cfg.kind,
            officialNumber: officialNumber(row),
            status: STATUS[(row.status ?? '').toLowerCase()] ?? 'in-force',
            statusBasis:
              `The Federal Register of Legislation records this title as "${row.status ?? 'InForce'}" ` +
              `(${cfg.listing ?? cfg.collection}, asked on ${askedOn})`,
            ...(began ? { commencedOn: began.on, currentToBasis: began.basis } : {}),
          });
          added += 1;
        }
        ctx.log(`    ${cfg.collection} ${skip}-${skip + rows.length}: ${added} principal instrument(s)`);

        skip += rows.length;
        if (rows.length === 0) break;
        if (expected !== null && skip >= expected) break;
      }

      if (expected !== null && read < expected) {
        ctx.log(`    WARNING: the register counts ${expected} ${cfg.collection}(s) in force and ${read} were read`);
      }
    }
    return found;
  },

  /**
   * The authored text behind a title page.
   *
   * The shell page costs one request at the host's ten second crawl delay and yields the EPUB
   * document links; each volume costs one more. Volumes are joined with a marker so the parser can
   * give every provision the link to the volume it is actually in.
   */
  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const shell = await fetcher.fetch(url);
    if (shell.status !== 200) return shell;

    const parts = textDocumentUrls(shell.body.toString('utf8'));
    if (parts.length === 0) return shell;

    const bodies: string[] = [];
    let last: FetchResult | null = null;
    for (const part of parts) {
      const res = await fetcher.fetch(part);
      if (res.status !== 200) return res;
      bodies.push(`<!--${PART_MARKER}:${part}-->\n${res.body.toString('utf8')}`);
      last = res;
    }

    const merged = Buffer.from(bodies.join('\n'), 'utf8');
    return {
      ...last!,
      // One volume is addressable at its own URL and is cited there. Several are not, so the
      // document is the title page and each provision carries the volume link the parser gave it.
      url: parts.length === 1 ? parts[0]! : url,
      finalUrl: parts.length === 1 ? parts[0]! : url,
      body: merged,
      contentHash: createHash('sha256').update(merged).digest('hex'),
      mediaType: 'text/html',
    };
  },
};
