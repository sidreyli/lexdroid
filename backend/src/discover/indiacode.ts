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
import { cacheComposed } from '../fetch/index.js';
import type { Fetcher, FetchResult } from '../fetch/index.js';
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

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

/** A day the calendar actually has. Date would roll 31-02 forward to 3 March rather than refuse it. */
function calendarDay(y: string, m: string, d: string): string | null {
  const day = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const when = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(when.getTime()) || when.toISOString().slice(0, 10) !== day) return null;
  return day;
}

/**
 * Every commencement date the field states, earliest first.
 *
 * The field is free text and holds three shapes at once: 105 Central acts write 1885-10-01, 635
 * write 06-05-2016, and the rest write prose. Day-first is measured, not assumed -- across those
 * acts the first component reaches 31 and passes 12 on 330 of them, while the second never passes
 * 12 -- so the two numeric shapes are told apart by which component is the four-digit year.
 *
 * Reading every date rather than one is what lets the prose be read at all. An act commenced in
 * stages states each stage: "22nd June, 2017 for sections 1, 2 ... 1st July, 2017 for sections 6 to
 * 9". Demanding a single date refused all 42 such acts, which reversed the question -- an act whose
 * sections commenced on different days is not an act of unknown standing, it is an act that plainly
 * began, and the earliest stage is the day it began.
 */
function commencementDates(raw: string): string[] {
  // 'vide' introduces the notification that effected commencement, and that notification carries
  // its own, earlier date: "22nd January, 2018, vide notification ... dated 17th January, 2018".
  // Reading past it would record the day the paperwork was signed as the day the law began.
  const text = raw.split(/\bvide\b/i)[0]!;
  const days = new Set<string>();
  for (const m of text.matchAll(/(?<!\d)(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) {
    const day = calendarDay(m[1]!, m[2]!, m[3]!);
    if (day) days.add(day);
  }
  for (const m of text.matchAll(/(?<![\d-])(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?!\d)/g)) {
    const day = calendarDay(m[3]!, m[2]!, m[1]!);
    if (day) days.add(day);
  }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+),?\s+(\d{4})(?!\d)/g)) {
    const month = MONTHS[m[2]!.toLowerCase()];
    const day = month ? calendarDay(m[3]!, month, m[1]!) : null;
    if (day) days.add(day);
  }
  return [...days].sort();
}

/**
 * What India Code can support about an instrument's standing, and on what evidence.
 *
 * Neither repeal flag is usable. Asked of the whole Central register rather than a sample,
 * `repealed:true` and `act_repealed:true` each match 0 of 12,900 rows, while `repealed:false`
 * matches 845 of 847 acts and every rule, regulation, notification and order. A flag that never
 * says true separates nothing, and resting on it left all 12,900 instruments status-unknown.
 *
 * The register keeps itself current by removing repealed law, not by marking it. That is measured:
 * of seven Central acts known to be repealed -- the Indian Penal Code, the Code of Criminal
 * Procedure, the Indian Evidence Act, Companies 1956, MRTP, Sick Industrial Companies and Urban
 * Land Ceiling -- none is in the collection, while all five successors checked are. The two
 * apparent hits are the Repeal Acts themselves, which remain in force. So being listed is the
 * signal, and it is the same reading already made of Malaysia's Laws of Malaysia catalogue.
 *
 * Commencement, where the register states it, is the stronger evidence and is preferred, because it
 * is a fact about the instrument rather than about the collection holding it. Only acts carry it:
 * `enforcement_date` is present on 782 of 847 acts and absent from the schema of every subordinate
 * collection. Either way the basis names what the claim rests on, so a reviewer can weigh it.
 */
function statusOf(
  item: IndiaCodeItem,
  readOn: string,
): Pick<DiscoveredInstrument, 'status' | 'statusBasis' | 'commencedOn' | 'madeUnder'> {
  const collection = value(item, 'dc.identifier.collection')?.toUpperCase() ?? 'CENTRAL';
  const parent = value(item, 'dc.identifier.act_name');

  // Kept although nothing matches it today: the flags are the register's own, and a register that
  // starts recording repeals should be believed the moment it does.
  const repealed = value(item, 'dc.identifier.repealed')?.toLowerCase() === 'true';
  const parentRepealed = value(item, 'dc.identifier.act_repealed')?.toLowerCase() === 'true';
  if (repealed || parentRepealed) {
    return {
      ...(parent ? { madeUnder: parent } : {}),
      status: 'repealed',
      statusBasis: repealed
        ? `India Code records repealed=true for this item (API read on ${readOn})`
        : `India Code records the enabling act${parent ? `, ${parent},` : ''} as repealed, ` +
          `and subordinate legislation falls with it (API read on ${readOn})`,
    };
  }

  const stated = value(item, 'dc.date.enforcement_date')?.trim();
  if (stated) {
    const dates = commencementDates(stated);
    const begun = dates.filter((d) => d <= readOn);
    if (begun.length > 0) {
      const staged = dates.length > 1
        ? `, the earliest of ${dates.length} stated stages of commencement,`
        : '';
      return {
        ...(parent ? { madeUnder: parent } : {}),
        status: 'in-force',
        commencedOn: begun[0]!,
        statusBasis:
          `India Code records commencement on ${begun[0]}${staged} and records no repeal ` +
          `(API read on ${readOn})`,
      };
    }
    if (dates.length > 0) {
      return {
        ...(parent ? { madeUnder: parent } : {}),
        commencedOn: dates[0]!,
        statusBasis:
          `India Code records commencement on ${dates[0]}, a day that has not yet arrived, ` +
          `so the instrument is not yet in force (API read on ${readOn})`,
      };
    }
    // Text stating no date at all still describes an instrument the register lists, so fall through.
  }

  return {
    ...(parent ? { madeUnder: parent } : {}),
    status: 'in-force',
    statusBasis:
      `India Code lists this among the ${collection} it holds as current law` +
      `${parent ? `, made under ${parent}, which it records as unrepealed` : ''}; ` +
      `the register drops repealed instruments rather than flagging them (API read on ${readOn})`,
  };
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

interface Bundle {
  uuid?: string;
  name?: string;
}

interface Bitstream {
  uuid?: string;
  name?: string;
  sizeBytes?: number;
}

/**
 * The official PDF an item publishes, or null where it publishes none.
 *
 * DSpace keeps an item's files in named bundles. ORIGINAL holds what the publisher uploaded; TEXT
 * holds DSpace's own full-text extraction of it and THUMBNAIL a preview, so neither is the
 * instrument and neither is read. Where ORIGINAL holds more than one PDF the first is taken, in the
 * order the repository lists them. Links are built on the item's own API base rather than followed
 * from the payload, so an answer cannot send the fetcher to another host.
 */
async function originalPdf(
  base: string,
  uuid: string,
  fetcher: Fetcher,
  responses: FetchResult[],
): Promise<FetchResult | null> {
  const listed = await fetcher.fetch(`${base}core/items/${uuid}/bundles`);
  responses.push(listed);
  if (listed.status !== 200) return null;
  const bundles = embedded<Bundle>(listed.body, 'bundles');
  const original = bundles.find((b) => b.name?.toUpperCase() === 'ORIGINAL' && b.uuid);
  if (!original) return null;

  const files = await fetcher.fetch(`${base}core/bundles/${original.uuid}/bitstreams`);
  responses.push(files);
  if (files.status !== 200) return null;
  const pdf = embedded<Bitstream>(files.body, 'bitstreams').find((b) => b.uuid && (b.name ?? '').toLowerCase().endsWith('.pdf'));
  if (!pdf) return null;

  const content = await fetcher.fetch(`${base}core/bitstreams/${pdf.uuid}/content`);
  responses.push(content);
  if (content.status !== 200) return null;
  // A file named .pdf that is not one -- an error page served 200 -- is not the instrument either.
  if (!content.body.subarray(0, 1024).includes('%PDF-')) return null;
  return content;
}

function embedded<T>(body: Buffer, key: string): T[] {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as { _embedded?: Record<string, T[]> };
    const list = parsed._embedded?.[key];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
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

    // Rules, regulations, notifications and orders mostly have no section records at all: India Code
    // publishes them as the official PDF and nothing else. Measured on the first 109 instruments a
    // twelve-pillar shortlist fetched, 64 were like that, and every one of a dozen sampled carried
    // exactly one PDF in its ORIGINAL bundle. The PDF is the instrument, so it is what gets read --
    // through the same parser, OCR included, that reads a scanned Gazette -- while the citation stays
    // on the item page a reader can open.
    if (sections.length === 0) {
      const pdf = await originalPdf(base, uuid, fetcher, responses);
      if (pdf) {
        return {
          url,
          finalUrl: pdf.finalUrl,
          status: 200,
          mediaType: 'application/pdf',
          body: pdf.body,
          contentHash: pdf.contentHash,
          fromCache: responses.every((r) => r.fromCache),
          fetchedAt: pdf.fetchedAt,
        };
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
      contentHash: cacheComposed(body),
      fromCache: responses.every((r) => r.fromCache),
      fetchedAt: itemResponse.fetchedAt,
    };
  },
};

export const __metadataValue = value;
export const __officialNumber = officialNumber;
