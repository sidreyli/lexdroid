/**
 * Discovery on the Lao Official Gazette (laoofficialgazette.gov.la).
 *
 * The gazette is the promulgation venue, and its home page is the whole register as a grid:
 * `index.php?r=site/index&Document_page=N`, ten rows a page, newest first, "ສະແດງ 1-10 ຂອງ 1479
 * ຜົນທີ່ໄດ້ຮັບ" -- showing 1-10 of 1,479 -- in its summary. Each row names the instrument, the body
 * responsible for it, the date it takes effect, the date it was gazetted, its type, and links to
 * the scan: a Lao PDF always, an English PDF sometimes (which the site calls an unofficial
 * translation). Measured 26 September 2026.
 *
 * The generic crawl could not walk it: every listing page is the same path, `/index.php`, and the
 * crawl decides what to follow from the path. And it would have had to guess each row's kind from
 * the title, where the gazette states it in a column of its own. So this reads the grid.
 *
 * The type column is mapped to the profile's tiers. The words are the gazette's own; Lao writes
 * the vowel ຳ either as one code point or as ໍ + າ, and the gazette uses the second, so both are
 * compared in one form.
 */
import * as cheerio from 'cheerio';
import { decodeBody } from '../fetch/decode.js';
import type { Adapter, DiscoveredInstrument, DiscoverContext } from './types.js';
import type { InstrumentKind } from './titles.js';

/** ໍ + າ is the same vowel as ຳ, and Unicode defines no decomposition between them. */
export function laoVowelAm(text: string): string {
  return text.replace(/ໍາ/g, 'ຳ');
}

/** The gazette's instrument types, by the words its type column uses. Longest first: ລັດຖະດຳລັດ before ດຳລັດ. */
const TYPES: [string, InstrumentKind][] = [
  ['ລັດຖະທຳມະນູນ', 'act'], // Constitution
  ['ປະມວນກົດໝາຍ', 'act'], // Code
  ['ກົດໝາຍ', 'act'], // Law
  ['ລັດຖະບັນຍັດ', 'order'], // Presidential ordinance
  ['ລັດຖະດຳລັດ', 'order'], // Presidential decree
  ['ມະຕິຕົກລົງ', 'order'], // Resolution
  ['ດຳລັດ', 'regulation'], // Decree of the Government
  ['ຄຳສັ່ງແນະນຳ', 'guideline'], // Instruction
  ['ຄຳແນະນຳ', 'guideline'], // Instruction
  ['ຄຳສັ່ງ', 'order'], // Order
  ['ລະບຽບການ', 'rule'], // Regulation
  ['ຂໍ້ຕົກລົງ', 'notice'], // Decision
  ['ແຈ້ງການ', 'notice'], // Notification
];

export function kindOfType(type: string): InstrumentKind | null {
  const t = laoVowelAm(type).replace(/\s+/g, '');
  return TYPES.find(([word]) => t.startsWith(word.replace(/\s+/g, '')))?.[1] ?? null;
}

/** A province or the capital: "ແຂວງ ອັດຕະປື", "ນະຄອນຫຼວງວຽງຈັນ". */
const PROVINCIAL = /^(?:ແຂວງ|ນະຄອນຫຼວງ|ນະຄອນຫລວງ)/u;

/** `28-08-2026` as ISO, or null. */
function isoDate(raw: string): string | null {
  const m = /(\d{2})-(\d{2})-(\d{4})/.exec(raw);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export interface GazetteRow {
  title: string;
  agency: string;
  effective: string | null;
  gazetted: string | null;
  type: string;
  lao: string | null;
  english: string | null;
}

/** The rows one page of the grid carries, and the total its summary states. */
export function gazetteRows(html: string, base: string): { rows: GazetteRow[]; stated: number | null } {
  const $ = cheerio.load(html);
  const grid = $('[id$="-grid"]').first();
  const stated = Number(/(\d[\d,]*)\s*ຜົນ/u.exec(grid.find('.summary').text())?.[1]?.replace(/,/g, '')) || null;
  const pdf = (td: cheerio.Cheerio<never>): string | null => {
    const href = td.find('a[href$=".pdf"], a[href*=".pdf"]').first().attr('href');
    return href ? new URL(href, base).toString() : null;
  };
  const rows = grid
    .find('tbody tr')
    .toArray()
    .map((tr) => {
      const td = $(tr).children('td');
      const cell = (i: number) => td.eq(i).text().replace(/\s+/g, ' ').trim();
      return {
        title: cell(0),
        agency: cell(1),
        effective: isoDate(cell(2)),
        gazetted: isoDate(cell(3)),
        type: cell(4),
        english: pdf(td.eq(6) as never),
        lao: pdf(td.eq(7) as never),
      };
    })
    .filter((r) => r.title);
  return { rows, stated };
}

const MAX_PAGES = 400;

export const laoGazetteAdapter: Adapter = {
  name: 'laogazette',

  async discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]> {
    const { portal, fetcher, log, setAside } = ctx;
    const base = new URL(portal.url).origin;
    const config = portal.adapterConfig as { maxPages?: number };
    const found = new Map<string, DiscoveredInstrument>();
    let listed = 0;
    let stated: number | null = null;

    for (let page = 1; page <= (config.maxPages ?? MAX_PAGES); page += 1) {
      let got: ReturnType<typeof gazetteRows>;
      try {
        got = gazetteRows(decodeBody(await fetcher.fetch(`${base}/index.php?r=site/index&Document_page=${page}`)), base);
      } catch (err) {
        setAside({ subject: `gazette page ${page}`, reason: 'listing-page-failed', detail: err instanceof Error ? err.message : String(err) });
        break;
      }
      stated ??= got.stated;
      if (got.rows.length === 0) break;
      listed += got.rows.length;

      for (const row of got.rows) {
        if (!row.lao) {
          setAside({ subject: row.title, reason: 'no-document-link', detail: 'the gazette row links no Lao PDF' });
          continue;
        }
        if (PROVINCIAL.test(row.agency)) {
          setAside({ subject: row.title, reason: 'provincial-issuer', detail: `issued by ${row.agency}` });
          continue;
        }
        const kind = kindOfType(row.type);
        if (!kind) {
          setAside({ subject: row.title, reason: 'unknown-instrument-type', detail: `the gazette types it "${row.type}"` });
          continue;
        }
        if (found.has(row.lao)) continue;
        found.set(row.lao, {
          title: row.title,
          url: row.lao,
          kind,
          kindBasis: `the Lao Official Gazette types it "${row.type}"`,
          // The gazette publishes promulgated instruments and says nothing of repeal, so standing is
          // left to the documents rather than asserted.
          commencedOn: row.effective ?? row.gazetted,
          ...(row.english ? { alsoAt: [row.english] } : {}),
        });
      }
      // The last page is short; a page past it is empty, which the check above also stops on.
      if (got.rows.length < 10) break;
    }

    log(`  Lao Official Gazette: ${listed} rows listed of ${stated ?? '?'} stated, ${found.size} registered`);
    if (stated !== null && listed < stated) {
      setAside({ subject: portal.name, reason: 'fewer-than-the-portal-states', detail: `listed ${listed}, the gazette states ${stated}` });
    }
    return [...found.values()];
  },
};
