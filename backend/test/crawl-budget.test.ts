/**
 * A starting point does not cost the shelves that were already there.
 *
 * The page budget used to be the walk's, shared by every starting point, so a portal keeping its
 * instruments on two shelves spent the whole budget on the first and reached page one of the
 * second. Adding a starting point says the site keeps instruments somewhere else as well, which
 * is a claim about the site, so each one gets the budget to itself.
 */
import { describe, expect, it } from 'vitest';
import { crawlAdapter } from '../src/discover/crawl.js';

/**
 * A site with two paginated shelves, each longer than one budget.
 *
 * Every page of a shelf carries the whole pager, as a real one does, so no page of a shelf is
 * more than one link from its first -- what bounds this walk is the budget and not the depth
 * limit. The pager's links carry the page number and nothing else, again as a real one does, so
 * it is the shelf's own path that says they lead to law. Each page names one instrument.
 */
const PAGES = 100;
const pager = (shelf: string): string =>
  Array.from({ length: PAGES }, (_, i) => `<a href="/${shelf}?page=${i + 1}">${i + 1}</a>`).join('');

function site(asked: string[]) {
  return {
    fetch: async (url: string) => {
      asked.push(url);
      const shelf = /\/(acts|guidelines)/.exec(url)?.[1];
      const page = Number(/page=(\d+)/.exec(url)?.[1] ?? 1);
      const body = shelf
        ? `<html><body>${pager(shelf)}
             <a href="/${shelf}/doc${page}">The ${shelf} ${1900 + page} Regulations</a>
           </body></html>`
        : `<html><body><a href="/contact">Contact</a></body></html>`;
      return { mediaType: 'text/html', body: Buffer.from(body) };
    },
  };
}

async function walk(seeds: string[]) {
  const asked: string[] = [];
  const found = await crawlAdapter.discover({
    portal: {
      name: 'A regulator with two shelves',
      url: 'https://example.gov',
      kind: 'regulator' as const,
      authority: 'X',
      pillars: [1],
      adapter: 'crawl',
      adapterConfig: { seeds },
      notes: null,
    } as never,
    fetcher: site(asked) as never,
    log: () => {},
    setAside: () => {},
  });
  return { asked, found };
}

const shelfOf = (urls: string[], shelf: string): number =>
  urls.filter((u) => u.includes(`/${shelf}`)).length;

describe('the crawl page budget', () => {
  it('spends a full budget on one starting point', async () => {
    const { asked } = await walk(['/acts']);
    expect(shelfOf(asked, 'acts')).toBe(60);
  });

  it('gives the second starting point its own budget, not what the first one left over', async () => {
    const { asked, found } = await walk(['/acts', '/guidelines']);
    expect(shelfOf(asked, 'acts')).toBe(60);
    expect(shelfOf(asked, 'guidelines')).toBe(60);
    // Both shelves are read as deep as each other, which is the point: the second is not
    // whatever the first left behind.
    expect(found.filter((f) => f.url.includes('/acts/')).length).toBe(
      found.filter((f) => f.url.includes('/guidelines/')).length,
    );
  });

  it('charges a page two starting points both reach to whichever reached it first', async () => {
    const { asked } = await walk(['/acts', '/acts?page=1']);
    expect(new Set(asked).size).toBe(asked.length);
  });
});
