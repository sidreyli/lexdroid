/**
 * The National Laws and Regulations Database, flk.npc.gov.cn.
 *
 * A detail page (`https://flk.npc.gov.cn/detail?id=<id>`) is a JS-rendered shell: a plain GET
 * returns no statute text at all, only the page a browser's own script then fills in. The route to
 * the document was reverse-engineered from the portal's own bundled JS -- read, not guessed -- and
 * is three calls:
 *
 *   1. GET /law-search/search/flfgDetails?bbbs=<id>
 *      the instrument's metadata: title, issuing body, promulgation and effective dates, in-force
 *      status, version history, and the object paths of its Word/PDF/OFD copies. The query
 *      parameter is named `bbbs` in the portal's own code, not `id`.
 *   2. GET /law-search/download/pc?format=docx&bbbs=<id>&fileId=
 *      a presigned, roughly one-hour object-store URL for that format. Its `urlIn` sibling is an
 *      RFC 1918 address inside the portal's own network and is never usable from outside.
 *   3. GET that presigned URL
 *      the actual .docx bytes.
 *
 * Re-verified live 2026-09-09 against the Personal Information Protection Law
 * (id=ff8081817b6472a3017b656cc2040044) and the Cybersecurity Law
 * (id=021e7d7684474107b8f3febbb1c4f8b5).
 *
 * The FetchResult keeps the stable detail page as its url, never the presigned object URL. Two
 * reasons, and both matter: the signed URL expires within the hour, so a citation pointing at it is
 * dead by the time anyone checks it; and parseDocument dispatches on host, so a document filed
 * under flkoss.obs-bj2.cucloud.cn would miss the Chinese parser entirely.
 *
 * ENUMERATION IS AN OPEN GAP, and is recorded rather than papered over. The portal's own listing
 * endpoint (/law-search/search/list) is a POST behind what looks like anti-bot protection -- there
 * is a captchaImage endpoint bundled beside it, and a plain GET hangs rather than answering. So
 * this adapter registers the instruments its profile names and says plainly, in the run log, that
 * it has not walked the portal. An economy whose register is a seed list is not a discovered
 * economy, and the log is where that has to be visible.
 *
 * THIS ADAPTER DOES NOT CURRENTLY FETCH ANYTHING, AND THAT IS CORRECT. Read 2026-09-09,
 * flk.npc.gov.cn/robots.txt is:
 *
 *     #禁止使用任何自动化工具、脚本、爬虫程序采集或复制网站数据
 *     User-agent: *
 *     Disallow: /
 *
 * -- a blanket disallow for every agent, under a comment reading "the use of any automated tool,
 * script or crawler to collect or copy this site's data is prohibited". The Fetcher honours it, so
 * every request here is refused before it is made and a China run registers nothing. That is the
 * system working, not failing.
 *
 * This is left in place, and left refusing, on purpose. The code is verified against real documents
 * and is ready if the access question is ever answered -- by permission from the NPC, by an
 * alternative portal that permits collection, or by feeding documents obtained another way through
 * the parser, which needs no network at all. What must not happen is a robots exemption for this
 * host: the predecessor of this system fetched these same documents freely because it never read a
 * robots.txt in its life, and rediscovering that as a feature would be a step backwards.
 */
import { createHash } from 'node:crypto';
import type { Fetcher, FetchResult } from '../fetch/index.js';
import { DOCX_MEDIA_TYPE } from '../parse/docx.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

const API = 'https://flk.npc.gov.cn/law-search';
export const DETAIL_BASE = 'https://flk.npc.gov.cn/detail?id=';

/**
 * The portal's own filter labels, from its bundled JS:
 * `[{label:"尚未生效",key:4},{label:"有效",key:3},{label:"已修改",key:2},{label:"已废止",key:1}]`.
 */
const STATUS_LABEL: Record<number, string> = {
  1: '已废止 (repealed)',
  2: '已修改 (in force as amended)',
  3: '有效 (in force)',
  4: '尚未生效 (not yet effective)',
};

/**
 * The portal's status, as our verifier understands standing.
 *
 * 已修改 maps to in-force and emphatically NOT to 'amending'. They are opposites: 已修改 marks the
 * principal law, currently in force, served in its amended form -- which is exactly what should be
 * cited -- whereas our 'amending' marks an amending instrument cited in place of the principal act,
 * which ESCAP scores zero and the verifier excludes. Reading one as the other would throw away
 * every amended Chinese law in the corpus, the Cybersecurity Law among them.
 *
 * 尚未生效 maps to 'draft'. It is not a draft -- it is enacted but not yet commenced -- and the
 * honest label is preserved in statusBasis. 'draft' is chosen because it is the only value that
 * makes the verifier exclude a law that is not yet operative, which is the outcome that matters.
 */
const STATUS: Record<number, DiscoveredInstrument['status']> = {
  1: 'repealed',
  2: 'in-force',
  3: 'in-force',
  4: 'draft',
};

/** 法律性质 -- where the instrument sits in the hierarchy of Chinese law. */
const KIND: Record<string, DiscoveredInstrument['kind']> = {
  法律: 'act',
  行政法规: 'regulation',
  地方性法规: 'regulation',
  部门规章: 'rule',
  司法解释: 'guideline',
};

export class FlkError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'FlkError';
  }
}

interface VersionRow {
  bbbs?: string;
  gbrq?: string;
  highLight?: boolean;
}

interface Details {
  title?: string;
  /** 法律性质 -- instrument type. */
  flxz?: string;
  /** 时效性 -- the standing key above. */
  sxx?: number;
  /** 公布日期 -- when this version was promulgated. */
  gbrq?: string;
  /** 施行日期 -- when it takes or took effect. */
  sxrq?: string;
  /** 制定机关 -- the issuing body. */
  zdjgName?: string;
  /** 历史沿革 -- every published version, newest first. Null when there has only ever been one. */
  lsyg?: VersionRow[] | null;
}

/** The `id` of a detail-page URL, which is the API's own `bbbs`. */
export function detailId(url: string): string {
  const id = new URL(url).searchParams.get('id');
  if (!id) throw new FlkError(`not a flk.npc.gov.cn detail-page URL (no "id" parameter): ${url}`);
  return id;
}

async function getJson(fetcher: Fetcher, url: string): Promise<Record<string, unknown>> {
  const res = await fetcher.fetch(url);
  if (res.status !== 200) throw new FlkError(`flk.npc.gov.cn answered HTTP ${res.status} for ${url}`);
  let payload: unknown;
  try {
    payload = JSON.parse(res.body.toString('utf8'));
  } catch {
    throw new FlkError(`flk.npc.gov.cn returned non-JSON for ${url}`);
  }
  const body = payload as { code?: number; msg?: string; data?: unknown };
  if (body.code !== 200) throw new FlkError(`flk.npc.gov.cn API error for ${url}: ${body.msg ?? body.code}`);
  if (!body.data || typeof body.data !== 'object') {
    throw new FlkError(`flk.npc.gov.cn returned no data payload for ${url}`);
  }
  return body.data as Record<string, unknown>;
}

/**
 * What the portal asserts about one instrument, turned into a register entry.
 *
 * The timeframe sentence is assembled from the portal's own fields rather than summarised, because
 * "no evidence that the Act was last amended in 2023, please double check" is a comment ESCAP's
 * reviewers actually wrote, and the answer to it is to quote the source of the date.
 */
function toInstrument(id: string, d: Details, readOn: string): DiscoveredInstrument {
  const url = `${DETAIL_BASE}${id}`;
  const title = d.title?.trim();
  if (!title) throw new FlkError(`flk.npc.gov.cn detail metadata carries no title for id ${id}`);

  const label = d.sxx === undefined ? 'not stated' : STATUS_LABEL[d.sxx] ?? `unmapped status key ${d.sxx}`;
  const issuer = d.zdjgName ? ` by ${d.zdjgName}` : '';
  const effective = d.sxrq ? `, effective ${d.sxrq}` : '';

  // More than one version listed means the text served really is an amended consolidation, and its
  // promulgation date really is the date of the last amendment. One version means the date is the
  // original promulgation and must not be reported as an amendment.
  const versions = Array.isArray(d.lsyg) ? d.lsyg : [];
  const superseded = versions.filter((v) => v.gbrq && v.gbrq !== d.gbrq).map((v) => v.gbrq);
  const currentToBasis = d.gbrq
    ? superseded.length > 0
      ? `Promulgated${issuer} on ${d.gbrq}${effective}. The portal's own version history lists ${superseded.length} earlier version(s) (${superseded.join(', ')}), so ${d.gbrq} is the date of the latest amendment and the text served is current to it.`
      : `Promulgated${issuer} on ${d.gbrq}${effective}. The portal's version history lists no other version, so this is the original text and ${d.gbrq} is not an amendment date.`
    : undefined;

  // An unmapped status key leaves status unset rather than guessed: the register then shows the
  // instrument as of unknown standing, which is true, instead of asserting one we cannot support.
  const status = d.sxx === undefined ? undefined : STATUS[d.sxx];

  return {
    title,
    url,
    kind: (d.flxz && KIND[d.flxz]) || 'regulation',
    ...(status ? { status } : {}),
    statusBasis: `flk.npc.gov.cn records this instrument as ${label}${issuer ? `, issued${issuer}` : ''} (read on ${readOn})`,
    currentTo: d.gbrq ?? null,
    ...(currentToBasis ? { currentToBasis } : {}),
  };
}

export const flkAdapter: Adapter = {
  name: 'flk',

  async discover(ctx) {
    const raw = ctx.portal.adapterConfig['seeds'];
    const seeds = Array.isArray(raw) ? raw : [];
    const readOn = new Date().toISOString().slice(0, 10);

    ctx.log(
      '  NOTE: this portal is not walked. Its listing endpoint (/law-search/search/list) is a POST ' +
        'behind anti-bot protection, so the register below is the seed list in the profile and is ' +
        'NOT a discovered enumeration of Chinese national law.',
    );

    const found: DiscoveredInstrument[] = [];
    for (const seed of seeds) {
      const id = typeof seed === 'string' ? seed : (seed as { id?: string }).id;
      if (!id) {
        ctx.log('    a seed entry names no id and was skipped');
        continue;
      }
      try {
        const details = (await getJson(ctx.fetcher, `${API}/search/flfgDetails?bbbs=${encodeURIComponent(id)}`)) as Details;
        const item = toInstrument(id, details, readOn);
        found.push(item);
        ctx.log(`    ${item.title} -- ${STATUS_LABEL[details.sxx ?? -1] ?? 'status not stated'}`);
        if (details.flxz && !KIND[details.flxz]) {
          ctx.log(`      WARNING: unmapped 法律性质 "${details.flxz}", recorded as a regulation`);
        }
      } catch (err) {
        // One unreachable seed must not lose the rest, and it must not vanish either.
        ctx.log(`    ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return found;
  },

  /**
   * The three-call route to the Word file.
   *
   * Every request goes through the Fetcher, so the rate limit, robots.txt and the content-addressed
   * cache all apply. That also makes the second pass free: both API URLs are deterministic, so a
   * cached `download/pc` response replays the same object URL it returned the first time, and that
   * URL is itself in the cache. Nothing here reaches the network twice for the same document.
   */
  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const id = detailId(url);
    const download = await getJson(fetcher, `${API}/download/pc?format=docx&bbbs=${encodeURIComponent(id)}&fileId=`);
    const objectUrl = download['url'];
    if (typeof objectUrl !== 'string' || !objectUrl) {
      throw new FlkError(`flk.npc.gov.cn returned no object URL for id ${id}`);
    }

    const res = await fetcher.fetch(objectUrl);
    if (res.status !== 200) {
      throw new FlkError(`the resolved object URL for id ${id} answered HTTP ${res.status}`);
    }
    // A .docx is a zip, so it begins "PK". Trusting the bytes over the presigned URL's claimed
    // content type is the same rule the PDF path applies to "%PDF": an expired signature answers
    // with an XML error document and a 200, and that must not be stored as a statute.
    if (res.body.length < 2 || res.body[0] !== 0x50 || res.body[1] !== 0x4b) {
      throw new FlkError(
        `expected a .docx at the resolved object URL for id ${id}, got ${res.body.length} bytes ` +
          `starting ${JSON.stringify(res.body.subarray(0, 60).toString('latin1'))}`,
      );
    }

    return {
      url,
      finalUrl: url,
      status: 200,
      mediaType: DOCX_MEDIA_TYPE,
      body: res.body,
      contentHash: createHash('sha256').update(res.body).digest('hex'),
      fromCache: res.fromCache,
      fetchedAt: res.fetchedAt,
    };
  },
};
