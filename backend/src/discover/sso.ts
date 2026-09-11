/**
 * Discovery on Singapore Statutes Online.
 *
 * Portal-shaped, not curated: it walks the site's own browse listings of current Acts and current
 * subsidiary legislation, page by page, and takes whatever is there. No list of Acts is written
 * down anywhere in this repository, because the economy that decides the live test is one nobody
 * has looked at.
 *
 * robots.txt disallows /search and asks for six seconds between requests. Both are honoured by
 * the fetcher; discovery uses the browse listings, which are allowed, rather than the search box.
 */
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { HostSuspended, type Fetcher } from '../fetch/index.js';
import type { FetchResult } from '../fetch/index.js';
import { provisionIds } from '../parse/sso.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

const ORIGIN = 'https://sso.agc.gov.sg';
/**
 * The most query string this host will accept. Measured, not assumed -- see resolveDocument.
 * Held below the wall by enough that a longer document path does not creep over it.
 */
const MAX_QUERY_CHARS = 1800;

/** Provision ids grouped into runs whose request stays under the limit. */
function chunkIds(ids: string[], url: string): string[][] {
  // The path counts against some WAF size rules and not others; charging it to the budget costs
  // one extra request on a very long Act and removes the question.
  const budget = MAX_QUERY_CHARS - new URL(url).pathname.length - 'ProvIds='.length;
  const runs: string[][] = [];
  let run: string[] = [];
  let len = 0;
  for (const id of ids) {
    if (run.length > 0 && len + id.length + 1 > budget) {
      runs.push(run);
      run = [];
      len = 0;
    }
    run.push(id);
    len += id.length + 1;
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/**
 * Several partial responses into one document.
 *
 * Each response is the same page carrying a different run of provisions, so the first is the
 * shell and the rest contribute their provisions to it. Merging the markup rather than the parsed
 * output keeps one body, one hash and one set of character offsets: the invariant that a section's
 * recorded span still slices its own text out of the document is what makes a citation checkable.
 */
function mergeProvisions(bodies: string[]): string {
  const $ = cheerio.load(bodies[0]!);
  const container = $('#legisContent').first();
  if (container.length === 0) return bodies[0]!;

  // A schedule arrives as div.schedule rather than div.prov1, and is merged the same way: it is
  // where a prohibited-goods list or a relief threshold is written down.
  const HEADERS = 'td.prov1Hdr, td.prov1Rep, td.sHdr';
  const have = new Set<string>();
  container.find(`div.prov1 ${HEADERS}, div.schedule ${HEADERS}`).each((_i, el) => {
    const id = $(el).attr('id');
    if (id) have.add(id);
  });

  for (const html of bodies.slice(1)) {
    const $more = cheerio.load(html);
    $more('#legisContent').find('div.prov1, div.schedule').each((_i, el) => {
      const id = $more(el).find(HEADERS).first().attr('id');
      if (id && have.has(id)) return;
      if (id) have.add(id);
      container.append($more.html(el as never));
    });
  }
  return $.html();
}

const MAX_PAGES = 20;

interface BrowseConfig {
  kind: DiscoveredInstrument['kind'];
  path: string;
  /** What this listing asserts about everything on it. SSO lists current and repealed apart. */
  status?: DiscoveredInstrument['status'];
  /** How the listing describes itself, quoted into the status basis. */
  listing?: string;
}

/**
 * A listing row's document link.
 *
 * Subsidiary legislation carries a query string -- /SL/SCJA1969-N2?DocDate=19970926 -- and Acts do
 * not, so the pattern has to admit both. It must still exclude the PDF, RSS and "subsidiary
 * legislation of this Act" links in the same row, which are the same instrument in another form.
 */
const DOCUMENT_HREF = /^\/(Act|SL|Act-Rev|SL-Rev)\/[A-Za-z0-9%._-]+(\?(?!.*ViewType=)[^#]*)?$/;

function rowsOn(html: string, cfg: BrowseConfig, on: string): DiscoveredInstrument[] {
  const $ = cheerio.load(html);
  const out: DiscoveredInstrument[] = [];
  const seen = new Set<string>();

  $('tbody tr').each((_i, tr) => {
    const $tr = $(tr);
    const link = $tr.find('td a.non-ajax[href]').toArray().find((a) => DOCUMENT_HREF.test($(a).attr('href') ?? ''));
    if (!link) return;
    const href = $(link).attr('href')!;
    const title = $(link).text().replace(/\s+/g, ' ').trim();
    if (!title || seen.has(href)) return;
    seen.add(href);
    // "Cap. 322, N 2" -- SSO's own citation number for the instrument, in its own column.
    const number = $tr.find('td.col-no').first().text().replace(/\s+/g, ' ').trim() || null;
    out.push({
      title,
      url: `${ORIGIN}${href}`,
      kind: cfg.kind,
      officialNumber: number,
      ...(cfg.status
        ? {
            status: cfg.status,
            statusBasis: `Listed under "${cfg.listing ?? cfg.path}" at ${ORIGIN} on ${on}`,
          }
        : {}),
    });
  });
  return out;
}

/**
 * The site's own links to its remaining pages.
 *
 * Read rather than constructed: SSO pages by a path segment (/Browse/Act/Current/All/1) and
 * ignores a PageIndex query parameter entirely, so a guessed URL silently returns page one again
 * and the walk quietly stops after 500 of 524 Acts. Following the links the page gives us cannot
 * fail that way, and it works the same on a portal nobody has looked at.
 */
function pageLinks(html: string, currentPath: string): string[] {
  const $ = cheerio.load(html);
  const base = currentPath.split('?')[0]!.replace(/\/\d+$/, '');
  const out: string[] = [];
  $('#pageIndexPopover a[href]').each((_i, el) => {
    const href = $(el).attr('href')!;
    if (!href.split('?')[0]!.startsWith(base)) return;
    if (!out.includes(href)) out.push(href);
  });
  return out.slice(0, MAX_PAGES);
}

/** "524 results in 2 pages" -- the site's own count, so we can say whether we walked all of it. */
function resultCount(html: string): number | null {
  const text = cheerio.load(html)('.page-count').first().text().replace(/\s+/g, ' ');
  const m = /([\d,]+)\s+results/i.exec(text);
  return m ? Number(m[1]!.replace(/,/g, '')) : null;
}

export const ssoAdapter: Adapter = {
  name: 'sso',

  async discover(ctx) {
    const configs = (ctx.portal.adapterConfig['browse'] as BrowseConfig[] | undefined) ?? [];
    const walkedOn = new Date().toISOString().slice(0, 10);
    const found: DiscoveredInstrument[] = [];
    const seen = new Set<string>();

    for (const cfg of configs) {
      const queue = [cfg.path];
      const walked = new Set<string>();
      let expected: number | null = null;
      let fromThisListing = 0;

      while (queue.length > 0) {
        const path = queue.shift()!;
        if (walked.has(path)) continue;
        walked.add(path);

        // A listing page that does not arrive costs us every instrument on it, but it must not
        // cost us the ones already read. The register is built once at the start of a run and
        // everything downstream searches only what it contains, so a walk that dies halfway
        // produces a corpus with a hole in it and no record that the hole is there -- whereas a
        // walk that skips a page and says so leaves a shortfall the count check below reports.
        let res;
        try {
          res = await ctx.fetcher.fetch(`${ORIGIN}${path}`);
        } catch (err) {
          if (err instanceof HostSuspended) {
            ctx.log(`    stopped walking ${cfg.kind}: ${err.message}`);
            break;
          }
          ctx.log(`    ${path}: not read -- ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
        const html = res.body.toString('utf8');

        if (expected === null) {
          expected = resultCount(html);
          ctx.log(`  ${cfg.kind}: ${expected ?? 'an unstated number of'} instrument(s) listed by the portal`);
        }
        for (const link of pageLinks(html, path)) {
          if (!walked.has(link)) queue.push(link);
        }

        let added = 0;
        for (const row of rowsOn(html, cfg, walkedOn)) {
          fromThisListing += 1;
          if (seen.has(row.url)) continue;
          seen.add(row.url);
          found.push(row);
          added += 1;
        }
        ctx.log(`    ${path}: ${added} instrument(s)`);
      }

      // The portal's own count against what we took off it. A silent shortfall here is a shortfall
      // in the corpus, and every "no restriction" answer downstream inherits it.
      if (expected !== null && fromThisListing < expected) {
        ctx.log(`    WARNING: the portal lists ${expected} ${cfg.kind}(s) and ${fromThisListing} were read from its pages`);
      }
    }
    return found;
  },

  /**
   * SSO serves a document page with only its first dozen provisions and loads the rest on scroll.
   * Asking for every provision id in one further request gets the whole Act.
   *
   * For a long Act that one request is refused. The Companies Act 1967 has 687 provisions, whose
   * ids make a query string of 4,949 characters, and the site answers 403 to it -- while curl
   * fetches the same Act's landing page normally, which is what separates this from the cipher
   * fingerprint the fetcher already handles. Measured against the live site on 6 September 2026,
   * walking the same id list: 2,007 characters answered 200 and 2,107 answered 403, so the wall
   * sits at the 2,048 bytes an AWS WAF counts a query string against by default.
   *
   * The three Acts that hit it -- Companies, Income Tax, Criminal Procedure Code -- are among the
   * most cited in the economy, so this is not an edge case to record and move past. The provision
   * ids are requested in runs that stay under the limit and the responses are stitched into one
   * document, which is what the parser and the offset invariant expect.
   */
  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const first = await fetcher.fetch(url);
    const ids = provisionIds(first.body.toString('utf8'));
    if (ids.length === 0) return first;

    const runs = chunkIds(ids, url);
    const responses: FetchResult[] = [];
    for (const run of runs) {
      const res = await fetcher.fetch(`${url}${url.includes('?') ? '&' : '?'}ProvIds=${run.join(',')}`);
      if (res.status !== 200) return res;
      responses.push(res);
    }
    if (responses.length === 1) return { ...responses[0]!, url };

    const merged = mergeProvisions(responses.map((r) => r.body.toString('utf8')));
    const body = Buffer.from(merged, 'utf8');
    return {
      ...responses[0]!,
      // The canonical URL, because that is the document this body is: an assembly of several
      // responses is not addressable at any one of their URLs, and a citation has to resolve.
      url,
      body,
      contentHash: createHash('sha256').update(body).digest('hex'),
      fromCache: responses.every((r) => r.fromCache),
    };
  },
};

/** Exported for the tests that hold the measured query-string wall in place. */
export const __rowsOn = rowsOn;
export const __chunkIds = chunkIds;
export const __mergeProvisions = mergeProvisions;
export const __maxQueryChars = MAX_QUERY_CHARS;
