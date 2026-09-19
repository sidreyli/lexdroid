import { describe, expect, it } from 'vitest';
import { wpAdapter } from '../src/discover/wp.js';
import type { Fetcher, FetchResult } from '../src/fetch/index.js';
import type { Portal } from '../src/profile/types.js';

const BASE = 'https://regulator.example.gov';
const API = `${BASE}/wp-json/`;

interface Upload {
  file: string;
  page: string | null;
  title?: string;
}

function media(uploads: Upload[]): Record<string, unknown>[] {
  return uploads.map((u, n) => ({
    id: n + 1,
    mime_type: 'application/pdf',
    source_url: `${BASE}/uploads/${u.file}`,
    title: { rendered: u.title ?? u.file.replace(/\.pdf$/, '') },
    post: u.page ? 100 + n : null,
    link: u.page ? `${BASE}${u.page}${u.file.replace(/\.pdf$/, '')}/` : `${BASE}/${u.file.replace(/\.pdf$/, '')}/`,
  }));
}

/** Answers the head with an API link, one page of media, then the 400 that ends the library. */
function fetcherFor(uploads: Upload[]): Fetcher {
  const reply = (url: string, status: number, body: string): FetchResult => ({
    url, finalUrl: url, status, mediaType: 'text/html', body: Buffer.from(body),
    contentHash: 'x', fromCache: false, fetchedAt: '2026-09-08T00:00:00.000Z',
  });
  return {
    async fetch(url: string): Promise<FetchResult> {
      if (url === BASE) {
        return reply(url, 200, `<html><head><link rel="https://api.w.org/" href="${API}"></head></html>`);
      }
      if (url.includes('page=1')) return reply(url, 200, JSON.stringify(media(uploads)));
      return reply(url, 400, '[]');
    },
  } as unknown as Fetcher;
}

const portal = { name: 'Regulator', url: BASE, adapterConfig: {} } as unknown as Portal;

async function discover(uploads: Upload[]) {
  return wpAdapter.discover({ portal, fetcher: fetcherFor(uploads), log: () => {}, setAside: () => {} });
}

describe('a media library walked as a register', () => {
  it('files a code published in two languages as one instrument with two documents', async () => {
    const found = await discover([
      { file: 'COP-banking-BM.pdf', page: '/akta/code-of-practice-for-the-banking-sector/' },
      { file: 'COP-banking-BI.pdf', page: '/akta/code-of-practice-for-the-banking-sector/' },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe('Code Of Practice For The Banking Sector');
    expect(found[0]?.kind).toBe('rule');
    expect(found[0]?.alsoAt).toEqual([`${BASE}/uploads/COP-banking-BI.pdf`]);
  });

  it('leaves out an upload no page publishes, which is a file the library happens to hold', async () => {
    // The shape that registered 180 instruments for one ministry: every PDF in the library,
    // tender notices and job application forms included.
    const found = await discover([
      { file: 'a9.pdf', page: null },
      { file: 'tender-notice.pdf', page: null },
      { file: 'regulations-2013.pdf', page: '/akta/personal-data-protection-regulations-2013/' },
    ]);

    expect(found.map((f) => f.title)).toEqual(['Personal Data Protection Regulations 2013']);
  });

  it('names an instrument by its page, not by the upload slug a citation never uses', async () => {
    const found = await discover([
      { file: 'BUKU-TATAAMALAN-BI-FINAL-1.pdf', page: '/akta/tataamalan-umum-perlindungan-data-peribadi/' },
    ]);

    expect(found[0]?.title).toBe('Tataamalan Umum Perlindungan Data Peribadi');
    expect(found[0]?.titleProvisional).toBeFalsy();
  });

  it('keeps an upload no page publishes when its own title names an instrument', async () => {
    // The Bureau of Indian Standards publishes its Quality Control Orders straight into the
    // library: 1,844 files, one of them linked from a page. The orphan rule dropped 1,843.
    const found = await discover([
      { file: 'Domestic-Pressure-Cooker-QCO-2020-1.pdf', page: null, title: 'Domestic Pressure Cooker (Quality Control) Order, 2020' },
      { file: 'tender-notice.pdf', page: null, title: 'Tender Notice for housekeeping services' },
      { file: 'vacancy.pdf', page: null, title: 'Vacancy announcement' },
    ]);

    expect(found.map((f) => f.title)).toEqual(['Domestic Pressure Cooker (Quality Control) Order, 2020']);
    expect(found[0]?.kind).toBe('order');
  });

  it('does not register an upload twice when a page publishes it as well', async () => {
    const found = await discover([
      { file: 'regulations-2013.pdf', page: '/akta/personal-data-protection-regulations-2013/', title: 'Personal Data Protection Regulations 2013' },
    ]);

    expect(found).toHaveLength(1);
  });

  it('keeps pages apart that publish different instruments', async () => {
    const found = await discover([
      { file: 'one.pdf', page: '/akta/standard-perlindungan-data-peribadi-2015/' },
      { file: 'two.pdf', page: '/akta/peraturan-pengkompaunan-kesalahan/' },
    ]);

    expect(found).toHaveLength(2);
    expect(found.every((f) => !f.alsoAt)).toBe(true);
  });
});
