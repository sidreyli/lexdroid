/**
 * Thailand's Office of the Council of State law search (searchlaw.ocs.go.th).
 *
 * Both halves are the requests the portal's own public pages send, captured from a browser on
 * 26 September 2026 and replayed unchanged -- nothing here was guessed at:
 *
 *   - www.ocs.go.th/searchlaw lists the laws currently in force through a paged form POST to
 *     `searchlaw/indexs/list_table_search`. Each principal law row carries the subordinate laws
 *     made under it (Royal Decrees, Ministerial Regulations, Notifications) as `childrens`.
 *   - Opening a law at searchlaw.ocs.go.th/council-of-state/#/public/doc/<id> POSTs that id to
 *     `ocs-api/public/doc/getLawDoc`, with no credential, and gets the consolidated text back
 *     already divided into its sections, with the Royal Gazette references as footnotes.
 *
 * The instrument URL is the page a reader opens, so a citation links somewhere a person can check.
 */
import { createHash } from 'node:crypto';
import { cacheComposed, type FetchResult, type Fetcher, type PostBody } from '../fetch/index.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

export const OCS_MEDIA_TYPE = 'application/vnd.lexdroid.ocs+json';

const LIST_URL = 'https://www.ocs.go.th/searchlaw/indexs/list_table_search';
const DOC_API = 'https://searchlaw.ocs.go.th/ocs-api/public/doc/getLawDoc';
const DOC_PAGE = 'https://searchlaw.ocs.go.th/council-of-state/#/public/doc/';
const PER_PAGE = 100;
const MAX_PAGES = 200;

/** The listing's own state codes: 01 is law in force, 02 is law enacted and awaiting commencement. */
const STATE_NAME: Record<string, string> = {
  '01': 'กฎหมายฉบับปัจจุบัน (current law)',
  '02': 'กฎหมายรอมีผลบังคับใช้ (awaiting commencement)',
};

interface ListChild {
  title: string;
  date?: string;
  href?: string;
  encTimelineID?: string;
  state?: string;
}

interface ListRow {
  lawCode: string;
  lawNameTh: string;
  lawNameEn: string | false;
  encTimelineID: string;
  publishDate?: string;
  state?: string;
  childrens?: { name: string; items: ListChild[] }[] | null;
}

interface ListPage {
  meta?: { total?: number; pages?: number };
  data?: ListRow[];
}

export interface OcsSection {
  sectionId: number;
  sectionTypeId: number | string;
  sectionContent: string;
  sectionSeq: number;
  sectionLabel: string;
}

export interface OcsDoc {
  lawInfo?: {
    timelineId?: string;
    lawCode?: string;
    lawNameTh?: string;
    lawNameEn?: string;
    stateId?: string;
    publishDateAd?: string;
    effectiveDateStartAd?: string;
  };
  lawSections?: OcsSection[];
  footnoteList?: { footnoteDetect?: string; footnoteContent?: string }[];
}

export interface OcsResolved {
  sourceUrl: string;
  doc: OcsDoc;
}

/** What an instrument is, read off the form of its name -- which in Thai law is the instrument type. */
export function ocsKind(title: string): DiscoveredInstrument['kind'] {
  const t = title.trim();
  if (/^(?:พระราชบัญญัติ|พระราชกำหนด|ประมวลกฎหมาย|รัฐธรรมนูญ)/.test(t)) return 'act';
  if (/^พระราชกฤษฎีกา/.test(t)) return 'order';
  if (/^กฎกระทรวง/.test(t)) return 'regulation';
  if (/^ประกาศ/.test(t)) return 'notice';
  if (/^(?:ระเบียบ|ข้อบังคับ)/.test(t)) return 'rule';
  if (/^คำสั่ง/.test(t)) return 'order';
  return 'regulation';
}

function form(fields: Record<string, string>): PostBody {
  return {
    body: new URLSearchParams(fields).toString(),
    contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
    referer: 'https://www.ocs.go.th/searchlaw',
  };
}

/** The listing request the search page sends, for one page of the laws in force. */
function listRequest(page: number): PostBody {
  return form({
    'query[letter]': '',
    'query[tab_type]': 'law',
    'query[q]': '',
    'query[sort]': 'date-desc',
    'query[topic]': '1',
    'query[content]': '0',
    'query[sublaw]': '0',
    'query[synonyms]': '0',
    'query[lawCategoryName]': '',
    'query[stateName]': '01,02',
    'query[year]': '',
    'query[yearComment]': '',
    'query[acting]': '',
    'query[fNumber]': '',
    'query[committees]': '',
    'query[param]': '',
    'query[param1]': '',
    'query[onlyMatchChild]': '0',
    'pagination[page]': String(page),
    'pagination[perpage]': String(PER_PAGE),
  });
}

/**
 * The document request the law page sends. The header fields are the page's own; they are fixed
 * here rather than random so the same law is the same request, and a second run reads the cache.
 */
export function docRequest(timelineId: string): PostBody {
  const id = createHash('sha256').update(timelineId).digest('hex');
  const uuid = `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`;
  return {
    body: JSON.stringify({
      reqHeader: {
        reqId: '1',
        reqChannel: 'WEB',
        reqDtm: '2026-09-26 00:00:00.000',
        reqBy: 'unknow',
        serviceName: 'getPublicLawDoc',
        uuid,
        sessionId: uuid,
      },
      reqBody: { isTransEng: false, timelineId },
    }),
    contentType: 'application/json',
    referer: 'https://searchlaw.ocs.go.th/council-of-state/',
  };
}

export function timelineIdOf(url: string): string | null {
  return /#\/public\/doc\/([^/?#]+)/.exec(url)?.[1] ?? null;
}

/**
 * The Council marks a repealed law by closing its name with "(ยกเลิก)" ("repealed"), and still lists
 * it as state 01 -- which names the current version of the text, not a law in force. 639 of the
 * 6,073 instruments listed carry the mark; read as in force, a repealed Act was citable evidence.
 */
const REPEALED_MARK = /\(ยกเลิก\)\s*$/;

export function ocsStanding(title: string, state: string | undefined, askedOn: string): Pick<DiscoveredInstrument, 'status' | 'statusBasis'> {
  if (REPEALED_MARK.test(title)) {
    return {
      status: 'repealed',
      statusBasis: `The Council of State's law search names this "... (ยกเลิก)" (repealed) (asked on ${askedOn})`,
    };
  }
  const name = STATE_NAME[state ?? ''];
  const basis = `The Council of State's law search lists this as ${name ?? `state ${state ?? 'unstated'}`} (asked on ${askedOn})`;
  return state === '01' ? { status: 'in-force', statusBasis: basis } : { statusBasis: basis };
}

export const ocsAdapter: Adapter = {
  name: 'ocs',

  async discover(ctx) {
    const askedOn = new Date().toISOString().slice(0, 10);
    const found = new Map<string, DiscoveredInstrument>();
    let expected: number | null = null;
    let principal = 0;

    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const res = await ctx.fetcher.fetch(LIST_URL, { post: listRequest(page) });
      if (res.status !== 200) throw new Error(`the law listing answered HTTP ${res.status} on page ${page}`);
      let body: ListPage;
      try {
        body = JSON.parse(res.body.toString('utf8')) as ListPage;
      } catch {
        throw new Error(`the law listing did not answer with JSON on page ${page}`);
      }
      expected ??= body.meta?.total ?? null;
      const rows = body.data ?? [];
      if (rows.length === 0) break;

      for (const row of rows) {
        principal += 1;
        const english = typeof row.lawNameEn === 'string' && row.lawNameEn.trim() ? row.lawNameEn.trim() : null;
        const title = row.lawNameTh.replace(/\s+/g, ' ').trim();
        if (!row.encTimelineID) {
          ctx.setAside({ subject: title, reason: 'no-document-link', detail: `listed without a document id (${row.lawCode})` });
          continue;
        }
        found.set(row.encTimelineID, {
          title: english ? `${title} (${english})` : title,
          url: DOC_PAGE + row.encTimelineID,
          kind: ocsKind(title),
          ...ocsStanding(title, row.state, askedOn),
        });

        for (const group of row.childrens ?? []) {
          for (const child of group.items ?? []) {
            const childTitle = (child.title ?? '').replace(/\s+/g, ' ').trim();
            if (!child.encTimelineID) {
              ctx.setAside({ subject: childTitle, reason: 'no-document-link', detail: `made under ${title}, listed without a document id` });
              continue;
            }
            if (found.has(child.encTimelineID)) continue;
            found.set(child.encTimelineID, {
              title: childTitle,
              url: DOC_PAGE + child.encTimelineID,
              kind: ocsKind(childTitle),
              madeUnder: title,
              ...ocsStanding(childTitle, child.state, askedOn),
            });
          }
        }
      }
      ctx.log(`    page ${page}: ${principal} principal law(s), ${found.size} instrument(s) so far`);
      if (expected !== null && principal >= expected) break;
    }

    if (expected !== null && principal < expected) {
      ctx.log(`    WARNING: the listing counts ${expected} principal laws and ${principal} were read`);
    }
    return [...found.values()];
  },

  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const timelineId = timelineIdOf(url);
    if (!timelineId) throw new Error(`Council of State law URL has no document id: ${url}`);
    const res = await fetcher.fetch(DOC_API, { post: docRequest(timelineId) });
    if (res.status !== 200) return res;

    let payload: { respHeader?: { errorCode?: string; errorDesc?: string }; respBody?: OcsDoc };
    try {
      payload = JSON.parse(res.body.toString('utf8')) as typeof payload;
    } catch {
      throw new Error('the Council of State document service did not answer with JSON');
    }
    if (payload.respHeader?.errorCode !== 'SUCCESS' || !payload.respBody) {
      throw new Error(`the Council of State document service answered ${payload.respHeader?.errorCode ?? 'nothing'}: ${payload.respHeader?.errorDesc ?? ''}`);
    }

    const body = Buffer.from(JSON.stringify({ sourceUrl: url, doc: payload.respBody } satisfies OcsResolved), 'utf8');
    return {
      url,
      finalUrl: url,
      status: 200,
      mediaType: OCS_MEDIA_TYPE,
      body,
      contentHash: cacheComposed(body),
      fromCache: res.fromCache,
      fetchedAt: res.fetchedAt,
    };
  },
};
