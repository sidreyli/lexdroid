import { describe, expect, it } from 'vitest';
import {
  INDIA_CODE_MEDIA_TYPE,
  indiaCodeAdapter,
  indiaCodeSearchUrl,
  type IndiaCodeItem,
} from '../src/discover/indiacode.js';
import type { Fetcher, FetchResult } from '../src/fetch/index.js';
import { parseDocument } from '../src/parse/index.js';
import type { Portal } from '../src/profile/types.js';

const ORIGIN = 'https://indiacode.example';
const API = `${ORIGIN}/server/api/`;

function response(url: string, body: unknown, mediaType = 'application/hal+json'): FetchResult {
  const bytes = Buffer.from(JSON.stringify(body));
  return {
    url,
    finalUrl: url,
    status: 200,
    mediaType,
    body: bytes,
    contentHash: 'fixture',
    fromCache: true,
    fetchedAt: '2026-09-12T00:00:00.000Z',
  };
}

function item(args: {
  uuid: string;
  title: string;
  collection: string;
  state?: string;
  extra?: Record<string, string>;
}): IndiaCodeItem {
  const metadata: NonNullable<IndiaCodeItem['metadata']> = {
    'dc.title': [{ value: args.title }],
    'dc.identifier.collection': [{ value: args.collection }],
    'dc.identifier.state_name': [{ value: args.state ?? 'CENTRAL' }],
  };
  for (const [key, value] of Object.entries(args.extra ?? {})) metadata[key] = [{ value }];
  return { id: args.uuid, uuid: args.uuid, name: args.title, metadata, type: 'item' };
}

function search(items: IndiaCodeItem[], totalPages = 1): unknown {
  return {
    _embedded: {
      searchResult: {
        _embedded: { objects: items.map((indexableObject) => ({ _embedded: { indexableObject } })) },
        page: { number: 0, size: 100, totalPages, totalElements: items.length },
      },
    },
  };
}

describe('the India Code register', () => {
  it('asks the API for one instrument category in the Central jurisdiction', () => {
    const url = new URL(indiaCodeSearchUrl(API, 'ACT', 'CENTRAL', 2, 100));
    expect(url.pathname).toBe('/server/api/discover/search/objects');
    expect(url.searchParams.get('query')).toBe('dc.identifier.state_name:CENTRAL');
    expect(url.searchParams.get('f.identifier_collection')).toBe('ACT,equals');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('size')).toBe('100');
  });

  it('checks the category and jurisdiction again before registering a row', async () => {
    const central = item({
      uuid: 'central-act',
      title: 'The Example Act, 2023.',
      collection: 'ACT',
      extra: {
        'dc.identifier.act_number': '22',
        'dc.date.act_year': '2023',
        'dc.identifier.repealed': 'false',
      },
    });
    const state = item({ uuid: 'state-act', title: 'A Delhi Act', collection: 'ACT', state: 'Delhi' });
    const fetcher = {
      async fetch(url: string) {
        return response(url, search([central, state]));
      },
    } as unknown as Fetcher;
    const portal = {
      name: 'India Code',
      url: ORIGIN,
      adapterConfig: {
        apiBase: API,
        jurisdiction: 'CENTRAL',
        pageSize: 100,
        collections: [{ collection: 'ACT', kind: 'act' }],
      },
    } as unknown as Portal;

    const found = await indiaCodeAdapter.discover({ portal, fetcher, log: () => {} });
    expect(found).toEqual([
      expect.objectContaining({
        title: 'The Example Act, 2023.',
        url: `${ORIGIN}/items/central-act`,
        kind: 'act',
        officialNumber: 'Act No. 22 of 2023',
      }),
    ]);
    expect(found[0]?.status).toBeUndefined();
    expect(found[0]?.statusBasis).toContain('repealed=false');
  });
});

/*
  India Code answers repealed=false on 845 of the 847 Central acts and on every rule, regulation,
  notification and order sampled, and true on none of them. Trusting that flag alone registered all
  12,900 India instruments as status-unknown, so nothing downstream could tell live law from dead.
  The commencement date is the signal the register does carry, and these fix how it is read.
*/
describe('the status India Code can actually support', () => {
  async function statusOfAct(extra: Record<string, string>) {
    const row = item({ uuid: 'act-1', title: 'The Example Act, 2023.', collection: 'ACT', extra });
    const fetcher = {
      async fetch(url: string) {
        return response(url, search([row]));
      },
    } as unknown as Fetcher;
    const portal = {
      name: 'India Code',
      url: ORIGIN,
      adapterConfig: {
        apiBase: API,
        jurisdiction: 'CENTRAL',
        pageSize: 100,
        collections: [{ collection: 'ACT', kind: 'act' }],
      },
    } as unknown as Portal;
    const found = await indiaCodeAdapter.discover({ portal, fetcher, log: () => {} });
    return found[0];
  }

  it('reads a stated commencement as in force, in either format the register uses', async () => {
    const dayFirst = await statusOfAct({
      'dc.identifier.repealed': 'false',
      'dc.date.enforcement_date': '06-05-2016',
    });
    expect(dayFirst?.status).toBe('in-force');
    expect(dayFirst?.statusBasis).toContain('2016-05-06');

    const isoFirst = await statusOfAct({
      'dc.identifier.repealed': 'false',
      'dc.date.enforcement_date': '1885-10-01',
    });
    expect(isoFirst?.status).toBe('in-force');
    expect(isoFirst?.statusBasis).toContain('1885-10-01');
  });

  it('reads 06-05-2016 as 6 May, because the register writes the day first', async () => {
    // Not a convention taken on trust: the first component reaches 31 across the Central acts and
    // passes 12 on 330 of them, while the second never passes 12.
    const found = await statusOfAct({ 'dc.date.enforcement_date': '31-01-2020' });
    expect(found?.status).toBe('in-force');
    expect(found?.statusBasis).toContain('2020-01-31');
  });

  it('leaves status unknown where commencement is recorded section by section', async () => {
    // The instrument commenced in parts on different days, so it has no one date to record.
    const found = await statusOfAct({
      'dc.identifier.repealed': 'false',
      'dc.date.enforcement_date':
        '19th April, 2021- Sections 2, sub-sections (1), (2) and (4) of section 3, 4 to 14',
    });
    expect(found?.status).toBeUndefined();
    expect(found?.statusBasis).toContain('repealed=false');
  });

  it('leaves status unknown for a date the calendar does not have, or one not yet reached', async () => {
    const impossible = await statusOfAct({ 'dc.date.enforcement_date': '31-02-2020' });
    expect(impossible?.status).toBeUndefined();

    const future = await statusOfAct({ 'dc.date.enforcement_date': '01-01-2099' });
    expect(future?.status).toBeUndefined();

    const twoDates = await statusOfAct({ 'dc.date.enforcement_date': '08-05-1952, 15-02-1962' });
    expect(twoDates?.status).toBeUndefined();
  });

  it('still lets a recorded repeal outrank a commencement date', async () => {
    const found = await statusOfAct({
      'dc.identifier.repealed': 'true',
      'dc.date.enforcement_date': '06-05-2016',
    });
    expect(found?.status).toBe('repealed');
  });

  it('leaves the subordinate instruments unknown, because they carry no commencement at all', async () => {
    // Measured: dc.date.enforcement_date is absent from the schema of every RULE, REGULATION,
    // NOTIFICATION and ORDER sampled. 12,053 of India's 12,900 instruments have no signal here.
    const found = await statusOfAct({ 'dc.identifier.repealed': 'false' });
    expect(found?.status).toBeUndefined();
  });
});

describe('structured India Code provisions', () => {
  it('resolves an Act through its section records and preserves their language and order', async () => {
    const act = item({
      uuid: 'act-1',
      title: 'The Example Act, 2023.',
      collection: 'ACT',
      extra: {
        'dc.identifier.act_id': 'AC_CEN_EXAMPLE',
        'dc.identifier.act_number': '22',
        'dc.date.act_year': '2023',
        'dc.identifier.ministry_name': 'Ministry of Examples',
      },
    });
    const second = item({
      uuid: 'section-2',
      title: 'Application.',
      collection: 'SECTION',
      extra: {
        'dc.identifier.section_number': '2',
        'dc.identifier.act_id': 'AC_CEN_EXAMPLE',
        'dc.identifier.order_number': '2',
        'dc.identifier.page_number': '4',
        'dc.identifier.section_page_note': '<span>This Act applies throughout India.</span><br/>It binds every example.',
      },
    });
    const first = item({
      uuid: 'section-1',
      title: 'संक्षिप्त नाम।',
      collection: 'SECTION',
      extra: {
        'dc.identifier.section_number': '1',
        'dc.identifier.act_id': 'AC_CEN_EXAMPLE',
        'dc.identifier.order_number': '1',
        'dc.identifier.page_number': '3',
        'dc.identifier.section_page_note_regional': '<span>इस अधिनियम का संक्षिप्त नाम उदाहरण अधिनियम है।</span>',
      },
    });

    const fetcher = {
      async fetch(url: string) {
        if (url === `${API}core/items/act-1`) return response(url, act);
        expect(new URL(url).searchParams.get('query')).toBe('dc.identifier.act_id:AC_CEN_EXAMPLE');
        return response(url, search([second, first]));
      },
    } as unknown as Fetcher;

    const resolved = await indiaCodeAdapter.resolveDocument!(`${ORIGIN}/items/act-1`, fetcher);
    expect(resolved.mediaType).toBe(INDIA_CODE_MEDIA_TYPE);
    const parsed = await parseDocument(resolved);

    expect(parsed.unread).toBeNull();
    expect(parsed.title).toBe('The Example Act, 2023.');
    expect(parsed.meta['officialNumber']).toBe('Act No. 22 of 2023');
    expect(parsed.meta['ministry']).toBe('Ministry of Examples');
    expect(parsed.sections.map((section) => section.label)).toEqual(['1', '2']);
    expect(parsed.sections.map((section) => section.language)).toEqual(['hi', 'en']);
    expect(parsed.sections.map((section) => section.page)).toEqual([3, 4]);
    for (const section of parsed.sections) {
      expect(parsed.text.slice(section.charStart, section.charEnd)).toBe(section.text);
    }
  });
});
