/**
 * Discovery on a portal that runs WordPress and says so.
 *
 * Malaysia's data protection commissioner publishes the sectoral Codes of Practice -- banking,
 * communications, insurance, aviation, water, private hospitals -- and nothing else publishes
 * them. ESCAP cites four of the six, and none were in our corpus: the pages that carry them are
 * built client-side, so a crawler that follows links off the front page finds announcements and
 * no documents at all.
 *
 * The site is WordPress, which advertises a read-only API in its own homepage head. That is a
 * fact about the portal's shape rather than about this ministry, so this adapter is written to
 * the shape and works on any portal that advertises the same link -- the register is never a
 * list of documents somebody typed in.
 */
import { instrumentTitle } from './titles.js';
import type { Adapter, DiscoveredInstrument } from './types.js';

/** WordPress advertises its API root in the page head. No link, no adapter. */
const API_ROOT = /<link[^>]+rel=["']https:\/\/api\.w\.org\/["'][^>]+href=["']([^"']+)["']/i;
const PER_PAGE = 100;
/** Enough for a ministry's whole media library; a portal larger than this needs a real crawl. */
const MAX_PAGES = 20;

interface MediaItem {
  source_url?: string;
  mime_type?: string;
  title?: { rendered?: string };
  /** The permalink of the page that publishes the file, with the file's own slug on the end. */
  link?: string;
  /** The page that publishes it, or null when the library holds it and nothing links to it. */
  post?: number | null;
  date?: string;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&quot;': '"', '&#039;': "'", '&#8211;': '-', '&#8212;': '-',
  '&#8216;': "'", '&#8217;': "'", '&#8220;': '"', '&#8221;': '"', '&nbsp;': ' ',
};

function decode(s: string): string {
  return s.replace(/&[#a-z0-9]+;/gi, (e) => ENTITIES[e] ?? e).replace(/\s+/g, ' ').trim();
}

/** "COP_KOD-TATA-AMALAN-...-SEKTOR-UTILITI-AIR.pdf" when the upload carried no title of its own. */
function titleFromUrl(url: string): string {
  const file = decodeURIComponent(url.split('/').pop() ?? url).replace(/\.pdf$/i, '');
  return file.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * The page that publishes an upload. WordPress gives an attachment its parent's permalink with
 * the file's own slug on the end, so the page is that permalink with the last segment dropped.
 */
function publishedOn(link: string, base: string): string | null {
  let path: string[];
  try {
    path = new URL(link, base).pathname.replace(/^\/+|\/+$/g, '').split('/');
  } catch {
    return null;
  }
  path.pop();
  if (path.length === 0) return null;
  return `/${path.join('/')}/`;
}

/** The page's own slug is what the regulator named the document, which is what a citation uses. */
function titleFromPage(page: string): string {
  const slug = page.replace(/^\/+|\/+$/g, '').split('/').pop() ?? '';
  const words = decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ');
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

const CODE = /code of practice|kod (tata ?)?amalan|tataamalan|tata amalan/i;
const GUIDE = /guideline|garis panduan|standard|circular|pekeliling/i;

/**
 * What kind of instrument this is, by what the portal calls it.
 *
 * A Code of Practice under section 23 of Malaysia's Act binds the sector it is made for, so it is
 * filed as a rule rather than as guidance. Everything else this library holds is guidance until
 * something says otherwise, which is the weaker claim and the right default.
 */
function kindOf(title: string, url: string): DiscoveredInstrument['kind'] {
  // Separators are the filename's spaces: "Code_of_Practice_For_Aviation_Sector".
  const both = `${title} ${decodeURIComponent(url)}`.replace(/[-_./]+/g, ' ');
  if (CODE.test(both)) return 'rule';
  if (GUIDE.test(both)) return 'guideline';
  return 'guideline';
}

async function apiRoot(ctx: Parameters<Adapter['discover']>[0]): Promise<string> {
  const configured = ctx.portal.adapterConfig['api'] as string | undefined;
  if (configured) return configured.endsWith('/') ? configured : `${configured}/`;

  const res = await ctx.fetcher.fetch(ctx.portal.url);
  if (res.status !== 200) throw new Error(`the portal answered HTTP ${res.status}`);
  const found = API_ROOT.exec(res.body.toString('utf8'));
  if (!found?.[1]) throw new Error('the portal does not advertise a WordPress API in its head');
  return found[1].endsWith('/') ? found[1] : `${found[1]}/`;
}

export const wpAdapter: Adapter = {
  name: 'wp',

  async discover(ctx) {
    const root = await apiRoot(ctx);
    ctx.log(`  WordPress API at ${root}`);

    // One instrument per publishing page, not one per file: a code of practice published in
    // Malay and in English is one instrument with two documents, and so one row.
    const pages = new Map<string, { files: string[]; names: string[] }>();
    const seen = new Set<string>();
    /** Uploads no page publishes, whose own title names an instrument. */
    const unpublished: DiscoveredInstrument[] = [];
    let orphans = 0;
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const url = `${root}wp/v2/media?per_page=${PER_PAGE}&media_type=application&page=${page}`;
      const res = await ctx.fetcher.fetch(url);
      // A page past the end answers 400, which is the end of the library and not a failure.
      if (res.status === 400) break;
      if (res.status !== 200) throw new Error(`the media listing answered HTTP ${res.status}`);

      let items: MediaItem[];
      try {
        items = JSON.parse(res.body.toString('utf8')) as MediaItem[];
      } catch {
        throw new Error('the media listing did not answer with JSON');
      }
      // A short page is not the last one: the media-type filter is applied after the page is cut,
      // so page 1 of 3 came back with 85 of its 100 rows and stopping there lost every code.
      if (!Array.isArray(items) || items.length === 0) break;

      for (const item of items) {
        const src = item.source_url;
        if (!src || item.mime_type !== 'application/pdf') continue;
        if (seen.has(src)) continue;
        seen.add(src);
        // An upload no page publishes is usually a file the library happens to hold. Registering
        // those turned a ministry's media library into 180 instruments, most of them tender
        // notices -- but at the Bureau of Indian Standards the library *is* the publication, and
        // the rule dropped 1,843 files including every Quality Control Order. So the orphan is
        // kept when its own title names an instrument, which is the same test a regulator's
        // sitemap and crawl are already judged by, and which still refuses the tender notices.
        const publisher = item.post ? publishedOn(item.link ?? '', ctx.portal.url) : null;
        if (!publisher) {
          orphans += 1;
          const named = instrumentTitle(decode(item.title?.rendered ?? '') || titleFromUrl(src), [], ctx.vocabulary);
          if (named) unpublished.push({ title: named.title, url: src, kind: named.kind });
          continue;
        }
        const group = pages.get(publisher) ?? { files: [], names: [] };
        group.files.push(src);
        group.names.push(decode(item.title?.rendered ?? '') || titleFromUrl(src));
        pages.set(publisher, group);
      }
    }

    const found: DiscoveredInstrument[] = [];
    for (const [page, group] of pages) {
      // The page names the instrument; its files are that instrument's editions and revisions.
      const title = titleFromPage(page) || group.names[0] || page;
      const [first, ...rest] = group.files;
      if (!first) continue;
      const entry: DiscoveredInstrument = {
        title, url: first, kind: kindOf(`${title} ${group.names.join(' ')}`, first),
      };
      if (rest.length > 0) entry.alsoAt = rest;
      found.push(entry);
    }

    // After the pages, so a file a page publishes wins the title its publisher gave it.
    const already = new Set(found.flatMap((f) => [f.url, ...(f.alsoAt ?? [])]));
    const loose = unpublished.filter((f) => !already.has(f.url));
    found.push(...loose);

    const codes = found.filter((f) => f.kind === 'rule').length;
    ctx.log(
      `  ${found.length} document(s) published across the portal, ${codes} of them codes of practice; ` +
        `${orphans} upload(s) no page publishes, ${loose.length} of those named as instruments`,
    );
    return found;
  },
};
