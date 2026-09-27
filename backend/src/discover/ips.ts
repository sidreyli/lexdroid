/**
 * Discovery on Russia's official legal information system (pravo.gov.ru/proxy/ips).
 *
 * The gazette register (publication.pravo.gov.ru) lists what was published this month and serves
 * each document as a viewer shell over a PDF under a path robots.txt disallows; walked at 60, 400
 * and sitemap-seeded budgets it never exceeded 96 federal instruments. IPS, on the same domain with
 * nothing disallowed, is the consolidated system itself: every federal act, its current text, and
 * the standing the system gives it.
 *
 * Its search is a plain GET, measured 26 September 2026:
 *
 *   ?list_itself=&bpas=cd00000&a3=<act type>&a3type=1&a1=<title words>&sort=7&page=first&start=N
 *
 * answers 20 rows a page, each a `table.list_elem` carrying the standing ("Действует без
 * изменений", "Действует с изменениями", "Утратил силу"), the document id `nd`, the type, date and
 * number ("Постановление Правительства Российской Федерации от 31.08.2026 № 1119") and the title.
 * `a3` takes a code from the system's own classifier of act types, read from its autocomplete
 * endpoint (`?autocomplete&bpa=cd00000&nclassif=3`):
 *
 *   102000505 Федеральный закон        102000506 Федеральный конституционный закон
 *   102000486 Кодекс                   102000503 Указ
 *   102000496 Постановление            102000497 Приказ
 *
 * Titles are searched in windows-1251, which is the encoding the system reads its queries in.
 *
 * All federal laws is 12,155 rows, most of them amending laws, so a profile names what to walk: a
 * type, optionally the words its title must contain, and for types many bodies issue (a
 * "Постановление" can be the Government's or a court's) the issuer the row must name. The kind
 * comes from the query, which is evidence from the register rather than a guess from the title.
 */
import * as cheerio from 'cheerio';
import { decodeBody } from '../fetch/decode.js';
import { cacheComposed, type Fetcher, type FetchResult } from '../fetch/index.js';
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';
import type { InstrumentKind } from './titles.js';

const PER_PAGE = 20;

export interface IpsQuery {
  /**
   * The act-type code from the system's classifier, or absent for every type. A law of the RSFSR or
   * of the Russian Federation before the 1993 Constitution is a "Закон РСФСР" or a "Закон Российской
   * Федерации", which is none of the classifier codes above, so the only way to reach one is to search
   * every type and keep the rows whose type line names it -- `issuer` does that.
   */
  type?: string;
  kind: InstrumentKind;
  /** Words the title must contain, as the system's title search reads them. */
  title?: string;
  /** Text the row's type line must contain: "Правительства Российской Федерации". */
  issuer?: string;
  /** Pages to walk at most; 20 rows each. */
  maxPages?: number;
  /**
   * The system's sort code. 7, the default, is newest first; -7 is oldest first, which puts a
   * principal law ahead of the years of amendments to it that share its title words.
   */
  sort?: string;
  /**
   * Leave out a law that only amends, repeals or suspends others. The system serves every act as its
   * consolidated current text, so what an amending law changed is already read in the act it
   * changed; registered on its own it is a second copy of words the principal act carries, and it
   * takes a place in the shortlist a principal act needed. Opt-in per query, so the queries a corpus
   * was already built from register exactly what they did.
   */
  principalOnly?: boolean;
}

/** A title that says the act only amends, repeals or suspends other acts. */
export function onlyAmends(name: string): boolean {
  return /^о\s+(внесени[ия]\s+(изменени|дополнени)|признании\s+утратившими?\s+силу|приостановлении\s+действия)/iu.test(name.trim());
}

/** A query string value in windows-1251, which is how the system reads Cyrillic in a query. */
export function cp1251Param(text: string): string {
  let out = '';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (/[A-Za-z0-9*._-]/.test(ch)) out += ch;
    else if (c === 0x20) out += '+';
    else {
      const b = c < 0x80 ? c : c >= 0x410 && c <= 0x44f ? c - 0x410 + 0xc0 : ch === 'Ё' ? 0xa8 : ch === 'ё' ? 0xb8 : null;
      if (b === null) throw new Error(`cannot write "${ch}" in windows-1251`);
      out += `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

/** `31.08.2026` as ISO, or null. */
function isoDate(ru: string): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(ru);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export interface IpsRow {
  nd: string;
  /** "Федеральный закон от 27.07.2006 № 152-ФЗ" */
  heading: string;
  /** "О персональных данных" */
  name: string;
  /** "Действует с изменениями" */
  standing: string;
}

/** The rows one page of results carries. */
export function ipsRows(html: string): IpsRow[] {
  const $ = cheerio.load(html);
  return $('table.list_elem')
    .toArray()
    .map((t) => {
      const el = $(t);
      const link = el.find('a[href*="nd="]').first();
      const nd = /nd=(\d+)/.exec(link.attr('href') ?? '')?.[1] ?? '';
      return {
        nd,
        heading: link.text().replace(/\s+/g, ' ').trim(),
        name: el.find('.l_link').parent().find('span.bold').first().text().replace(/\s+/g, ' ').trim(),
        standing: el.find('.tiny_italic_bold').first().text().replace(/\s+/g, ' ').trim(),
      };
    })
    .filter((r) => r.nd && r.heading);
}

/**
 * A decree or resolution that states policy rather than law: it approves a doctrine, a strategy, a
 * concept or the foundations of state policy, or proposes that a treaty be signed. Its act type is
 * a Presidential decree or a Government resolution, which the register rightly calls binding, but
 * what it binds is nobody: a doctrine sets direction, and a proposal to sign is a step toward a
 * treaty that is not yet law. Measured on Russia's 7.2, where the Doctrine of Information Security,
 * the Foundations of State Policy on international information security and a proposal to sign the
 * UN Convention against Cybercrime all cleared as the country's dedicated cybersecurity framework.
 */
const POLICY_TITLE =
  /(об утверждении (доктрин|стратеги|концепци|основ государственной политики)|о представлении [^"]*предложения о подписании)/iu;

/** The kind a row is registered as: advisory where its title shows it states policy, not law. */
export function kindFor(title: string, kind: InstrumentKind): { kind: InstrumentKind; kindBasis?: string } {
  if ((kind === 'order' || kind === 'regulation') && POLICY_TITLE.test(title)) {
    return {
      kind: 'guideline',
      kindBasis: 'the title approves a doctrine, strategy, concept or foundations of policy, or proposes signing a treaty: it states policy and imposes no duty',
    };
  }
  return { kind };
}

/** A row as an instrument of the register. */
export function instrumentFrom(row: IpsRow, kind: InstrumentKind, base: string): DiscoveredInstrument {
  const repealed = /утратил/iu.test(row.standing);
  const title = row.name ? `${row.heading} "${row.name}"` : row.heading;
  return {
    title,
    url: `${base}/proxy/ips/?doc_itself=&nd=${row.nd}&page=all`,
    ...kindFor(title, kind),
    officialNumber: /№\s*(\S+)/.exec(row.heading)?.[1] ?? null,
    status: repealed ? 'repealed' : 'in-force',
    statusBasis: `IPS (pravo.gov.ru) lists it as "${row.standing}"`,
    // The day it was signed; the system states it, and a later entry into force is in the text.
    commencedOn: isoDate(row.heading),
  };
}

/**
 * Whether the system cut the text off. A whole document is served as its own page -- ending
 * `</body></html>` -- inside the viewer's `</div></div></body></html>`. A long one is cut at a fixed
 * size and the inner page never closes: the Code of Administrative Offences stops at 747,740 bytes,
 * inside a link in article 5.67 of a Code that runs to article 32.14, and nothing says so.
 */
export function truncated(html: string): boolean {
  return !/<\/body>\s*<\/html>\s*<\/div>\s*<\/div>\s*<\/body>/i.test(html.slice(-4000));
}

/**
 * The HTML inside the system's "RTF" export, which is in fact an MHTML archive of the whole
 * document: one text/html part, quoted-printable, windows-1251, with the same paragraph classes as
 * the viewer. Null when the archive holds no HTML part.
 */
export function htmlFromMhtml(archive: Buffer): { html: Buffer; charset: string | null } | null {
  const s = archive.toString('latin1');
  const boundary = /boundary="?([^"\r\n;]+)"?/i.exec(s)?.[1];
  if (!boundary) return null;
  for (const part of s.split(`--${boundary}`)) {
    const split = part.search(/\r?\n\r?\n/);
    if (split < 0) continue;
    const head = part.slice(0, split);
    if (!/content-type:\s*text\/html/i.test(head)) continue;
    // The line break before a boundary belongs to the boundary, not to the part.
    let body = part.slice(split).replace(/^\r?\n\r?\n/, '').replace(/\r?\n$/, '');
    if (/quoted-printable/i.test(head)) {
      body = body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
      return { html: Buffer.from(body, 'latin1'), charset: /charset="?([^";\r\n]+)/i.exec(head)?.[1]?.toLowerCase() ?? null };
    }
    if (/base64/i.test(head)) return { html: Buffer.from(body.replace(/\s+/g, ''), 'base64'), charset: /charset="?([^";\r\n]+)/i.exec(head)?.[1]?.toLowerCase() ?? null };
    return { html: Buffer.from(body, 'latin1'), charset: /charset="?([^";\r\n]+)/i.exec(head)?.[1]?.toLowerCase() ?? null };
  }
  return null;
}

export const ipsAdapter: Adapter = {
  name: 'ips',

  /**
   * The document's full text. The viewer page where it is whole; the system's export where the
   * viewer cut it off, so a Code is read to its last article rather than to wherever 747 KB fell.
   */
  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const page = await fetcher.fetch(url);
    if (page.status !== 200 || !truncated(decodeBody(page))) return page;
    const nd = /nd=(\d+)/.exec(url)?.[1];
    if (!nd) return page;
    const exported = await fetcher.fetch(`${new URL(url).origin}/proxy/ips/?savertf=&nd=${nd}&page=all`);
    const part = htmlFromMhtml(exported.body);
    if (!part) return page;
    return {
      ...page,
      body: part.html,
      charset: part.charset ?? 'windows-1251',
      mediaType: 'text/html',
      contentHash: cacheComposed(part.html),
    };
  },

  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log, setAside } = ctx;
    const base = new URL(portal.url).origin;
    const queries = ((portal.adapterConfig as { queries?: IpsQuery[] }).queries ?? []);
    if (queries.length === 0) {
      setAside({ subject: portal.url, reason: 'no-queries-configured', detail: 'the profile names no IPS query to walk' });
      return [];
    }

    const found = new Map<string, DiscoveredInstrument>();
    for (const q of queries) {
      const params =
        `bpas=cd00000${q.type ? `&a3=${q.type}&a3type=1` : ''}` +
        `${q.title ? `&a1=${cp1251Param(q.title)}` : ''}&sort=${q.sort ?? '7'}`;
      let rows = 0;
      let kept = 0;
      for (let page = 0; page < (q.maxPages ?? 25); page += 1) {
        const url = `${base}/proxy/ips/?list_itself=&${params}&page=first${page ? `&start=${page * PER_PAGE}` : ''}`;
        let got: IpsRow[];
        try {
          got = ipsRows(decodeBody(await fetcher.fetch(url)));
        } catch (err) {
          setAside({ subject: `IPS ${params} page ${page + 1}`, reason: 'listing-page-failed', detail: err instanceof Error ? err.message : String(err) });
          break;
        }
        rows += got.length;
        // The system's title search is loose: "о связи" returns every law passed "в связи с"
        // something, 500 rows of amendments to unrelated Acts. The words have to be in the title.
        const words = q.title?.replace(/\*/g, '').toLowerCase();
        for (const row of got) {
          if (q.issuer && !row.heading.includes(q.issuer)) continue;
          if (words && !row.name.toLowerCase().includes(words)) continue;
          if (q.principalOnly && onlyAmends(row.name)) continue;
          const inst = instrumentFrom(row, q.kind, base);
          if (!found.has(inst.url)) {
            found.set(inst.url, inst);
            kept += 1;
          }
        }
        if (got.length < PER_PAGE) break;
      }
      log(`  IPS type ${q.type ?? 'any'}${q.title ? ` "${q.title}"` : ''}: ${rows} rows, ${kept} registered`);
    }
    return [...found.values()];
  },
};
