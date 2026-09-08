/**
 * Discovery on the Laws of Malaysia portal.
 *
 * The register comes from one document: the portal generates a PDF of its own table of current
 * principal Acts, and that PDF carries, as link annotations, the file each Act is published at.
 * So a single fetch yields the act number, the English title, the date the consolidation is
 * current to, and the document itself -- with no landing page and no signed link in between.
 *
 * The portal's search feed would be the obvious source and is deliberately not used. It now answers
 * with an AES payload the page decrypts using a key it ships inline to every visitor. Reading it
 * means holding a scraped key, and the run that key stops working is a run that reports success
 * and enumerates nothing -- which is exactly how a predecessor of this system silently stopped
 * reading Malaysia's statute book. The generated PDF is the portal's own published artefact and
 * fails loudly.
 *
 * What this does not reach: subsidiary legislation. Those links are signed with a digest that is
 * not ours to compute. It is recorded as a gap in the log rather than left to look like absence.
 */
import type { Adapter, DiscoveredInstrument } from './types.js';

/** "act-detail.php?act=709&lang=BI&date=01-07-2023" -- the row's act number and its date. */
const DETAIL = /act-detail\.php\?act=(\d+)&lang=(BI|BM)&date=(\d{2}-\d{2}-\d{4})/;
/** The portal files an English edition under _BI or /EN, and its Malay twin under _BM or /MY. */
const ENGLISH = /(_BI\/|\/EN\/)/i;
const MALAY = /(_BM\/|\/MY\/)/i;
const IS_PDF = /\.pdf(\?|$)/i;
/** The Download column: the English file sits left of its Malay twin. */
const MALAY_COLUMN_X = 735;

const AS_AT = /\s*As At\s+\d{2}-\d{2}-\d{4}\s*$/i;
const REPEALED = /\(\s*Repealed by ([^)]+)\)/i;

export interface CatalogueRow {
  number: number;
  title: string;
  /** ISO date of the consolidation the portal currently serves. */
  asAt: string | null;
  english: string | null;
  malay: string | null;
  repealedBy: string | null;
}

function isoDate(ddmmyyyy: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(ddmmyyyy);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "882 GOVERNMENT PROCUREMENT ACT 2026 As At 26-05-2026" -> "Government Procurement Act 2026". */
function cleanTitle(line: string, number: number): string {
  let t = line.replace(AS_AT, '').trim();
  if (t.startsWith(`${number} `)) t = t.slice(String(number).length).trim();
  return t.replace(/^[*\s]+/, '').replace(/\s+/g, ' ').trim();
}

/**
 * Every row of the portal's principal-Act table, read off the PDF it generates.
 *
 * Rows are grouped by the act number in the detail link, because the four links of a row arrive
 * together and a new number opens a new row. Position is not used to pair a file with an act: the
 * two detail links swap order between rows depending on which language edition is listed first.
 */
export async function catalogueRows(pdf: Buffer): Promise<CatalogueRow[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const rows: CatalogueRow[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);
    const annotations = await page.getAnnotations();

    // Text by line, so the title can be read off the line the English detail link sits on.
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of (await page.getTextContent()).items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      const y = Math.round(it.transform[5]!);
      const bucket = lines.get(y) ?? [];
      bucket.push({ x: it.transform[4]!, s: it.str });
      lines.set(y, bucket);
    }
    const lineNear = (y: number): string => {
      for (let d = 0; d <= 3; d += 1) {
        for (const at of [y + d, y - d]) {
          const bucket = lines.get(at);
          if (bucket) return bucket.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
        }
      }
      return '';
    };

    let current: CatalogueRow | null = null;
    for (const a of annotations as { subtype?: string; url?: string; unsafeUrl?: string; rect: number[] }[]) {
      const raw = String(a.url ?? a.unsafeUrl ?? '');
      if (!raw) continue;
      const url = decodeURIComponent(raw);

      const detail = DETAIL.exec(url);
      if (detail) {
        const number = Number(detail[1]);
        if (!current || current.number !== number) {
          current = { number, title: '', asAt: isoDate(detail[3]!), english: null, malay: null, repealedBy: null };
          rows.push(current);
        }
        if (detail[2] === 'BI') {
          const line = lineNear(Math.round(a.rect[1]!) + 1);
          current.title = cleanTitle(line, number);
          current.repealedBy = REPEALED.exec(line)?.[1]?.trim() ?? null;
        }
        continue;
      }

      if (!current || !IS_PDF.test(url)) continue;
      if (ENGLISH.test(url)) current.english ??= raw;
      else if (MALAY.test(url)) current.malay ??= raw;
      else if (a.rect[0]! < MALAY_COLUMN_X) current.english ??= raw;
      else current.malay ??= raw;
    }
  }
  return rows;
}

export const lomAdapter: Adapter = {
  name: 'lom',

  async discover(ctx) {
    const catalogue = ctx.portal.adapterConfig['catalogue'] as string | undefined;
    if (!catalogue) throw new Error('the Laws of Malaysia portal needs a catalogue URL in its profile');
    const listing = (ctx.portal.adapterConfig['listing'] as string | undefined) ?? 'Principal Acts';
    const readOn = new Date().toISOString().slice(0, 10);

    const res = await ctx.fetcher.fetch(catalogue);
    if (res.status !== 200) throw new Error(`the catalogue answered HTTP ${res.status}`);
    const rows = await catalogueRows(res.body);
    ctx.log(`  ${rows.length} principal Act(s) listed by the portal`);

    const found: DiscoveredInstrument[] = [];
    let noFile = 0;
    for (const row of rows) {
      const url = row.english ?? row.malay;
      if (!url) {
        noFile += 1;
        continue;
      }
      const asAt = row.asAt ? ` current to ${row.asAt}` : '';
      found.push({
        title: row.title || `Act ${row.number}`,
        url,
        kind: 'act',
        officialNumber: `Act ${row.number}`,
        status: row.repealedBy ? 'repealed' : 'in-force',
        currentTo: row.asAt,
        ...(row.asAt
          ? { currentToBasis: `The portal's catalogue publishes this Act as current to ${row.asAt}; it carries no amendment made after that date.` }
          : {}),
        statusBasis: row.repealedBy
          ? `The Laws of Malaysia catalogue of ${listing} records this Act as repealed by ${row.repealedBy} (read on ${readOn})`
          : `Listed among the ${listing} of the Laws of Malaysia${asAt}, read from the portal's own catalogue on ${readOn}`,
      });
    }
    if (noFile > 0) {
      ctx.log(`    WARNING: ${noFile} listed Act(s) carry no document link in the catalogue and are not in the register`);
    }
    ctx.log(`    ${found.filter((f) => f.status === 'repealed').length} of them marked repealed by the catalogue itself`);
    return found;
  },
};
