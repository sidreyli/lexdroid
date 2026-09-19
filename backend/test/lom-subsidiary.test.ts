import { describe, expect, it } from 'vitest';
import { lomSubsidAdapter, subsidiaryRows } from '../src/discover/lom-subsid.js';
import type { Fetcher, FetchResult } from '../src/fetch/index.js';
import type { Portal } from '../src/profile/types.js';

interface Row {
  number: string;
  status: string;
  malay: string;
  english: string | null;
  parent: string | null;
  file: string | null;
  date?: string;
}

const esc = (s: string): string => s.replace(/([\\()])/g, '\\$1');

/** One text run placed where the catalogue places it, so the column windows are exercised. */
const text = (x: number, y: number, s: string): string =>
  `BT /F1 8 Tf 1 0 0 1 ${x} ${y} Tm (${esc(s)}) Tj ET\n`;

/**
 * A catalogue PDF shaped like the one the portal generates: a link on the P.U. number, a link on
 * each language edition of the parent Act, and a link on the file in the Download column.
 */
function catalogue(rows: Row[]): Buffer {
  const content: string[] = [];
  const links: { rect: number[]; url: string }[] = [];

  rows.forEach((r, i) => {
    const y = 483 - i * 130;
    content.push(text(42, y, r.date ?? '08/09/2026'));
    content.push(text(173, y, r.malay));
    links.push({
      rect: [101, y - 2, 165, y + 7],
      url: `https://lom.agc.gov.my/act-view.php?type=pua&no=${encodeURIComponent(r.number)}&status=${r.status}`,
    });
    if (r.parent) {
      content.push(text(173, y - 20, `AKTA 235 - ${r.parent}`));
      links.push({ rect: [173, y - 22, 414, y - 13], url: 'act-detail.php?act=235&lang=BM' });
      if (r.english) content.push(text(173, y - 40, r.english));
      content.push(text(173, y - 60, `ACT 235 - ${r.parent}`));
      links.push({ rect: [173, y - 62, 412, y - 53], url: 'act-detail.php?act=235&lang=BI' });
    }
    // The commencement column shares the line with the title and must stay out of it.
    content.push(text(655, y, 'October 2026'));
    if (r.file) {
      links.push({
        rect: [725, y - 35, 757, y + 7],
        url: `../../../ilims/upload/portal/akta/outputp/3436819/${r.file}#[0,{"name":"Fit"}]`,
      });
    }
  });
  content.push(text(300, 40, 'Page 1 / 1.798'));

  const stream = content.join('');
  const annots = links.map((_l, n) => `${6 + n} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /Annots [${annots}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    ...links.map((l) => `<< /Type /Annot /Subtype /Link /Rect [${l.rect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI (${esc(l.url)}) >> >>`),
  ];

  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];
  objects.forEach((body, n) => {
    offsets.push(pdf.length);
    pdf += `${n + 1} 0 obj\n${body}\nendobj\n`;
  });
  const start = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

const CUSTOMS: Row = {
  number: 'P.U. (A) 151/2026',
  status: 'AMENDMENT',
  malay: 'PERINTAH KASTAM (LARANGAN MENGENAI IMPORT) (PINDAAN) (NO. 3) 2026',
  english: 'CUSTOMS (PROHIBITION OF IMPORTS) (AMENDMENT) (NO. 3) ORDER 2026',
  parent: 'AKTA KASTAM 1967',
  file: 'PUA 151_2026.pdf',
};

function fetcherFor(body: Buffer, status = 200): Fetcher {
  return {
    async fetch(url: string): Promise<FetchResult> {
      return {
        url, finalUrl: url, status, mediaType: 'application/pdf', body,
        contentHash: 'x', fromCache: false, fetchedAt: '2026-09-12T00:00:00.000Z',
      };
    },
  } as unknown as Fetcher;
}

const portal = {
  name: 'Laws of Malaysia -- subsidiary legislation, P.U. (A)',
  url: 'https://lom.agc.gov.my/subsid.php?type=pua',
  adapterConfig: { catalogue: 'https://lom.agc.gov.my/generate-subsid-pdf.php?type=pua', series: 'P.U. (A)' },
} as unknown as Portal;

async function discover(rows: Row[]) {
  return lomSubsidAdapter.discover({ portal, fetcher: fetcherFor(catalogue(rows)), log: () => {}, setAside: () => {} });
}

describe('reading the subsidiary-legislation catalogue', () => {
  it('takes the English title, not the Malay one it is printed beside', async () => {
    const [row] = await subsidiaryRows(catalogue([CUSTOMS]));

    expect(row!.number).toBe('P.U. (A) 151/2026');
    expect(row!.title).toBe('CUSTOMS (PROHIBITION OF IMPORTS) (AMENDMENT) (NO. 3) ORDER 2026');
    expect(row!.gazettedOn).toBe('2026-09-08');
  });

  it('resolves the document link the portal prints, without the signed redirect', async () => {
    const [found] = await discover([CUSTOMS]);

    expect(found!.url).toBe('https://lom.agc.gov.my/ilims/upload/portal/akta/outputp/3436819/PUA%20151_2026.pdf');
    expect(found!.officialNumber).toBe('P.U. (A) 151/2026');
  });

  it('keeps the commencement column out of the title', async () => {
    const [row] = await subsidiaryRows(catalogue([CUSTOMS]));
    expect(row!.title).not.toContain('October 2026');
  });

  it('reads the standing off the catalogue, in either language it is written in', async () => {
    const rows: Row[] = [
      { ...CUSTOMS, number: 'P.U. (A) 1/2026', status: 'PRINCIPAL' },
      { ...CUSTOMS, number: 'P.U. (A) 2/2026', status: 'PINDAAN' },
      { ...CUSTOMS, number: 'P.U. (A) 3/2026', status: 'CANCEL' },
      { ...CUSTOMS, number: 'P.U. (A) 4/2026', status: 'REPRINT' },
    ];
    const found = await discover(rows);

    expect(found.map((f) => f.status)).toEqual(['in-force', 'amending', 'repealed', 'in-force']);
    expect(found[2]!.statusBasis).toContain('"CANCEL"');
    expect(found[0]!.statusBasis).toContain('gazetted on 2026-09-08');
  });

  it('calls an instrument what it calls itself', async () => {
    const found = await discover([
      CUSTOMS,
      { ...CUSTOMS, number: 'P.U. (A) 2/2026', english: 'CUSTOMS (AMENDMENT) (NO. 5) REGULATIONS 2026' },
      { ...CUSTOMS, number: 'P.U. (A) 3/2026', english: 'SUBORDINATE COURTS RULES 2026' },
    ]);

    expect(found.map((f) => f.kind)).toEqual(['order', 'regulation', 'rule']);
  });

  it('takes one whole title when no parent Act is linked, rather than a mixture of both', async () => {
    const [row] = await subsidiaryRows(
      catalogue([{ ...CUSTOMS, parent: null, english: null, malay: 'PERINTAH KEANGGOTAAN MAHKAMAH TINGGI 2026' }]),
    );

    expect(row!.title).toBe('PERINTAH KEANGGOTAAN MAHKAMAH TINGGI 2026');
  });

  it('leaves the catalogue page number out of every title', async () => {
    const rows = await subsidiaryRows(catalogue([{ ...CUSTOMS, parent: null, english: null }]));
    expect(rows[0]!.title).not.toMatch(/Page 1/);
  });

  it('keeps a row the catalogue gives no document for out of the register, and says so', async () => {
    const found = await discover([CUSTOMS, { ...CUSTOMS, number: 'P.U. (A) 9/2026', file: null }]);
    expect(found).toHaveLength(1);
  });

  it('fails loudly when the catalogue does not answer, rather than registering nothing', async () => {
    await expect(
      lomSubsidAdapter.discover({ portal, fetcher: fetcherFor(Buffer.from(''), 503), log: () => {}, setAside: () => {} }),
    ).rejects.toThrow(/503/);
  });
});
