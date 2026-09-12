/**
 * Discovery on a portal that publishes neither a sitemap nor an API.
 *
 * Six of the declared sources are like this -- the ACMA, the Border Force, auDA, the MCMC, MyIPO
 * and MYNIC. They publish instruments and index them only for a reader, so the index has to be
 * walked. That is more requests than a sitemap and the budget below is what keeps it polite:
 * a fixed number of pages, one host, and only pages that look like they lead to legislation.
 *
 * The link's own text is the evidence, not the URL. A site that files a code of practice under an
 * opaque path still writes its name in the anchor, and the anchor is what a citation matches.
 */
import * as cheerio from 'cheerio';
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';
import { instrumentTitle } from './titles.js';

/** The budget. A regulator's legislation section is tens of pages, not thousands. */
const MAX_PAGES = 60;
const MAX_DEPTH = 3;

/** A link worth following: the section of the site where a regulator keeps its law. */
const LEADS_TO_LAW =
  /\b(legislation|regulat|licen[cs]|code[s]? of practice|guideline|standard|act|rule|order|determination|direction|policy|compliance|enforcement)\b/i;
/** And the parts of a site that never do, however many links they carry. */
const LEADS_AWAY =
  /\b(news|media|press|event|career|vacanc|contact|about-us|search|login|subscribe|rss|calendar|gallery|video|podcast)\b/i;

export const crawlAdapter: Adapter = {
  name: 'crawl',
  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log } = ctx;
    const root = new URL(portal.url);
    const seen = new Set<string>();
    const found = new Map<string, DiscoveredInstrument>();
    let queue: { url: string; depth: number }[] = [{ url: portal.url, depth: 0 }];

    while (queue.length && seen.size < MAX_PAGES) {
      const { url, depth } = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);

      let html: string;
      try {
        const res = await fetcher.fetch(url);
        if (!/html/i.test(res.mediaType)) continue;
        html = res.body.toString('utf8');
      } catch {
        continue;
      }

      const $ = cheerio.load(html);
      const next: { url: string; depth: number }[] = [];
      $('a[href]').each((_, el) => {
        const href = $(el).attr('href');
        // An icon font puts its ligature name in the link's text: "south_east About the Privacy
        // Act". It is markup, not part of the name, and it is always a lowercase_underscore word.
        const text = $(el)
          .text()
          .replace(/\s+/g, ' ')
          .replace(/^(?:[a-z]+_[a-z_]+\s+)+/, '')
          .trim();
        if (!href) return;
        let target: URL;
        try {
          target = new URL(href, url);
        } catch {
          return;
        }
        if (target.host !== root.host) return;
        target.hash = '';
        const at = target.toString();

        const named = instrumentTitle(text);
        if (named && !found.has(at)) {
          found.set(at, { title: named.title, url: at, kind: named.kind, titleProvisional: true });
          return;
        }
        // Not an instrument itself: worth opening only if it leads where instruments are kept.
        const path = target.pathname;
        if (depth < MAX_DEPTH && LEADS_TO_LAW.test(`${path} ${text}`) && !LEADS_AWAY.test(path)) {
          next.push({ url: at, depth: depth + 1 });
        }
      });
      // Shallower pages first, so the budget is spent near the sections that name themselves.
      queue = [...queue, ...next].sort((a, b) => a.depth - b.depth);
    }

    log(`  ${seen.size} page(s) walked, ${found.size} instrument(s) named`);
    return [...found.values()];
  },
};
