/**
 * Discovery on a portal that runs Drupal and leaves its JSON:API open.
 *
 * Five of the declared Australian regulators run Drupal 10 or 11. Drupal ships a read-only
 * JSON:API that lists every published node with its title, and where a site leaves it on -- the
 * ACCC does -- that is a complete index of what the regulator publishes, served as data.
 *
 * Written to the shape rather than to the site: any portal advertising the same API root answers
 * the same way, and a site that has switched it off simply yields nothing.
 */
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';
import { instrumentTitle } from './titles.js';

const PAGE_SIZE = 50;
const MAX_PAGES = 20;
/** Enough content types for a regulator; a site with more is walked by the crawl adapter. */
const MAX_TYPES = 12;

/** The node types this site actually defines. The API root lists them, so none are guessed. */
async function nodeTypes(ctx: DiscoverContext): Promise<string[]> {
  const root = `${ctx.portal.url.replace(/\/+$/, '')}/jsonapi`;
  try {
    const res = await ctx.fetcher.fetch(root);
    const body = JSON.parse(res.body.toString('utf8')) as { links?: Record<string, unknown> };
    return Object.keys(body.links ?? {})
      .filter((k) => k.startsWith('node--'))
      .map((k) => k.replace('node--', 'node/'))
      .slice(0, MAX_TYPES);
  } catch {
    return [];
  }
}

interface Node {
  attributes?: { title?: string; path?: { alias?: string }; changed?: string };
}

export const drupalAdapter: Adapter = {
  name: 'drupal',
  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log } = ctx;
    const found = new Map<string, DiscoveredInstrument>();
    const types = await nodeTypes(ctx);
    if (!types.length) {
      log('  no JSON:API, or it lists no content types');
      return [];
    }

    for (const type of types) {
      let next: string | null =
        `${portal.url.replace(/\/+$/, '')}/jsonapi/${type}?page[limit]=${PAGE_SIZE}`;
      for (let page = 0; next && page < MAX_PAGES; page += 1) {
        let body: { data?: Node[]; links?: { next?: { href?: string } } };
        try {
          const res = await fetcher.fetch(next);
          body = JSON.parse(res.body.toString('utf8'));
        } catch {
          // A type this site does not define answers 404, which is not an error worth stopping on.
          break;
        }
        for (const node of body.data ?? []) {
          const title = node.attributes?.title;
          const alias = node.attributes?.path?.alias;
          if (!title || !alias) continue;
          const named = instrumentTitle(title, ctx.vocabulary);
          if (!named) continue;
          const url = new URL(alias, portal.url).toString();
          if (!found.has(url)) found.set(url, { title: named.title, url, kind: named.kind });
        }
        next = body.links?.next?.href ?? null;
      }
    }
    log(`  ${found.size} instrument(s) named`);
    return [...found.values()];
  },
};
