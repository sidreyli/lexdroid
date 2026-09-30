/**
 * A listing page the system failed to build is not the end of the list.
 *
 * The walk of every federal law stopped at 1,320 of 12,155 rows: page 67 came back a 502, the
 * fetcher kept it, and the walk read a page without rows as the last one -- then read the same 502
 * back from the cache on every later walk.
 */
import { describe, expect, it } from 'vitest';
import { ipsAdapter } from '../src/discover/ips.js';

function page(from: number, count: number): string {
  const rows = Array.from({ length: count }, (_, i) => {
    const nd = from + i;
    return `<table class="list_elem"><tr><td>
      <a href="?docbody=&nd=${nd}">Федеральный закон от 01.02.2020 № ${nd}-ФЗ</a>
      <div><span class="l_link"></span><span class="bold">О предмете ${nd}</span></div>
      <span class="tiny_italic_bold">Действует без изменений</span></td></tr></table>`;
  });
  return `<html><body>${rows.join('')}</body></html>`;
}

async function walk(answers: (start: number, refresh: boolean) => { status: number; html: string }) {
  const asked: string[] = [];
  const setAside: unknown[] = [];
  const found = await ipsAdapter.discover({
    portal: {
      name: 'IPS',
      url: 'http://pravo.gov.ru',
      kind: 'gazette',
      authority: 'Government',
      pillars: [1],
      adapter: 'ips',
      adapterConfig: { queries: [{ type: '102000505', kind: 'act', maxPages: 10 }] },
      notes: null,
    } as never,
    fetcher: {
      fetch: async (url: string, opts: { refresh?: boolean } = {}) => {
        const start = Number(/start=(\d+)/.exec(url)?.[1] ?? 0);
        asked.push(`${start}${opts.refresh ? ' refresh' : ''}`);
        const a = answers(start, opts.refresh === true);
        return { status: a.status, mediaType: 'text/html', charset: 'utf-8', body: Buffer.from(a.html) };
      },
    } as never,
    log: () => {},
    setAside: (d: unknown) => setAside.push(d),
    vocabulary: [],
  });
  return { found, asked, setAside };
}

describe('a listing page the system answers with an error', () => {
  it('is asked for again past the cache, and the walk goes on', async () => {
    const { found, asked, setAside } = await walk((start, refresh) => {
      if (start === 20 && !refresh) return { status: 502, html: '<html>Bad Gateway</html>' };
      return { status: 200, html: page(start + 1, start === 40 ? 5 : 20) };
    });
    expect(asked).toEqual(['0', '20', '20 refresh', '40']);
    expect(found).toHaveLength(45);
    expect(setAside).toEqual([]);
  });

  it('is set aside when it fails again, and the pages after it are still walked', async () => {
    const { found, asked, setAside } = await walk((start) =>
      start === 20 ? { status: 502, html: '<html>Bad Gateway</html>' } : { status: 200, html: page(start + 1, start === 40 ? 5 : 20) },
    );
    expect(asked).toEqual(['0', '20', '20 refresh', '40']);
    expect(found).toHaveLength(25);
    expect(setAside).toHaveLength(1);
  });

  it('asks the system for one issuer where the query names its code', async () => {
    const urls: string[] = [];
    await ipsAdapter.discover({
      portal: {
        name: 'IPS',
        url: 'http://pravo.gov.ru',
        adapter: 'ips',
        adapterConfig: { queries: [{ type: '102000497', kind: 'order', issuedBy: '102000266' }] },
      } as never,
      fetcher: {
        fetch: async (url: string) => {
          urls.push(url);
          return { status: 200, mediaType: 'text/html', charset: 'utf-8', body: Buffer.from(page(1, 3)) };
        },
      } as never,
      log: () => {},
      setAside: () => {},
      vocabulary: [],
    });
    expect(urls).toEqual(['http://pravo.gov.ru/proxy/ips/?list_itself=&bpas=cd00000&a3=102000497&a3type=1&a6=102000266&a6type=1&sort=7&page=first']);
  });

  it('gives the query up after three failed pages in a row', async () => {
    const { asked } = await walk((start) =>
      start === 0 ? { status: 200, html: page(1, 20) } : { status: 502, html: '<html>Bad Gateway</html>' },
    );
    expect(asked).toEqual(['0', '20', '20 refresh', '40', '40 refresh', '60', '60 refresh']);
  });
});
