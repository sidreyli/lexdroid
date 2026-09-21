/**
 * Discovery on a portal that publishes a sitemap.
 *
 * Twenty-four of the thirty sources this system declares had never produced a single instrument,
 * and the documents behind that silence are the ones ESCAP cites most: IMDA's codes of practice,
 * MAS's notices, the Signals Directorate's guidelines. Pillar 11 was missing 60% of its citations
 * for this reason alone, and a cell that finds nothing scores it as no restriction.
 *
 * A sitemap is the sanctioned way in. It is declared in the site's own robots.txt, it is meant to
 * be read by machines, and it costs one request instead of a crawl. What it does not do is say
 * which of its URLs are instruments -- a regulator files its codes beside its press releases --
 * so `instrumentTitle` decides that from how the link is named, and nothing is typed in per site.
 */
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';
import { instrumentTitle } from './titles.js';

/** A sitemap index fans out to more sitemaps. Enough for a large regulator, and it terminates. */
const MAX_SITEMAPS = 40;

const LOC = /<loc>\s*([^<\s]+)\s*<\/loc>/g;

function locations(xml: string): string[] {
  return [...xml.matchAll(LOC)].map((m) => m[1]!.replace(/&amp;/g, '&'));
}

/** The sitemaps the site itself declares, then the conventional path if it declares none. */
async function declared(ctx: DiscoverContext): Promise<string[]> {
  const { portal, fetcher } = ctx;
  try {
    const robots = await fetcher.fetch(new URL('/robots.txt', portal.url).toString());
    const found = [...robots.body.toString('utf8').matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]!);
    if (found.length) return found.slice(0, MAX_SITEMAPS);
  } catch {
    // A site with no robots.txt still usually has the conventional sitemap.
  }
  return [new URL('/sitemap.xml', portal.url).toString()];
}

/** The page a link points at, named the way the publisher named it. */
function slugWords(url: string): string {
  const segments = new URL(url).pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  return decodeURIComponent(last)
    .replace(/\.(pdf|html?|aspx|php)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

export const sitemapAdapter: Adapter = {
  name: 'sitemap',
  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { fetcher, log } = ctx;
    const queue = await declared(ctx);
    const seen = new Set<string>();
    const urls: string[] = [];

    while (queue.length && seen.size < MAX_SITEMAPS) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      let xml: string;
      try {
        xml = (await fetcher.fetch(next)).body.toString('utf8');
      } catch (err) {
        log(`  ${next} -- ${err instanceof Error ? err.message.slice(0, 70) : 'unreadable'}`);
        continue;
      }
      // An index names more sitemaps; a sitemap names pages. Both use <loc>.
      if (/<sitemapindex/i.test(xml)) queue.push(...locations(xml));
      else urls.push(...locations(xml));
    }
    log(`  ${seen.size} sitemap(s), ${urls.length} url(s)`);

    // A page that other pages sit under is a section of the site, not a document in it. This is
    // what tells "/legislation/codes-of-practice" from the codes of practice themselves, and it
    // is structural, so it needs no list of section names per portal.
    const paths = new Set(urls.map((u) => new URL(u).pathname.replace(/\/+$/, '')));
    const isSection = (u: string): boolean => {
      const p = new URL(u).pathname.replace(/\/+$/, '');
      for (const other of paths) if (other !== p && other.startsWith(`${p}/`)) return true;
      return false;
    };

    const out = new Map<string, DiscoveredInstrument>();
    for (const url of urls) {
      if (isSection(url)) continue;
      const named = instrumentTitle(slugWords(url), ctx.vocabulary);
      if (!named) continue;
      // The slug is how the publisher filed it, not always how the instrument names itself; the
      // parser replaces it from the document's own citation provision where it says one.
      if (!out.has(url)) {
        out.set(url, { title: named.title, url, kind: named.kind, titleProvisional: true });
      }
    }
    return [...out.values()];
  },
};
