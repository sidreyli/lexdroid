/**
 * Discovery on the Eurasian Economic Union's legal portal (docs.eaeunion.org).
 *
 * Russia's customs, trade-defence and technical-regulation law is largely not Russian law: the
 * Treaty on the Union, the Union's Customs Code and the decisions of the Eurasian Economic
 * Commission apply in Russia directly, and no Russian federal portal publishes them. The Union
 * publishes them here. Measured 28 September 2026:
 *
 * - A listing is `/documents/?filter_sphere[0]=<sphere>&set_filter=Y&PAGEN_1=<n>`, a hundred rows a
 *   page, newest first, "Результаты: найдено <b>792</b>" above them. The spheres are the portal's
 *   own subject classification: 110 Торговля (792), 111 Техническое регулирование (458),
 *   112 Таможенное сотрудничество (782). `filter_section[0]=164` lists the international treaties
 *   (291). robots.txt is empty.
 * - Each row, `div.DocSearchResult_Item`, states where it sits ("Акты Евразийской экономической
 *   комиссии – Коллегия ... – Решения – 2026"), its short name ("Решение Коллегии ЕЭК № 124"), its
 *   full title, and its dates of adoption, publication and entry into force. Nothing states repeal.
 * - A document's page, `/documents/<section>/<id>/`, offers the signed original as a scanned PDF
 *   (a copier's scan: no fonts, no text layer) and the same text as a Word file. The Word file is
 *   read, so the text is the Commission's own rather than an OCR reading of a photocopy.
 *
 * The listings also carry the Commission's notices, which announce acts rather than make them, and
 * the Union Court's judgments; both are set aside, as are the Commission's распоряжения, which are
 * its internal orders (appointments, working groups, drafts sent for consultation).
 */
import * as cheerio from 'cheerio';
import JSZip from 'jszip';
import { cacheComposed, type FetchResult, type Fetcher } from '../fetch/index.js';
import { decodeBody } from '../fetch/decode.js';
import { onlyAmends } from './ips.js';
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';

export interface EaeuRow {
  /** Where the portal files it: "Акты Евразийской экономической комиссии – ... – Решения – 2026". */
  section: string;
  /** "Решение Коллегии ЕЭК № 124". */
  name: string;
  /** "О временном неприменении антидемпинговой меры ...". */
  title: string;
  url: string;
  adopted: string | null;
  inForceFrom: string | null;
}

/** `21.09.2026` as ISO, or null. */
function isoDate(raw: string | undefined): string | null {
  const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(raw ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** The rows one listing page carries, and the total it states. */
export function eaeuRows(html: string, base: string): { rows: EaeuRow[]; stated: number | null } {
  const $ = cheerio.load(html);
  const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();
  const stated = Number($('.SearchResult_Heading__Counter b').first().text().replace(/\D/g, '')) || null;
  const rows = $('.DocSearchResult_Item')
    .toArray()
    .map((el) => {
      const item = $(el);
      const link = item.find('a.DocSearchResult_Item__Link').first();
      const dates = clean(item.find('.DocSearchResult_Item__Dates').text());
      return {
        section: clean(item.find('.DocSearchResult_Item__Date').text()),
        name: clean(link.text()),
        title: clean(item.find('.DocSearchResult_Item__Text').text()),
        url: link.attr('href') ? new URL(link.attr('href')!, base).toString() : '',
        adopted: isoDate(/Дата принятия документа:\s*([\d.]+)/u.exec(dates)?.[1]),
        inForceFrom: isoDate(/Дата вступления в силу:\s*([\d.]+)/u.exec(dates)?.[1]),
      };
    })
    .filter((r) => r.url && r.name);
  return { rows, stated };
}

type Kind = DiscoveredInstrument['kind'];

/**
 * What the row is, from its own short name, and the reason when it is not an act of the Union.
 * The name is the portal's: "Решение Совета ЕЭК № 12", "Договор о Евразийском экономическом союзе".
 */
export function kindOfRow(row: Pick<EaeuRow, 'section' | 'name'>): { kind: Kind } | { setAside: string } {
  if (/^Официальные сообщения/u.test(row.section) || /^Уведомлени/u.test(row.name)) return { setAside: 'notice-of-an-act' };
  if (/Суд/u.test(row.section.split('–')[0] ?? '')) return { setAside: 'court-judgment' };
  if (/^Распоряжени/u.test(row.name)) return { setAside: 'internal-order' };
  if (/^(?:Договор|Соглашение|Протокол|Таможенный кодекс|Кодекс)/u.test(row.name) || /^Международные договоры/u.test(row.section)) {
    return { kind: 'act' };
  }
  if (/^Решени/u.test(row.name)) return { kind: 'regulation' };
  if (/^Рекомендаци/u.test(row.name)) return { kind: 'guideline' };
  return { setAside: 'unknown-instrument-type' };
}

/** A listing's address. `sphere:110` or `section:164`, as the profile names them. */
function listingUrl(base: string, filter: string, page: number): string {
  const [by, id] = filter.split(':');
  const param = by === 'section' ? 'filter_section' : 'filter_sphere';
  return `${base}/documents/?${param}%5B0%5D=${id}&set_filter=Y&PAGEN_1=${page}`;
}

const PER_PAGE = 100;
const MAX_PAGES = 40;

// ---------------------------------------------------------------------------------------------
// The Word file, as HTML the Russian act parser reads (parse/ips.ts, its unclassed form).
// ---------------------------------------------------------------------------------------------

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unxml(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : XML_ENTITIES[e]!,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * `word/document.xml` as one `<p>` per Word paragraph, in document order -- a table's cells
 * included, since the lists the Commission approves are tables. A superscript run is kept as
 * `<sup>`, which the parser turns into the superscript an inserted point is numbered by.
 */
export function wordToHtml(documentXml: string): string {
  const paragraphs: string[] = [];
  for (const p of documentXml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    let text = '';
    for (const r of p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? []) {
      const run = (r.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? [])
        .map((t) => (t.startsWith('<w:t') && !t.startsWith('<w:tab') ? unxml(t.replace(/<[^>]+>/g, '')) : ' '))
        .join('');
      if (!run) continue;
      text += /<w:vertAlign w:val="superscript"\/>/.test(r) ? `<sup>${escapeHtml(run)}</sup>` : escapeHtml(run);
    }
    if (text.trim()) paragraphs.push(`<p>${text}</p>`);
  }
  return `<html><head><meta charset="utf-8"></head><body>\n${paragraphs.join('\n')}\n</body></html>`;
}

/** The Russian Word file a document page offers, or null. */
export function wordFileOf(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const href = $('a[href]')
    .toArray()
    .map((a) => $(a).attr('href')!)
    .find((h) => /\.docx(?:$|\?)/i.test(h));
  return href ? new URL(href, pageUrl).toString() : null;
}

export const eaeuAdapter: Adapter = {
  name: 'eaeu',

  /** The Word file the page offers, as HTML; the page itself where it offers none. */
  async resolveDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
    const page = await fetcher.fetch(url);
    if (page.status !== 200) return page;
    const word = wordFileOf(decodeBody(page), page.finalUrl || url);
    if (!word) return page;
    const file = await fetcher.fetch(word);
    if (file.status !== 200) return page;
    const xml = await (await JSZip.loadAsync(file.body)).file('word/document.xml')?.async('string');
    if (!xml) return page;
    const body = Buffer.from(wordToHtml(xml), 'utf8');
    return { ...file, body, charset: 'utf-8', mediaType: 'text/html', contentHash: cacheComposed(body) };
  },

  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log, setAside } = ctx;
    const base = new URL(portal.url).origin;
    const config = portal.adapterConfig as { listings?: string[]; maxPages?: number };
    const listings = config.listings ?? [];
    if (listings.length === 0) {
      setAside({ subject: portal.url, reason: 'no-listings-configured', detail: 'the profile names no sphere or section to walk' });
      return [];
    }

    const found = new Map<string, DiscoveredInstrument>();
    for (const filter of listings) {
      let listed = 0;
      let stated: number | null = null;
      for (let page = 1; page <= (config.maxPages ?? MAX_PAGES); page += 1) {
        let got: ReturnType<typeof eaeuRows>;
        try {
          got = eaeuRows(decodeBody(await fetcher.fetch(listingUrl(base, filter, page))), base);
        } catch (err) {
          setAside({ subject: `${filter} page ${page}`, reason: 'listing-page-failed', detail: err instanceof Error ? err.message : String(err) });
          break;
        }
        stated ??= got.stated;
        listed += got.rows.length;

        for (const row of got.rows) {
          const what = kindOfRow(row);
          if ('setAside' in what) {
            setAside({ subject: `${row.name} ${row.title}`.slice(0, 300), reason: what.setAside, detail: row.section });
            continue;
          }
          // An act that only changes another is read through the act it changes, as on IPS.
          if (onlyAmends(row.title)) {
            setAside({ subject: `${row.name} ${row.title}`.slice(0, 300), reason: 'amending-act', detail: row.url });
            continue;
          }
          if (found.has(row.url)) continue;
          found.set(row.url, {
            title: `${row.name} «${row.title}»`,
            url: row.url,
            kind: what.kind,
            kindBasis: `the Eurasian Economic Union's legal portal names it "${row.name}" and files it under "${row.section}"`,
            officialNumber: /№\s*(\S+)/u.exec(row.name)?.[1] ?? null,
            // As on the Lao gazette: the portal publishes the Union's acts and states no repeal.
            status: 'in-force',
            statusBasis:
              'Published on the Eurasian Economic Union legal portal, which records no repeal, so standing is ' +
              'inferred from publication rather than stated. Union law applies in the Russian Federation directly.',
            commencedOn: row.inForceFrom ?? row.adopted,
          });
        }
        if (got.rows.length < PER_PAGE) break;
      }
      log(`  EAEU ${filter}: ${listed} rows listed of ${stated ?? '?'} stated`);
      if (stated !== null && listed < stated) {
        setAside({ subject: `${portal.name} ${filter}`, reason: 'fewer-than-the-portal-states', detail: `listed ${listed}, the portal states ${stated}` });
      }
    }
    log(`  Eurasian Economic Union: ${found.size} registered`);
    return [...found.values()];
  },
};
