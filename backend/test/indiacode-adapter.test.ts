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

    const found = await indiaCodeAdapter.discover({ portal, fetcher, log: () => {}, setAside: () => {} });
    expect(found).toEqual([
      expect.objectContaining({
        title: 'The Example Act, 2023.',
        url: `${ORIGIN}/items/central-act`,
        kind: 'act',
        officialNumber: 'Act No. 22 of 2023',
      }),
    ]);
    expect(found[0]?.status).toBe('in-force');
    expect(found[0]?.statusBasis).toContain('ACT');
  });
});

/*
  Asked of the whole Central register rather than a sample, `repealed:true` matches 0 of India
  Code's 12,900 rows and `act_repealed:true` matches 0 of the 12,053 subordinate ones, while
  `repealed:false` matches 845 of 847 acts and every rule, regulation, notification and order. A
  flag that never says true separates nothing, and resting on it left every India instrument
  status-unknown -- which mattered, because 'in-force' is the only status a row may cite as a
  governing framework.

  Two signals replace it. Commencement, which only acts carry, and being listed at all: the register
  keeps itself current by dropping repealed law rather than marking it, measured by the absence of
  all seven known-repealed Central acts checked and the presence of all five successors.
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
    const found = await indiaCodeAdapter.discover({ portal, fetcher, log: () => {}, setAside: () => {} });
    return found[0];
  }

  async function statusOfRule(extra: Record<string, string>) {
    const row = item({ uuid: 'act-1', title: 'The Example Act, 2023.', collection: 'RULE', extra });
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
        collections: [{ collection: 'RULE', kind: 'rule' }],
      },
    } as unknown as Portal;
    const found = await indiaCodeAdapter.discover({ portal, fetcher, log: () => {}, setAside: () => {} });
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

  it('takes the earliest stage where commencement is recorded section by section', async () => {
    // An act whose sections began on different days is not an act of unknown standing. Refusing
    // these lost all 42 acts whose field is prose rather than a date.
    const found = await statusOfAct({
      'dc.identifier.repealed': 'false',
      'dc.date.enforcement_date':
        '22nd June, 2017 for sections 1, 2, 3 1st July, 2017 for sections 6 to 9',
    });
    expect(found?.status).toBe('in-force');
    expect(found?.statusBasis).toContain('2017-06-22');
    expect(found?.statusBasis).toContain('2 stated stages');
  });

  it('does not mistake the commencing notification for the commencement', async () => {
    // The notification is signed before it takes effect, so the earliest date in the field is the
    // wrong one. Everything after 'vide' describes the paperwork, not the law.
    const found = await statusOfAct({
      'dc.date.enforcement_date':
        '22nd January, 2018, vide notification No. S.O. 272(E), dated 17th January, 2018, ' +
        'see Gazette of India, Extraordinary, Part II, sec. 3(ii)',
    });
    expect(found?.statusBasis).toContain('2018-01-22');
    expect(found?.statusBasis).not.toContain('2018-01-17');
  });

  it('counts neither a day the calendar lacks nor a section number as a date', async () => {
    const impossible = await statusOfAct({ 'dc.date.enforcement_date': '31-02-2020' });
    expect(impossible?.statusBasis).not.toContain('2020');

    const sections = await statusOfAct({
      'dc.date.enforcement_date':
        'Ss. 4(1), 5(1) (2), 12, 13 (15-06-2005) and rest provisions on 120th day of its enactment.',
    });
    expect(sections?.status).toBe('in-force');
    expect(sections?.statusBasis).toContain('2005-06-15');
  });

  it('holds back an instrument whose stated commencement has not arrived', async () => {
    const found = await statusOfAct({ 'dc.date.enforcement_date': '01-01-2099' });
    expect(found?.status).toBeUndefined();
    expect(found?.statusBasis).toContain('has not yet arrived');
  });

  it('still lets a recorded repeal outrank a commencement date', async () => {
    const found = await statusOfAct({
      'dc.identifier.repealed': 'true',
      'dc.date.enforcement_date': '06-05-2016',
    });
    expect(found?.status).toBe('repealed');
  });

  it('rests a subordinate instrument on the register listing it, and says so', async () => {
    // dc.date.enforcement_date is absent from the schema of every RULE, REGULATION, NOTIFICATION
    // and ORDER: 0 of 3,104 rules carry it against 782 of 847 acts. Listing is all there is.
    const found = await statusOfRule({ 'dc.identifier.act_name': 'The Example Act, 2023' });
    expect(found?.status).toBe('in-force');
    expect(found?.statusBasis).toContain('RULE');
    expect(found?.statusBasis).toContain('The Example Act, 2023');
  });

  it('keeps the commencement date it read, not only the sentence about it', async () => {
    // The date is what the export's timeframe column is built from. Reading it to decide standing
    // and then discarding it left every Indian row with a blank timeframe while the register had
    // been stating the day all along.
    const found = await statusOfAct({ 'dc.date.enforcement_date': '06-05-2016' });
    expect(found?.commencedOn).toBe('2016-05-06');
  });

  it('keeps the earliest stage as the day a staged commencement began', async () => {
    const found = await statusOfAct({
      'dc.date.enforcement_date':
        '22nd June, 2017 for sections 1, 2 and 3 and 1st July, 2017 for sections 6 to 9',
    });
    expect(found?.commencedOn).toBe('2017-06-22');
  });

  it('states no date where the register stated none', async () => {
    // Standing rests on the listing there, and inventing a date to fill the column would put a
    // claim in the export that nothing in the register supports.
    const found = await statusOfAct({});
    expect(found?.status).toBe('in-force');
    expect(found?.commencedOn ?? null).toBeNull();
  });

  it('follows a repealed enabling act down to what was made under it', async () => {
    // Nothing in the register answers act_repealed=true today. It is read anyway, so that a
    // register which starts recording repeals is believed the moment it does.
    const found = await statusOfRule({ 'dc.identifier.act_repealed': 'true' });
    expect(found?.status).toBe('repealed');
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
