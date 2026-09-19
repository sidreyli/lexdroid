/**
 * Subsidiary legislation on the Laws of Malaysia portal.
 *
 * This is where most of Malaysia's operative trade law is written: the Customs (Prohibition of
 * Imports) Order, the Customs Duties (Exemption) Order, the anti-dumping duty orders. Sixteen
 * thousand instruments against 836 principal Acts, and none of them was in the register.
 *
 * The portal's listing pages link each one through a signed redirect whose digest is not ours to
 * compute, which is why this looked unreachable. It is not: the portal also generates a PDF of the
 * same table, and that PDF carries the document's real path as a link annotation. So the catalogue
 * is read exactly as the principal-Act catalogue is -- one fetch, no signed link, and a failure
 * that is loud rather than a listing that quietly comes back empty.
 */
import type { Adapter, DiscoveredInstrument } from './types.js';

const ORIGIN = 'https://lom.agc.gov.my/';

/** The Title column. Measured off the catalogue: the P.U. number sits left of it, status right. */
const TITLE_LEFT = 170;
const TITLE_RIGHT = 475;

const ROW = /act-view\.php\?type=(?:pua|pub)&no=(.+?)&status=([A-Za-z]+)/;
const PARENT = /act-detail\.php\?act=\d+&lang=(BI|BM)/;
const IS_PDF = /\.pdf(?:[#?]|$)/i;
const LEADING_NUMBER = /^P\.U\.\s*\([AB]\)\s*[\d/\s]+/i;
/** The catalogue's own furniture, printed inside the Title column. */
const PAGE_FOOTER = /^Page\s+\d/i;
const PARENT_LINE = /^(AKTA|ACT|P\.U\.)\s/i;

/** What the catalogue's Status column says, in both languages it says it in. */
const STANDING: Readonly<Record<string, DiscoveredInstrument['status']>> = {
  PRINCIPAL: 'in-force',
  IBU: 'in-force',
  REPRINT: 'in-force',
  AMENDMENT: 'amending',
  PINDAAN: 'amending',
  CORRIGENDUM: 'amending',
  CANCEL: 'repealed',
};

/** The instrument's own name for itself, which is what decides its rank against an Act. */
const KINDS: readonly (readonly [RegExp, DiscoveredInstrument['kind']])[] = [
  [/\bREGULATIONS?\b/i, 'regulation'],
  [/\bRULES\b/i, 'rule'],
  [/\bBY-?LAWS?\b/i, 'rule'],
  [/\bNOTIFICATION\b/i, 'notice'],
  [/\bORDER\b/i, 'order'],
];

export interface SubsidiaryRow {
  /** "P.U. (A) 324/2026" */
  number: string;
  /** The word the catalogue prints in its Status column, verbatim. */
  status: string;
  title: string;
  url: string | null;
  gazettedOn: string | null;
}

function isoDate(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function cleanTitle(text: string): string {
  return text.replace(LEADING_NUMBER, '').replace(/\s+/g, ' ').trim();
}

function kindOf(title: string, series: string): DiscoveredInstrument['kind'] {
  for (const [pattern, kind] of KINDS) if (pattern.test(title)) return kind;
  return series.includes('(B)') ? 'notice' : 'order';
}

interface Item {
  x: number;
  y: number;
  s: string;
}

/**
 * Every row of the portal's subsidiary-legislation table, read off the PDF it generates.
 *
 * A row opens at its P.U. number and closes at the next one. Its English title is the stretch of
 * the Title column between the Malay name of the parent Act and the English name of the same Act,
 * because the portal prints each row twice over, Malay first.
 */
export async function subsidiaryRows(pdf: Buffer): Promise<SubsidiaryRow[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const rows: SubsidiaryRow[] = [];
  for (let p = 1; p <= doc.numPages; p += 1) {
    const page = await doc.getPage(p);

    const items: Item[] = [];
    for (const it of (await page.getTextContent()).items as { str: string; transform: number[] }[]) {
      if (!it.str.trim()) continue;
      items.push({ x: it.transform[4]!, y: Math.round(it.transform[5]!), s: it.str });
    }
    /** The Title column between two heights, one string per printed line, top down. */
    const titleLines = (low: number, high: number): string[] => {
      const byLine = new Map<number, Item[]>();
      for (const i of items) {
        if (i.y <= low || i.y >= high || i.x < TITLE_LEFT || i.x >= TITLE_RIGHT) continue;
        byLine.set(i.y, [...(byLine.get(i.y) ?? []), i]);
      }
      return [...byLine.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, line]) => line.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim())
        .filter((line) => line.length > 0 && !PAGE_FOOTER.test(line));
    };

    const annotations = (await page.getAnnotations())
      .map((a) => a as { rect: number[]; url?: string; unsafeUrl?: string })
      .filter((a) => Boolean(a.url ?? a.unsafeUrl))
      .map((a) => ({
        x: a.rect[0]!,
        y: Math.round(a.rect[1]!),
        url: decodeURIComponent(String(a.url ?? a.unsafeUrl)),
        raw: String(a.url ?? a.unsafeUrl),
      }))
      .sort((a, b) => b.y - a.y);

    const opened: { row: SubsidiaryRow; y: number; bi: number | null; bm: number[] }[] = [];
    for (const a of annotations) {
      const start = ROW.exec(a.url);
      if (start && a.x < TITLE_LEFT) {
        const dateAt = items.find((i) => i.x < 100 && Math.abs(i.y - a.y) <= 3);
        opened.push({
          row: {
            number: start[1]!.replace(/\s+/g, ' ').replace(/\s*\/\s*/, '/').trim(),
            status: start[2]!,
            title: '',
            url: null,
            gazettedOn: isoDate(dateAt?.s ?? ''),
          },
          y: a.y,
          bi: null,
          bm: [],
        });
        continue;
      }
      const current = opened[opened.length - 1];
      if (!current) continue;
      if (IS_PDF.test(a.url)) {
        current.row.url ??= new URL(a.raw.split('#')[0]!, ORIGIN).href;
        continue;
      }
      const parent = PARENT.exec(a.url);
      if (parent?.[1] === 'BI') current.bi ??= a.y;
      else if (parent?.[1] === 'BM') current.bm.push(a.y);
    }

    opened.forEach((o, i) => {
      const floor = opened[i + 1]?.y ?? 0;
      if (o.bi !== null && o.bm.length > 0) {
        // Each row is printed twice over, Malay first, and the two editions of the parent Act's
        // name are linked. What lies between those two links is the English title.
        o.row.title = cleanTitle(titleLines(o.bi + 6, Math.min(...o.bm) - 2).join(' '));
      } else {
        // No parent Act is linked, so the two editions cannot be told apart. The title down to the
        // first parent-Act line is one whole title in one language, which beats a mixture of both.
        const lines = titleLines(floor + 4, o.y + 14);
        const parent = lines.findIndex((l) => PARENT_LINE.test(l));
        o.row.title = cleanTitle((parent > 0 ? lines.slice(0, parent) : lines).join(' '));
      }
      rows.push(o.row);
    });
  }
  return rows;
}

export const lomSubsidAdapter: Adapter = {
  name: 'lom-subsid',

  async discover(ctx) {
    const catalogue = ctx.portal.adapterConfig['catalogue'] as string | undefined;
    if (!catalogue) throw new Error('the subsidiary-legislation listing needs a catalogue URL in its profile');
    const series = (ctx.portal.adapterConfig['series'] as string | undefined) ?? 'P.U. (A)';
    const readOn = new Date().toISOString().slice(0, 10);

    const res = await ctx.fetcher.fetch(catalogue);
    if (res.status !== 200) throw new Error(`the ${series} catalogue answered HTTP ${res.status}`);
    const rows = await subsidiaryRows(res.body);
    ctx.log(`  ${rows.length} ${series} instrument(s) listed by the portal`);

    const found: DiscoveredInstrument[] = [];
    let noFile = 0;
    let noTitle = 0;
    for (const row of rows) {
      if (!row.url) {
        noFile += 1;
        ctx.setAside({
          subject: row.number,
          reason: 'listed-no-document-link',
          detail: `${row.title || row.number} is listed in the ${series} catalogue with no document link`,
        });
        continue;
      }
      if (!row.title) noTitle += 1;
      const standing = STANDING[row.status];
      const gazetted = row.gazettedOn ? ` and gazetted on ${row.gazettedOn}` : '';
      found.push({
        title: row.title || row.number,
        url: row.url,
        kind: kindOf(row.title, series),
        officialNumber: row.number,
        ...(standing ? { status: standing } : {}),
        statusBasis:
          `The Laws of Malaysia catalogue of ${series} lists this instrument as "${row.status}"${gazetted}` +
          ` (read from the portal's own catalogue on ${readOn})`,
        titleProvisional: !row.title,
      });
    }
    if (noFile > 0) {
      ctx.log(`    WARNING: ${noFile} listed instrument(s) carry no document link and are not in the register`);
    }
    if (noTitle > 0) {
      ctx.log(`    ${noTitle} carry no title in the catalogue and are registered under their P.U. number`);
    }
    ctx.log(`    ${found.filter((f) => f.status === 'repealed').length} marked cancelled by the catalogue itself`);
    return found;
  },
};
