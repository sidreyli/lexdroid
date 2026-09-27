/**
 * A portal whose front page is not a way in.
 *
 * The crawl starts at the portal's URL, which assumes the front page carries the navigation.
 * Royal Malaysian Customs redirects its root to a Malay shell whose only on-host links are the
 * two language switchers: the walk ended after one page, the department registered nothing, and
 * a cell reads nothing as "no requirement". Its index is one level down, at /en/home.
 */
import { describe, expect, it } from 'vitest';
import { crawlAdapter } from '../src/discover/crawl.js';

const SHELL = `<html><body><a href="/ms/">MS</a><a href="/en/">EN</a></body></html>`;
const INDEX = `
  <html><body><h2>Current Orders</h2>
    <a href="/en/customs-duties-order-2017">Customs Duties Order 2017</a>
    <a href="/en/prohibition-of-imports-order-2023">Customs (Prohibition of Imports) Order 2023</a>
  </body></html>`;

/** Serves the shell at the root and the index at the seed, and nothing anywhere else. */
function site(asked: string[]) {
  return {
    fetch: async (url: string) => {
      asked.push(url);
      const body = url.endsWith('/en/home') ? INDEX : SHELL;
      return { mediaType: 'text/html', body: Buffer.from(body) };
    },
  };
}

function portal(adapterConfig: Record<string, unknown>) {
  return {
    name: 'Royal Malaysian Customs Department',
    url: 'https://www.customs.gov.my',
    kind: 'regulator' as const,
    authority: 'JKDM',
    pillars: [1, 2, 12],
    adapter: 'crawl',
    adapterConfig,
    notes: null,
  };
}

async function walk(adapterConfig: Record<string, unknown>) {
  const asked: string[] = [];
  const found = await crawlAdapter.discover({
    portal: portal(adapterConfig) as never,
    fetcher: site(asked) as never,
    log: () => {},
    setAside: () => {},
  });
  return { asked, found };
}

describe('a crawl seeded past the front page', () => {
  it('finds nothing when only the root is walked', async () => {
    const { found } = await walk({});
    expect(found).toHaveLength(0);
  });

  it('reaches the index the seed names', async () => {
    const { asked, found } = await walk({ seeds: ['https://www.customs.gov.my/en/home'] });
    expect(asked[0]).toBe('https://www.customs.gov.my/en/home');
    expect(found.map((f) => f.title)).toEqual([
      'Customs Duties Order 2017',
      'Customs (Prohibition of Imports) Order 2023',
    ]);
    // The portal's own root is still walked, so a seed adds a way in and closes none.
    expect(asked).toContain('https://www.customs.gov.my');
  });

  it('reads the standing from the heading the seed page put the links under', async () => {
    const { found } = await walk({ seeds: ['/en/home'] });
    expect(found[0]?.status).toBe('in-force');
    expect(found[0]?.statusBasis).toBe('Current Orders');
  });

  it('drops a seed pointing at another host, because the crawl stays on one', async () => {
    const { asked } = await walk({ seeds: ['https://example.org/en/home', '/en/home'] });
    expect(asked.some((u) => u.includes('example.org'))).toBe(false);
    expect(asked).toContain('https://www.customs.gov.my/en/home');
  });

  it('ignores a malformed seed rather than failing the walk', async () => {
    const { found } = await walk({ seeds: [42, 'ht tp://nonsense', '/en/home'] });
    expect(found.length).toBe(2);
  });
});
