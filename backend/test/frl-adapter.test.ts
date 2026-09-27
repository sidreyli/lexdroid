import { describe, expect, it } from 'vitest';
import { commencement, frlAdapter, registerIdOf, textDocumentUrls } from '../src/discover/frl.js';
import type { Fetcher, FetchResult } from '../src/fetch/index.js';
import type { Portal } from '../src/profile/types.js';

const API = 'https://api.example/v1/';

function response(url: string, body: unknown): FetchResult {
  return {
    url,
    finalUrl: url,
    status: 200,
    mediaType: 'application/json',
    body: Buffer.from(JSON.stringify(body)),
    contentHash: 'fixture',
    fromCache: true,
    fetchedAt: '2026-09-19T00:00:00.000Z',
  };
}

interface TitleFixture {
  id: string;
  name: string;
  isPrincipal?: boolean;
  status?: string;
  makingDate?: string | null;
  statusHistory?: { status: string; start: string }[] | null;
}

function title(t: TitleFixture): Record<string, unknown> {
  return {
    id: t.id,
    name: t.name,
    collection: 'Act',
    status: t.status ?? 'InForce',
    isInForce: true,
    isPrincipal: t.isPrincipal ?? true,
    seriesType: 'Act',
    year: 2020,
    number: 1,
    makingDate: t.makingDate ?? null,
    statusHistory: t.statusHistory ?? null,
  };
}

function portal(): Portal {
  return {
    name: 'Federal Register of Legislation',
    url: 'https://www.legislation.gov.au',
    kind: 'legislation-database',
    authority: 'Office of Parliamentary Counsel',
    pillars: [1],
    adapter: 'frl',
    adapterConfig: {
      apiBase: API,
      collections: [{ collection: 'Act', kind: 'act', listing: 'Titles in force' }],
    },
  } as unknown as Portal;
}

function fetcherOf(rows: Record<string, unknown>[]): Fetcher {
  return {
    async fetch(url: string): Promise<FetchResult> {
      if (url.includes('$skip')) return response(url, { value: [], '@odata.count': rows.length });
      return response(url, { value: rows, '@odata.count': rows.length });
    },
  } as unknown as Fetcher;
}

async function discovered(rows: Record<string, unknown>[]) {
  return frlAdapter.discover({ portal: portal(), fetcher: fetcherOf(rows), log: () => {}, setAside: () => {} });
}

describe('the commencement date the register states', () => {
  it('is the day the status history opens InForce', () => {
    const found = commencement(
      title({
        id: 'C2004A00354',
        name: 'An Act',
        statusHistory: [{ status: 'InForce', start: '1998-07-27T00:00:00' }],
      }) as never,
    );
    expect(found?.on).toBe('1998-07-27');
    expect(found?.basis).toContain('1998-07-27');
  });

  it('is not the making date, which the register states separately and differently', () => {
    // Made 21 December 2000, in force from 22 December 1999: Parliament backdated it.
    const found = commencement(
      title({
        id: 'C2000A00156',
        name: 'Taxation Laws Amendment Act (No. 8) 2000',
        makingDate: '2000-12-21T00:00:00',
        statusHistory: [{ status: 'InForce', start: '1999-12-22T00:00:00' }],
      }) as never,
    );
    expect(found?.on).toBe('1999-12-22');
  });

  it('is the earliest in-force period when a title was repealed and revived', () => {
    const found = commencement(
      title({
        id: 'C1990A00001',
        name: 'A revived Act',
        statusHistory: [
          { status: 'InForce', start: '2015-01-01T00:00:00' },
          { status: 'Repealed', start: '2010-01-01T00:00:00' },
          { status: 'InForce', start: '1990-06-01T00:00:00' },
        ],
      }) as never,
    );
    expect(found?.on).toBe('1990-06-01');
  });

  it('is absent, rather than guessed, where the register states no history', () => {
    expect(commencement(title({ id: 'C1', name: 'An Act', statusHistory: null }) as never)).toBeNull();
    expect(commencement(title({ id: 'C2', name: 'An Act', statusHistory: [] }) as never)).toBeNull();
  });

  it('is absent where the title has never been in force', () => {
    const found = commencement(
      title({
        id: 'C3',
        name: 'A never-effective Act',
        statusHistory: [{ status: 'NeverEffective', start: '2001-01-01T00:00:00' }],
      }) as never,
    );
    expect(found).toBeNull();
  });
});

describe('what the adapter registers', () => {
  it('carries the commencement date onto the discovered instrument', async () => {
    const found = await discovered([
      title({
        id: 'C2004A00354',
        name: 'An Act',
        statusHistory: [{ status: 'InForce', start: '1998-07-27T00:00:00' }],
      }),
    ]);
    expect(found).toHaveLength(1);
    expect(found[0]?.commencedOn).toBe('1998-07-27');
    expect(found[0]?.url).toContain('C2004A00354');
  });

  it('leaves the date unset where the register does not state one', async () => {
    const found = await discovered([title({ id: 'C2004A00355', name: 'An Act' })]);
    expect(found).toHaveLength(1);
    expect(found[0]?.commencedOn ?? null).toBeNull();
  });

  it('skips an amending title, whose text is instructions rather than a requirement', async () => {
    const found = await discovered([
      title({ id: 'C1', name: 'Principal Act' }),
      title({ id: 'C2', name: 'Amendment Act', isPrincipal: false }),
    ]);
    expect(found.map((f) => f.title)).toEqual(['Principal Act']);
  });

  it('records what the register said about standing, in the register’s own word', async () => {
    const found = await discovered([title({ id: 'C1', name: 'An Act', status: 'InForce' })]);
    expect(found[0]?.status).toBe('in-force');
    expect(found[0]?.statusBasis).toContain('"InForce"');
  });
});

describe('reading a title back off its own URL', () => {
  it('finds the register id in the canonical page URL', () => {
    expect(registerIdOf('https://www.legislation.gov.au/F2025L01263/latest/text')).toBe('F2025L01263');
  });

  it('finds nothing in a URL that names no title', () => {
    expect(registerIdOf('https://www.legislation.gov.au/about')).toBeNull();
  });

  it('lists every EPUB volume in document order, so a long Act is not read as its first part', () => {
    const shell = `
      <a href="https://www.legislation.gov.au/C2004A00354/latest/epub/OEBPS/document_10.html">10</a>
      <a href="https://www.legislation.gov.au/C2004A00354/latest/epub/OEBPS/document_2.html#s5">2</a>
      <a href="https://www.legislation.gov.au/C2004A00354/latest/epub/OEBPS/document_2.html">2 again</a>`;
    expect(textDocumentUrls(shell)).toEqual([
      'https://www.legislation.gov.au/C2004A00354/latest/epub/OEBPS/document_2.html',
      'https://www.legislation.gov.au/C2004A00354/latest/epub/OEBPS/document_10.html',
    ]);
  });
});
