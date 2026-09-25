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
import { decodeBody } from '../fetch/decode.js';
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
  /\b(?:legislat\w*|legal|regulat\w*|licen[cs]\w*|regist\w*|instruments?|documents?|gazettes?|statut\w*|codes?|guidelines?|standards?|acts?|rules?|orders?|determinations?|directions?|directives?|circulars?|notices?|polic(?:y|ies)|complian\w*|enforce\w*)\b/i;
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

/** A listing that says it holds what is in force now, in the portal's own words. */
const CURRENT_LISTING = /\b(?:current|in[- ]force|existing|active)\b/i;
/** And one that says the opposite, which is the same evidence read the other way. */
const HISTORICAL_LISTING = /\b(?:repealed|revoked|superseded|rescinded|historical|archive[ds]?|expired|previous|past)\b/i;

/**
 * What the heading a link sits under says about the standing of what is listed beneath it.
 *
 * `status` defaults to 'unknown', and `frameworkCandidates` admits only instruments recorded
 * 'in-force' -- deliberately, because the crawl once put Monetary Authority press releases into
 * the register as Acts and all five instruments examined for Singapore's 8.1 were press releases.
 * The cost of that filter is that everything a regulator publishes is permanently invisible to a
 * framework indicator: all 120 instruments the MCMC crawl registers are 'unknown', the Content
 * Code 2022 among them, so fetching it changed nothing on its own.
 *
 * A regulator's register answers this itself. The MCMC files the Content Code under "Register Of
 * Current Voluntary Industry Codes", and "Current" is the portal's word, not ours -- which is what
 * `statusBasis` is for. This reads only that: no inference from a title, a date or a file name.
 */
export function standingFromHeading(heading: string | null): Pick<DiscoveredInstrument, 'status' | 'statusBasis'> {
  const line = (heading ?? '').replace(/\s+/g, ' ').trim();
  if (!line || line.length > 200) return {};
  // A heading that says both is saying neither usefully: "Current and Repealed Codes".
  if (HISTORICAL_LISTING.test(line)) return CURRENT_LISTING.test(line) ? {} : { status: 'repealed', statusBasis: line };
  return CURRENT_LISTING.test(line) ? { status: 'in-force', statusBasis: line } : {};
}

/**
 * Where the walk starts, when the front page is not a way in.
 *
 * The crawl begins at the portal's own URL, which assumes the front page carries the navigation.
 * Royal Malaysian Customs does not: its root redirects to a Malay shell whose only on-host links
 * are the two language switchers, so the walk ended after one page and the department reported
 * as publishing nothing. Its index is at /en/home, and from there the same crawl finds the
 * Customs Duties Orders, the Prohibition of Imports and Exports Orders and the anti-dumping
 * orders -- twenty-one instruments across pillars 1, 2 and 12.
 *
 * A seed is a starting point, not a filter: everything else about the walk is unchanged, and the
 * portal's own URL is still walked after them. Seeds are resolved against the portal URL and any
 * that point at another host are dropped, because the crawl stays on one host by design.
 */
function seedsOf(portal: DiscoverContext['portal']): { url: string; depth: number }[] {
  const declared = portal.adapterConfig?.['seeds'];
  if (!Array.isArray(declared)) return [];
  const root = new URL(portal.url);
  const out: { url: string; depth: number }[] = [];
  for (const entry of declared) {
    if (typeof entry !== 'string') continue;
    try {
      const target = new URL(entry, root);
      if (target.host === root.host) out.push({ url: target.toString(), depth: 0 });
    } catch {
      // A seed that is not a URL is a profile typo, and the walk still has the portal's root.
    }
  }
  return out;
}

/** The extra nouns this portal says it names its instruments with. See `namedByDeclared`. */
function namedByOf(portal: DiscoverContext['portal']): string[] {
  const declared = portal.adapterConfig?.['namedBy'];
  return Array.isArray(declared) ? declared.filter((n): n is string => typeof n === 'string') : [];
}

/**
 * A URL an instrument of the tier this profile holds actually sits at.
 *
 * Opt-in, and absent for every portal that publishes one tier -- which is most of them, and why
 * this is not a new rule. Refused at load rather than at the first link, so a pattern that does
 * not compile is a profile error and not a silently empty register.
 */
function tierFilterOf(portal: DiscoverContext['portal']): RegExp | null {
  const pattern = portal.adapterConfig?.['urlMustMatch'];
  if (typeof pattern !== 'string') return null;
  try {
    return new RegExp(pattern);
  } catch {
    throw new Error(
      `${portal.name}'s adapterConfig.urlMustMatch is not a valid regular expression: ${pattern}`,
    );
  }
}

export const crawlAdapter: Adapter = {
  name: 'crawl',
  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log } = ctx;
    const root = new URL(portal.url);
    const seen = new Set<string>();
    const found = new Map<string, DiscoveredInstrument>();
    // What this source says it calls the instruments it publishes, over and above the nouns every
    // source shares. A registry's binding rules are policies and a treasury's are instructions;
    // see `namedByDeclared` for why that has to be said per source and cannot be a word list.
    const namedBy = namedByOf(portal);
    const mustMatch = tierFilterOf(portal);
    // One walk per starting point, each with the page budget to itself.
    //
    // The budget used to be the walk's, shared by every seed, and a shared budget makes a seed
    // cost what it finds. The Commission's legal register and its guidelines library are two
    // shelves on one site: the three register seeds spent all sixty pages between them, and
    // seeding the library reached page one of its six and stopped. Adding a starting point is a
    // claim that the site keeps instruments somewhere else as well, not a request for more of
    // the same pages -- so it gets its own budget, and adding one cannot starve the ones already
    // there. `seen` is shared across the walks, so a page two starting points both reach is
    // fetched once and charged to whichever reached it first.
    for (const start of [...seedsOf(portal), { url: portal.url, depth: 0 }]) {
      const spentBefore = seen.size;
      let queue: { url: string; depth: number }[] = [start];

      while (queue.length && seen.size - spentBefore < MAX_PAGES) {
        const { url, depth } = queue.shift()!;
        if (seen.has(url)) continue;
        seen.add(url);

        let html: string;
        try {
          const res = await fetcher.fetch(url);
          if (!/html/i.test(res.mediaType)) continue;
          html = decodeBody(res);
        } catch {
          continue;
        }

        const $ = cheerio.load(html);
        const next: { url: string; depth: number }[] = [];
        // Headings and links together, in document order, so a link is read under the heading it
        // actually sits beneath. Selecting the anchors alone loses that, and the heading is the only
        // place the portal states what it is listing.
        let heading: string | null = null;
        $('h1, h2, h3, h4, caption, legend, a[href]').each((_, el) => {
          if (el.tagName.toLowerCase() !== 'a') {
            heading = $(el).text().replace(/\s+/g, ' ').trim() || heading;
            return;
          }
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

          const named = instrumentTitle(text, namedBy, ctx.vocabulary);
          if (named && !found.has(at)) {
            // A portal that publishes more than one tier of law needs the tier decided here
            // rather than downstream, because a register is what every later stage believes the
            // corpus to be. publication.pravo.gov.ru publishes federal law beside the law of
            // every constituent entity, and the tier is in the document's own id: 0001 federal,
            // 0300 Buryatia, 7000 Tomsk. Without this, 27 of the 114 instruments registered for
            // Russia were subjects' law that RUS.json declares not held -- the error India's
            // Central-only filter exists to prevent. It also refuses the listing pages, which
            // carry an instrument-shaped heading and are not instruments.
            if (mustMatch && !mustMatch.test(at)) {
              ctx.setAside({
                subject: named.title.slice(0, 120),
                reason: 'outside-the-tier-this-profile-holds',
                detail: at,
              });
              return;
            }
            found.set(at, {
              title: named.title,
              url: at,
              kind: named.kind,
              titleProvisional: true,
              ...standingFromHeading(heading),
            });
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
    }

    log(`  ${seen.size} page(s) walked, ${found.size} instrument(s) named`);
    return [...found.values()];
  },
};
