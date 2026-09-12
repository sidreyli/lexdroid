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
