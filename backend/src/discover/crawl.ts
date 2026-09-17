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

/**
 * A link worth following: the section of the site where a regulator keeps its law.
 *
 * The words a site uses for that section are here as well as the words it uses for the
 * instruments themselves, because the two are rarely the same. Malaysia's Content Code 2022 is
 * published on the MCMC's own register of industry codes, three links from the root, and every
 * link on the way to it was refused: "Legal", then "Registers", then "Instrument" -- none of
 * which said "legislation" or "regulation". The crawl reached that site's Acts at all only
 * because one navigation link happened to be captioned "Legislation". A regulator names the
 * place its instruments are kept after the register, the gazette or the instruments, and a
 * crawl that only knows the names of instruments walks past the shelf they are on.
 *
 * Every ending is written out, because the closing \b applies to the whole alternation and not
 * to the branch that matched. "regulat" was meant to catch "regulation", "regulations" and
 * "regulatory" and caught none of them: it matched only a link whose text was the bare stem, and
 * no link's text is. So did "licen[cs]", "vacanc", "guideline" against "guidelines", and "act"
 * against "acts" -- which is to say the filter accepted exact singulars and refused /acts,
 * /rules, /regulations, /guidelines and /licensing on all six sites the crawl adapter reads.
 */
const LEADS_TO_LAW =
  /\b(?:legislat\w*|legal|regulat\w*|licen[cs]\w*|regist\w*|instruments?|gazettes?|statut\w*|codes?|guidelines?|standards?|acts?|rules?|orders?|determinations?|directions?|directives?|circulars?|notices?|polic(?:y|ies)|complian\w*|enforce\w*)\b/i;
/** And the parts of a site that never do, however many links they carry. */
const LEADS_AWAY =
  /\b(?:news|media|press|events?|careers?|vacanc(?:y|ies)|contact|about-us|search|login|subscribe|rss|calendar|galler(?:y|ies)|videos?|podcasts?)\b/i;

/**
 * Whether the crawl opens this link looking for instruments.
 *
 * Exported because it decides what the corpus can contain: a page never opened holds instruments
 * that no ranking, reading or rule can recover, and that failure is invisible downstream -- the
 * cell simply reports that it searched and found nothing.
 */
export function leadsToLaw(path: string, text: string): boolean {
  return LEADS_TO_LAW.test(`${path} ${text}`) && !LEADS_AWAY.test(path);
}

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
        if (depth < MAX_DEPTH && leadsToLaw(path, text)) {
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
