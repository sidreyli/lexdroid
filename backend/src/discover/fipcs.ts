/**
 * The Bank of Thailand's notifications, from its circulars and notifications database (FIPCS).
 *
 * FIPCS is an ASP.NET page. Its search form filters by document type and standing, and pages
 * through the result with the form's own postback; each result row links the notification's PDF
 * directly on www.bot.or.th, in Thai and, for many, in English too. This asks exactly what the
 * form asks when a reader picks "ประกาศ ธปท." (BOT notification) and "ใช้อยู่" (in force), then
 * follows the page selector the form draws. Nothing about the form is assumed: every hidden field
 * is read back from the page before the next request, and the session cookie the page sets is sent
 * back with it, which is how ASP.NET expects to be asked -- without it, page two is a fresh visit.
 *
 * The English PDF is the document where there is one -- it is what the bank publishes for readers
 * outside Thailand -- and the Thai is read beside it as the same instrument.
 */
import * as cheerio from 'cheerio';
import type { PostBody } from '../fetch/index.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

const LIST_URL = 'https://app.bot.or.th/FIPCS/Thai/PFIPCS_list.aspx';
const FIELD = 'ctl00$ContentPlaceHolder1$';
/** The form's own codes: document type 2 is "ประกาศ ธปท.", standing 1 is "ใช้อยู่" (in force). */
const FILTERS: Record<string, string> = {
  [`${FIELD}DocType`]: '2',
  [`${FIELD}ddlStatus`]: '1',
  [`${FIELD}IssueBy`]: '0',
  [`${FIELD}DocGroup`]: '0',
  [`${FIELD}ByYear`]: '0',
  [`${FIELD}Category`]: '0',
  [`${FIELD}SubCategory`]: '0',
  [`${FIELD}ddlLaw`]: '0',
  [`${FIELD}txtDocNo`]: '',
  [`${FIELD}txtSubject`]: '',
  [`${FIELD}txtSearch`]: '',
};
const MAX_PAGES = 100;

function hiddenFields($: cheerio.CheerioAPI): Record<string, string> {
  const out: Record<string, string> = {};
  $('input[type=hidden]').each((_, el) => {
    const name = $(el).attr('name');
    if (name) out[name] = $(el).attr('value') ?? '';
  });
  return out;
}

function post(fields: Record<string, string>): PostBody {
  return {
    body: new URLSearchParams(fields).toString(),
    contentType: 'application/x-www-form-urlencoded',
    referer: LIST_URL,
  };
}

export interface FipcsRow {
  title: string;
  thai: string | null;
  english: string | null;
}

/** The notification rows of one results page: title, and the PDFs it links. */
export function fipcsRows(html: string): FipcsRow[] {
  const $ = cheerio.load(html);
  const rows: FipcsRow[] = [];
  $('tr').each((_, tr) => {
    const kind = $(tr).children('td.namenews').first().text().trim();
    if (!kind) return;
    const title = $(tr).find('p.setrow').first().text().replace(/\s+/g, ' ').trim();
    let thai: string | null = null;
    let english: string | null = null;
    $(tr).find('a[href*="/fipcs/documents/"]').each((__, a) => {
      const href = $(a).attr('href') ?? '';
      const label = $(a).text().trim().toUpperCase();
      if (label === 'EN' || /EngPDF/i.test(href)) english ??= href;
      else thai ??= href;
    });
    if (title) rows.push({ title, thai, english });
  });
  return rows;
}

/** The page selector the results grid draws, and how many pages it offers. */
function pager($: cheerio.CheerioAPI): { name: string; pages: number } | null {
  const select = $('select[name$="$ddlPageSelector"]').first();
  const name = select.attr('name');
  if (!name) return null;
  return { name, pages: select.find('option').length };
}

export const fipcsAdapter: Adapter = {
  name: 'fipcs',

  async discover(ctx) {
    const askedOn = new Date().toISOString().slice(0, 10);
    const statusBasis = `The Bank of Thailand's notifications database lists this as ใช้อยู่ (in force) (asked on ${askedOn})`;

    const first = await ctx.fetcher.fetch(LIST_URL, { refresh: true, session: true });
    if (first.status !== 200) throw new Error(`the notifications database answered HTTP ${first.status}`);
    let $ = cheerio.load(first.body.toString('utf8'));

    // The search, as the form's search button sends it.
    let res = await ctx.fetcher.fetch(LIST_URL, {
      refresh: true,
      session: true,
      post: post({ ...hiddenFields($), ...FILTERS, [`${FIELD}btnSearchAdvance`]: 'ค้นหา' }),
    });
    const found = new Map<string, DiscoveredInstrument>();
    let pages = 1;
    for (let page = 1; page <= Math.min(pages, MAX_PAGES); page += 1) {
      if (res.status !== 200) throw new Error(`the notifications database answered HTTP ${res.status} on page ${page}`);
      const html = res.body.toString('utf8');
      $ = cheerio.load(html);
      const rows = fipcsRows(html);
      for (const row of rows) {
        const url = row.english ?? row.thai;
        if (!url) {
          ctx.setAside({ subject: row.title, reason: 'no-document-link', detail: 'listed with no PDF' });
          continue;
        }
        if (found.has(url)) continue;
        found.set(url, {
          title: row.title,
          url,
          kind: 'notice',
          status: 'in-force',
          statusBasis,
          ...(row.english && row.thai ? { alsoAt: [row.thai] } : {}),
        });
      }
      const p = pager($);
      pages = p?.pages ?? page;
      ctx.log(`    page ${page}/${pages}: ${rows.length} row(s), ${found.size} notification(s) so far`);
      if (!p || page >= pages) break;

      // The next page, asked the way the page selector asks: its own postback, with the form's
      // state read back from the page it is on.
      res = await ctx.fetcher.fetch(LIST_URL, {
        refresh: true,
      session: true,
        post: post({
          ...hiddenFields($),
          ...FILTERS,
          __EVENTTARGET: p.name,
          __EVENTARGUMENT: '',
          [p.name]: String(page + 1),
        }),
      });
    }
    return [...found.values()];
  },
};
