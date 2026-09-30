/**
 * Discovery on Mongolia's Unified Legal Information System (legalinfo.mn).
 *
 * The India Code equivalent, and the most tractable portal this repository has profiled: it
 * publishes its own instrument taxonomy with counts, serves every document as server-rendered
 * HTML, and answers a listing endpoint that filters by category, by standing and by page.
 *
 * Two things about it decide the shape of this adapter.
 *
 * It is POST-only in effect. `GET /mn/ajaxListBody/?...` answers 200 with valid JSON and ignores
 * every parameter -- `filtercategorytypeid=27` and `=33` come back byte-identical, `page=3`
 * returns page one -- because the application reads `$_POST`. Measured against the live site on
 * 21 September 2026. That is why `Fetcher.fetch` learned to post, and why the cache key had to
 * grow to include the body: the URL is one path and the parameters are the whole question.
 *
 * And the listing does not say what kind of instrument a row is. The category does. So this walks
 * one category at a time and takes the kind from the category walked, which makes it evidence
 * from the register rather than a guess from the title -- the same reason `sso` and `lom` read
 * their listings' own headings rather than inferring standing from a name.
 */
import * as cheerio from 'cheerio';
import { CacheMiss, cacheComposed, type Fetcher, type FetchResult } from '../fetch/index.js';
import { ANNEX } from '../parse/legalinfo.js';
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';
import type { InstrumentKind } from './titles.js';

const LISTING = '/mn/ajaxListBody/';
const PER_PAGE = 20;

/**
 * Enough pages for the largest category with room to spare. Government resolutions are 5,778
 * instruments, which is 289 pages; the cap stops a listing that paginates forever rather than
 * bounding an honest walk.
 */
const MAX_PAGES = 400;

/**
 * The categories the portal publishes, with the count it states for each and the kind it maps to.
 *
 * The counts are the portal's own, read from its footer on 21 September 2026, and they are what
 * makes the shortfall check exact rather than inferred -- the same property Australia's OData
 * count gives the `frl` adapter. A category that returns materially fewer rows than its stated
 * count is a finding, not a smaller category.
 *
 * `27` is the Laws of Mongolia. The listing page's navigation puts "Хүчинтэй эрх зүйн акт"
 * (in-force acts) beside the same href, so reading the nav rather than the footer gets this
 * wrong; it did, here, first time.
 */
interface Category {
  id: string;
  kind: InstrumentKind;
  /** What the portal calls it. */
  name: string;
  /** What the portal says it holds. */
  stated: number;
  /** Sub-national: held by the portal, and not national law. */
  local?: boolean;
  /** A court's decisions are not an instrument this register describes. */
  court?: boolean;
}

export const CATEGORIES: Category[] = [
  { id: '26', kind: 'act', name: 'Монгол Улсын Үндсэн Хууль (Constitution)', stated: 1 },
  { id: '27', kind: 'act', name: 'Монгол Улсын хууль (Law of Mongolia)', stated: 956 },
  { id: '29', kind: 'act', name: 'Монгол Улсын олон улсын гэрээ (International treaty)', stated: 699 },
  { id: '30', kind: 'order', name: 'Ерөнхийлөгчийн зарлиг (Presidential decree)', stated: 218 },
  { id: '28', kind: 'order', name: 'Улсын Их Хурлын тогтоол (Khural resolution)', stated: 2589 },
  { id: '33', kind: 'regulation', name: 'Засгийн газрын тогтоол (Government resolution)', stated: 5778 },
  { id: '34', kind: 'notice', name: 'Сайдын тушаал (Ministerial order)', stated: 988 },
  { id: '35', kind: 'notice', name: "Засгийн газрын агентлагийн даргын тушаал (agency head's order)", stated: 217 },
  { id: '36', kind: 'notice', name: 'УИХ-аас томилогддог байгууллагын шийдвэр', stated: 132 },
  { id: '390', kind: 'notice', name: 'Хууль, хяналтын байгууллага', stated: 6 },
  { id: '180', kind: 'notice', name: 'Төрийн зарим чиг үүргийг хэрэгжүүлж буй байгууллага', stated: 3 },
  { id: '186', kind: 'guideline', name: 'Зөвлөл, хороо, бусад байгууллага (councils and committees)', stated: 605 },
  { id: '37', kind: 'order', name: 'Аймаг, нийслэлийн ИТХ-ын шийдвэр (provincial assembly)', stated: 1212, local: true },
  { id: '38', kind: 'order', name: 'Аймаг, нийслэлийн Засаг даргын захирамж (governor)', stated: 86, local: true },
  { id: '31', kind: 'guideline', name: 'Үндсэн хуулийн цэцийн шийдвэр (Constitutional Court)', stated: 332, court: true },
  { id: '32', kind: 'guideline', name: 'Улсын дээд шүүхийн тогтоол (Supreme Court)', stated: 259, court: true },
  { id: '16231124857801', kind: 'guideline', name: 'Шүүхийн ерөнхий зөвлөл (General Council of Courts)', stated: 9, court: true },
];

/** `2022-06-10` as the listing writes it, or null for the blanks it leaves. */
function isoDate(raw: string): string | null {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return m ? m[0]! : null;
}

/** The rows one page of the listing carries. */
export function rowsFrom(html: string, kind: InstrumentKind): DiscoveredInstrument[] {
  const $ = cheerio.load(html);
  const out: DiscoveredInstrument[] = [];

  // The fragment marks its own fields, so nothing here counts columns -- a listing that gains a
  // column is the single most ordinary way a positional parser starts reading the wrong one.
  $('.legal-list-component').each((_i, el) => {
    const row = $(el);
    const anchor = row.find('[data-block="title"] a').first();
    const title = anchor.text().replace(/\s+/g, ' ').trim();
    const url = (anchor.attr('href') ?? '').trim();
    if (!title || !url || !/lawId=\d+/.test(url)) return;

    const enacted = isoDate(row.find('[data-block="enacteddate"]').text());
    const effective = isoDate(row.find('[data-block="enforcementdate"]').text());

    out.push({
      title,
      url,
      kind,
      // The listing walked is what says this: the portal separates in-force from repealed, and
      // which listing a row came off is the portal's own answer to a question we would otherwise
      // have to infer from the document.
      status: 'in-force',
      statusBasis: 'Listed under Хүчинтэй эрх зүйн акт (in-force legal acts) on legalinfo.mn',
      // The day the instrument takes effect, which is not always the day it was passed.
      commencedOn: effective ?? enacted,
    });
  });

  return out;
}

/**
 * The page's annex tab, if it has one: `showActiveTab('3', this, '<dvid>', '')` on the tab that
 * reads "Хавсралт", and the instrument's own id. Tab 3 is the annexes; the page script posts these
 * to `lawConnectedTypeData` when a reader opens it (assets/custom/legal/js/pages/detail.js).
 */
export function annexTab(html: string): { dvid: string; lawId: string } | null {
  const tab = /showActiveTab\('3',\s*this,\s*'(\d+)',\s*'[^']*'\)/.exec(html);
  const law = /lawId\s*=\s*'(\d+)'/.exec(html) ?? /data-lawid="(\d+)"/.exec(html);
  return tab && law ? { dvid: tab[1]!, lawId: law[1]! } : null;
}

export interface Annex {
  id: string;
  title: string;
  /** What the portal lists it as: "Хүчинтэй" (in force) or "Хүчингүй" (repealed). */
  status: string;
}

/** The annexes the tab lists: each one's id, its name, and the standing the portal gives it. */
export function annexesFrom(html: string): Annex[] {
  const $ = cheerio.load(html);
  return $('[data-id]')
    .toArray()
    .map((row) => {
      const r = $(row);
      const cells = r.children().toArray().map((c) => $(c).text().replace(/\s+/g, ' ').trim());
      return {
        id: r.attr('data-id') ?? '',
        title: r.find('h6').first().text().replace(/\s+/g, ' ').trim(),
        status: cells.at(-1) ?? '',
      };
    })
    .filter((a) => /^\d+$/.test(a.id) && a.title);
}

/** The instrument's page with each annex's content block appended as a section the parser reads under the annex's name. */
export function withAnnexes(page: string, annexes: { annex: Annex; url: string; html: string }[]): string {
  const blocks = annexes.map(({ annex, url, html }) => {
    const $ = cheerio.load(html);
    const content = $('.law_content').first();
    const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    return (
      `<section class="${ANNEX.split('.')[1]}" data-title="${attr(annex.title)}" ` +
      `data-status="${attr(annex.status)}" data-url="${attr(url)}">${content.length ? $.html(content) : ''}</section>`
    );
  });
  const at = page.lastIndexOf('</body>');
  return at < 0 ? page + blocks.join('\n') : `${page.slice(0, at)}${blocks.join('\n')}\n${page.slice(at)}`;
}

export const legalinfoAdapter: Adapter = {
  name: 'legalinfo',

  /**
   * The instrument's page, with the annexes it approves.
   *
   * A resolution that approves a procedure says "журмыг хавсралт ёсоор баталсугай" -- approve the
   * procedure per the annex -- and its page stops there: of 24 pages read, every one that approved
   * something held two or three operative points and none of what was approved. The "Word" file
   * the page offers is the same text again. The annex is served on its own page,
   * `detail?lawId=<annex id>`, listed by the tab the page loads on click; without it the corpus
   * holds the instruction to follow a procedure and not the procedure.
   *
   * Only the first page of the tab's listing is read; no page sampled lists more than one annex.
   */
  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const page = await fetcher.fetch(url);
    if (page.status !== 200) return page;
    const html = page.body.toString('utf8');
    const tab = annexTab(html);
    if (!tab) return page;

    const origin = new URL(url).origin;
    let annexes: Annex[];
    try {
      const listing = await fetcher.fetch(`${origin}/mn/lawConnectedTypeData`, {
        form: { dvid: tab.dvid, type: '3', lawId: tab.lawId, annexId: '' },
      });
      annexes = annexesFrom((JSON.parse(listing.body.toString('utf8')) as { Html?: string }).Html ?? '');
    } catch (err) {
      // A re-parse from the cache of a page read before annexes were fetched: the page is still
      // what it was. Anything else -- a refusal, a dropped connection -- is not swallowed.
      if (err instanceof CacheMiss || err instanceof SyntaxError) return page;
      throw err;
    }
    if (annexes.length === 0) return page;

    const read: { annex: Annex; url: string; html: string }[] = [];
    for (const annex of annexes) {
      const at = `${origin}/mn/detail?lawId=${annex.id}`;
      try {
        const res = await fetcher.fetch(at);
        if (res.status === 200) read.push({ annex, url: at, html: res.body.toString('utf8') });
      } catch (err) {
        if (!(err instanceof CacheMiss)) throw err;
      }
    }

    const body = Buffer.from(withAnnexes(html, read), 'utf8');
    return { ...page, body, contentHash: cacheComposed(body), mediaType: 'text/html' };
  },

  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log, setAside } = ctx;
    const base = portal.url.replace(/\/+$/, '');
    const config = portal.adapterConfig as { categories?: string[]; includeLocal?: boolean };

    const wanted = CATEGORIES.filter((c) => {
      if (config.categories) return config.categories.includes(c.id);
      if (c.court) return false;
      if (c.local) return config.includeLocal === true;
      return true;
    });

    // Recorded rather than dropped: a tier this walk chose not to hold is a scope condition a
    // reviewer can see, and the profile's jurisdictionScope says the same thing in prose.
    //
    // The reason has to say which of three things happened, because they mean different things to
    // whoever reads the record. A court's decisions are not instruments this register describes at
    // all; a local tier is held by the portal and deliberately not by us; and a category left out
    // by an explicit `categories` config is a scoped repair walk, not a statement about scope.
    for (const c of CATEGORIES) {
      if (wanted.includes(c)) continue;
      const reason = c.court
        ? 'court-decisions-not-instruments'
        : c.local
          ? 'sub-national-tier-not-held'
          : 'outside-the-requested-categories';
      setAside({
        subject: `${c.name} (category ${c.id})`,
        reason,
        detail: `${c.stated} listed; the portal publishes these, this walk does not register them`,
      });
    }

    const found = new Map<string, DiscoveredInstrument>();

    for (const category of wanted) {
      let registered = 0;
      for (let page = 1; page <= MAX_PAGES; page += 1) {
        let body: string;
        try {
          const res = await fetcher.fetch(`${base}${LISTING}`, {
            form: {
              filtercategorytypeid: category.id,
              isactive: '1',
              page: String(page),
              sort: 'title',
              sortType: 'asc',
            },
          });
          body = res.body.toString('utf8');
        } catch (err) {
          setAside({
            subject: `${category.name} page ${page}`,
            reason: 'listing-page-failed',
            detail: err instanceof Error ? err.message : String(err),
          });
          break;
        }

        let html: string;
        try {
          html = (JSON.parse(body) as { Html?: string }).Html ?? '';
        } catch {
          setAside({
            subject: `${category.name} page ${page}`,
            reason: 'listing-not-json',
            detail: body.slice(0, 160),
          });
          break;
        }

        const rows = rowsFrom(html, category.kind);
        if (rows.length === 0) break;

        for (const row of rows) {
          if (!found.has(row.url)) {
            found.set(row.url, row);
            registered += 1;
          }
        }
        // A short page is the last page. The endpoint answers an over-run page with an empty
        // fragment, which the check above already stops on; this saves the extra request.
        if (rows.length < PER_PAGE) break;
      }

      // The portal states what each category holds, so the shortfall is exact rather than
      // inferred from a results line.
      const short = category.stated - registered;
      log(`  ${category.name}: ${registered} of ${category.stated} stated`);
      if (short > 0) {
        setAside({
          subject: category.name,
          reason: 'fewer-than-the-portal-states',
          detail: `registered ${registered}, the portal states ${category.stated}; ${short} not listed under the in-force filter`,
        });
      }
    }

    return [...found.values()];
  },
};
