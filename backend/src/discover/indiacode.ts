/**
 * Discovery on India Code's public DSpace repository.
 *
 * The migrated site is an Angular shell. Its source of truth is the read-only HAL/JSON API under
 * /server/api, which exposes the register's own instrument category, jurisdiction, ministry,
 * identifiers, repeal flag and parent/section relationships. Walking that API is both more exact
 * and less brittle than scraping rendered search results.
 *
 * India Code contains Central, State and Union Territory law in one repository. RDTII needs an
 * economy-wide answer, so the server query asks for CENTRAL and every returned row is checked
 * again before registration. A portal query that ignores its filter therefore creates a visible
 * count shortfall; it never leaks one State's law into a claim about India.
 */
import { createHash } from 'node:crypto';
import type { FetchResult } from '../fetch/index.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

const DEFAULT_API = 'https://indiacode.gov.in/server/api/';
const DEFAULT_PAGE_SIZE = 100;
const MAX_REGISTER_PAGES = 200;
const MAX_SECTION_PAGES = 20;

export const INDIA_CODE_MEDIA_TYPE = 'application/vnd.lexdroid.indiacode+json';

interface MetadataValue {
  value?: string;
  language?: string | null;
}

export interface IndiaCodeItem {
  id?: string;
  uuid?: string;
  name?: string;
  handle?: string;
  metadata?: Record<string, MetadataValue[]>;
  type?: string;
}

interface SearchObject {
  _embedded?: { indexableObject?: IndiaCodeItem };
}

interface SearchResponse {
  _embedded?: {
    searchResult?: {
      _embedded?: { objects?: SearchObject[] };
      page?: { number?: number; size?: number; totalPages?: number; totalElements?: number };
    };
  };
}

interface CollectionConfig {
  collection: string;
  kind: DiscoveredInstrument['kind'];
}

export interface IndiaCodeResolved {
  sourceUrl: string;
  item: IndiaCodeItem;
  sections: IndiaCodeItem[];
}

function value(item: IndiaCodeItem, key: string): string | null {
  const raw = item.metadata?.[key]?.[0]?.value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function cleanTitle(raw: string): string {
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function itemUrl(origin: string, item: IndiaCodeItem): string | null {
  const uuid = item.uuid ?? item.id;
  return uuid ? `${origin}/items/${uuid}` : null;
}

function apiBase(configured: unknown): string {
  const base = typeof configured === 'string' && configured ? configured : DEFAULT_API;
  return base.endsWith('/') ? base : `${base}/`;
}

/** A stable, server-side query for one category of Central instruments. */
export function indiaCodeSearchUrl(
  base: string,
  collection: string,
  jurisdiction: string,
  page: number,
  size: number,
): string {
  const url = new URL('discover/search/objects', base);
  url.searchParams.set('query', `dc.identifier.state_name:${jurisdiction}`);
  url.searchParams.set('f.identifier_collection', `${collection},equals`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(size));
  return url.toString();
}

function rows(body: Buffer): { items: IndiaCodeItem[]; totalPages: number | null; total: number | null } {
  let parsed: SearchResponse;
  try {
    parsed = JSON.parse(body.toString('utf8')) as SearchResponse;
  } catch {
    throw new Error('the India Code API did not answer with JSON');
  }
  const result = parsed._embedded?.searchResult;
  if (!result) throw new Error('the India Code API answer has no searchResult');
  const objects = result._embedded?.objects ?? [];
  return {
    items: objects.map((o) => o._embedded?.indexableObject).filter((i): i is IndiaCodeItem => Boolean(i)),
    totalPages: typeof result.page?.totalPages === 'number' ? result.page.totalPages : null,
    total: typeof result.page?.totalElements === 'number' ? result.page.totalElements : null,
  };
}

function officialNumber(item: IndiaCodeItem, collection: string): string | null {
  const year = value(item, 'dc.date.act_year') ?? value(item, 'dc.date.issued')?.slice(0, 4) ?? null;
  const act = value(item, 'dc.identifier.act_number');
  if (collection === 'ACT' && act) return `Act No. ${act}${year ? ` of ${year}` : ''}`;

  const direct = [
    'dc.identifier.notification_number',
    'dc.identifier.rule_number',
    'dc.identifier.regulation_number',
    'dc.identifier.order_number',
    'dc.identifier.givenid',
  ].map((key) => value(item, key)).find(Boolean);
  return direct ?? null;
}

/**
 * The day India Code says the instrument came into force, or null where it does not say plainly.
 *
 * The field carries two formats in the one collection -- 105 Central acts write 1885-10-01 and 635
 * write 06-05-2016 -- so a single parse would silently misread one of them. Day-first is measured,
 * not assumed: across those 847 acts the first component reaches 31 and passes 12 on 330 of them,
 * while the second never passes 12.
 *
 * The 42 it refuses are refused on purpose. A few are merely sloppy (1-06-1872, 4-8-2022), but most
 * are prose recording commencement section by section -- "19th April, 2021- Sections 2 ... 4 to 14"
 * -- or two dates at once. An instrument whose parts commenced on different days has no one date to
 * record, and picking one would assert as fact the thing the field is admitting it cannot say.
 */
function commencedOn(item: IndiaCodeItem): string | null {
  const raw = value(item, 'dc.date.enforcement_date')?.trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  const parts = iso ? [iso[1]!, iso[2]!, iso[3]!] : dmy ? [dmy[3]!, dmy[2]!, dmy[1]!] : null;
  if (!parts) return null;
  const [y, m, d] = parts;
  const day = `${y}-${m}-${d}`;
  const when = new Date(`${day}T00:00:00Z`);
  // A date the calendar does not have rolls forward, so 31-02 would otherwise pass as 3 March.
  if (Number.isNaN(when.getTime()) || when.toISOString().slice(0, 10) !== day) return null;
  // A commencement still in the future is a date the instrument has not reached yet.
  return when.getTime() <= Date.now() ? day : null;
}

function statusOf(item: IndiaCodeItem, readOn: string): Pick<DiscoveredInstrument, 'status' | 'statusBasis'> {
  const raw = value(item, 'dc.identifier.repealed');
  if (raw?.toLowerCase() === 'true') {
    return {
      status: 'repealed',
      statusBasis: `India Code records repealed=true for this archived item (API read on ${readOn})`,
    };
  }

  /*
    The repeal flag alone cannot decide this. Measured over the whole Central register it is false
    on 845 of 847 acts and absent on the other two, and false on every rule, regulation,
    notification and order sampled -- a flag that never says true separates nothing. Left there,
    every one of the 12,900 instruments India registers is status-unknown, which is not caution but
    an absence of any filter at all.

    The commencement date is the signal the register actually carries, and only for acts. Read with
    a stated commencement and no recorded repeal, an instrument is in force; the basis says exactly
    that, so a reviewer can see what the claim rests on rather than taking the word.
  */
  const commenced = commencedOn(item);
  if (commenced) {
    return {
      status: 'in-force',
      statusBasis:
        `India Code records commencement on ${commenced} and records no repeal ` +
        `(API read on ${readOn})`,
    };
  }

  if (raw?.toLowerCase() === 'false') {
    return {
      statusBasis:
        `India Code records repealed=false for this archived item (API read on ${readOn}); ` +
        'that is not evidence of commencement, so status remains unknown until the instrument text is read',
    };
  }
  return {};
}

const DEFAULT_COLLECTIONS: CollectionConfig[] = [
  { collection: 'ACT', kind: 'act' },
  { collection: 'RULE', kind: 'rule' },
  { collection: 'REGULATION', kind: 'regulation' },
  { collection: 'NOTIFICATION', kind: 'notice' },
  { collection: 'ORDER', kind: 'order' },
];

function parentIdentity(item: IndiaCodeItem): { field: string; id: string } | null {
  const collection = value(item, 'dc.identifier.collection')?.toUpperCase();
  const fieldByCollection: Record<string, string> = {
    ACT: 'dc.identifier.act_id',
    RULE: 'dc.identifier.rule_id',
    REGULATION: 'dc.identifier.regulation_id',
    NOTIFICATION: 'dc.identifier.notification_id',
    ORDER: 'dc.identifier.order_id',
  };
  const preferred = collection ? fieldByCollection[collection] : undefined;
  if (preferred) {
    const id = value(item, preferred);
    if (id) return { field: preferred, id };
  }
  const id = value(item, 'dc.identifier.id');
  return id ? { field: 'dc.identifier.id', id } : null;
}

function sectionSearchUrl(base: string, parent: { field: string; id: string }, page: number): string {
  const url = new URL('discover/search/objects', base);
  url.searchParams.set('query', `${parent.field}:${parent.id}`);
  url.searchParams.set('f.identifier_collection', 'SECTION,equals');
  url.searchParams.set('page', String(page));
  url.searchParams.set('size', String(DEFAULT_PAGE_SIZE));
  return url.toString();
}

function sectionOrder(item: IndiaCodeItem): number {
  const raw = value(item, 'dc.identifier.order_number') ?? value(item, 'dc.identifier.section_number') ?? '';
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export const indiaCodeAdapter: Adapter = {
  name: 'indiacode',

  async discover(ctx) {
    const base = apiBase(ctx.portal.adapterConfig['apiBase']);
    const origin = new URL(ctx.portal.url).origin;
    const jurisdiction = String(ctx.portal.adapterConfig['jurisdiction'] ?? 'CENTRAL').toUpperCase();
    const configuredSize = Number(ctx.portal.adapterConfig['pageSize'] ?? DEFAULT_PAGE_SIZE);
    const pageSize = Math.max(1, Math.min(DEFAULT_PAGE_SIZE, Math.floor(configuredSize)));
    const collections =
      (ctx.portal.adapterConfig['collections'] as CollectionConfig[] | undefined) ?? DEFAULT_COLLECTIONS;
    const readOn = new Date().toISOString().slice(0, 10);
    const found: DiscoveredInstrument[] = [];
    const seen = new Set<string>();

    for (const cfg of collections) {
      let expected: number | null = null;
      let read = 0;
      let accepted = 0;

      for (let page = 0; page < MAX_REGISTER_PAGES; page += 1) {
        const url = indiaCodeSearchUrl(base, cfg.collection, jurisdiction, page, pageSize);
        const res = await ctx.fetcher.fetch(url);
        if (res.status !== 200) throw new Error(`${cfg.collection} search answered HTTP ${res.status}`);
        const result = rows(res.body);
        expected ??= result.total;
        read += result.items.length;

        for (const item of result.items) {
          // Defence in depth: a server-side query must not be trusted to define legal scope.
          if (value(item, 'dc.identifier.state_name')?.toUpperCase() !== jurisdiction) continue;
          if (value(item, 'dc.identifier.collection')?.toUpperCase() !== cfg.collection.toUpperCase()) continue;
          const url = itemUrl(origin, item);
          const title = cleanTitle(item.name ?? value(item, 'dc.title') ?? '');
          if (!url || !title || seen.has(url)) continue;
          seen.add(url);
          found.push({
            title,
            url,
            kind: cfg.kind,
            officialNumber: officialNumber(item, cfg.collection),
            ...statusOf(item, readOn),
          });
          accepted += 1;
        }

        const lastPage = result.items.length === 0 ||
          (result.totalPages !== null && page + 1 >= result.totalPages);
        if (!lastPage && (page + 1) % 10 === 0) {
          ctx.log(
            `    ${cfg.collection}: ${read}${expected === null ? '' : `/${expected}`} API row(s) read`,
          );
        }
        if (result.items.length === 0) break;
        if (result.totalPages !== null && page + 1 >= result.totalPages) break;
      }

      ctx.log(`  ${cfg.collection}: ${accepted} Central instrument(s) accepted from ${read} API row(s)`);
      if (expected !== null && read < expected) {
        ctx.log(`    WARNING: India Code counts ${expected} matching row(s), but only ${read} were read`);
      }
      if (accepted < read) {
        ctx.log(`    ${read - accepted} row(s) rejected because their own category or jurisdiction metadata did not match`);
      }
    }
    return found;
  },

  /**
   * Resolve an instrument into India Code's own structured provision records.
   *
   * The UI page is only an application shell. Each section is a first-class DSpace item carrying
   * its number, title, page and provision text, so the resolver joins those official API records
   * into one deterministic payload. The parser then builds offsets over exactly these bytes.
   */
  async resolveDocument(url: string, fetcher): Promise<FetchResult> {
    const parsedUrl = new URL(url);
    const uuid = /^\/items\/([^/?#]+)$/.exec(parsedUrl.pathname)?.[1];
    if (!uuid) throw new Error(`India Code item URL has no UUID: ${url}`);
    const base = `${parsedUrl.origin}/server/api/`;
    const itemResponse = await fetcher.fetch(`${base}core/items/${uuid}`);
    if (itemResponse.status !== 200) return itemResponse;

    let item: IndiaCodeItem;
    try {
      item = JSON.parse(itemResponse.body.toString('utf8')) as IndiaCodeItem;
    } catch {
      throw new Error('the India Code item endpoint did not answer with JSON');
    }
    if (!item.metadata) throw new Error('the India Code item endpoint returned no metadata');

    const parent = parentIdentity(item);
    const sections: IndiaCodeItem[] = [];
    const responses: FetchResult[] = [itemResponse];
    if (parent) {
      for (let page = 0; page < MAX_SECTION_PAGES; page += 1) {
        const res = await fetcher.fetch(sectionSearchUrl(base, parent, page));
        responses.push(res);
        if (res.status !== 200) return res;
        const result = rows(res.body);
        sections.push(
          ...result.items.filter(
            (section) =>
              value(section, 'dc.identifier.collection')?.toUpperCase() === 'SECTION' &&
              value(section, parent.field) === parent.id,
          ),
        );
        if (result.items.length === 0) break;
        if (result.totalPages !== null && page + 1 >= result.totalPages) break;
      }
    }

    const unique = new Map<string, IndiaCodeItem>();
    for (const section of sections) {
      const id = section.uuid ?? section.id;
      if (id) unique.set(id, section);
    }
    const ordered = [...unique.values()].sort((a, b) => sectionOrder(a) - sectionOrder(b));
    const body = Buffer.from(JSON.stringify({ sourceUrl: url, item, sections: ordered } satisfies IndiaCodeResolved), 'utf8');
    return {
      url,
      finalUrl: url,
      status: 200,
      mediaType: INDIA_CODE_MEDIA_TYPE,
      body,
      contentHash: createHash('sha256').update(body).digest('hex'),
      fromCache: responses.every((r) => r.fromCache),
      fetchedAt: itemResponse.fetchedAt,
    };
  },
};

export const __metadataValue = value;
export const __officialNumber = officialNumber;
