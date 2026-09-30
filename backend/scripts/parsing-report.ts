/**
 * The data behind the parsing report: for each of Mongolia, Russia and Lao PDR, what the corpus
 * holds and real documents parsed side by side with their source.
 *
 *   npm run -w backend parsing-report -- --out <file.json> [--scans <dir>]
 *
 * Samples are parsed here, from the gold fixtures, by the same parsers the pipeline runs, so the
 * report shows what the code does today rather than what it did when the report was written.
 * Figures come from the store. `--scans` names a directory of rendered scan crops (PNG) to embed
 * beside the Lao OCR text; without it the Lao samples show OCR lines only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { decodeBody } from '../src/fetch/decode.js';
import { parseIps } from '../src/parse/ips.js';
import { sectioniseLao } from '../src/parse/lao.js';
import { parseLegalinfo } from '../src/parse/legalinfo.js';
import type { PageText } from '../src/parse/pdf.js';
import type { ParsedSection } from '../src/parse/types.js';

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const out = arg('--out') ?? 'parsing-report.json';
const scans = arg('--scans');
const FIX = join(import.meta.dirname, '..', 'test', 'fixtures');

interface SampleSection {
  label: string | null;
  path: string;
  excerpt: string;
  repealed: boolean;
  note?: string;
}
interface Sample {
  title: string;
  point: string;
  source: { kind: 'markup' | 'lines' | 'image'; content: string; caption: string };
  sections: SampleSection[];
}

const excerpt = (s: ParsedSection, n = 240): string => {
  const t = s.text.replace(/\n+/g, ' / ');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const pick = (sections: ParsedSection[], labels: (string | null)[], where?: (s: ParsedSection) => boolean): SampleSection[] =>
  labels.map((l) => {
    const s = sections.find((x) => x.label === l && (!where || where(x)))!;
    return { label: s.label, path: s.headingPath, excerpt: excerpt(s), repealed: s.repealed };
  });
/** A slice of markup around a needle, so the reader sees what the parser saw. */
const around = (html: string, needle: string, before = 60, after = 260): string => {
  const i = html.indexOf(needle);
  return i < 0 ? '' : html.slice(Math.max(0, i - before), i + after).replace(/\s+/g, ' ').trim();
};
const png = (name: string): string | null => {
  if (!scans) return null;
  const f = join(scans, `${name}.png`);
  return existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : null;
};

/* ------------------------------------------------------------------ Mongolia */

const mng = (name: string) => readFileSync(join(FIX, 'mng', `${name}.html`), 'utf8');
const acl = parseLegalinfo(mng('anti-corruption-law'), 'u');
const res137 = parseLegalinfo(mng('government-resolution-137'), 'u');
const ranks = parseLegalinfo(mng('military-ranks-decree-with-annex'), 'u');
const tariff = parseLegalinfo(mng('heating-tariff-with-table-annex'), 'u');

const mngSamples: Sample[] = [
  {
    title: 'Anti-Corruption Law (АВЛИГЫН ЭСРЭГ ХУУЛЬ)',
    point: 'An article inserted by amendment is written 2<sup>1</sup>. Read as plain text it became article "21", beside the real article 21. It is now cited as 2¹, under its chapter.',
    source: { kind: 'markup', content: around(mng('anti-corruption-law'), '2<sup>1</sup> дүгээр зүйл', 40, 120), caption: 'legalinfo.mn markup' },
    sections: pick(acl.sections, ['2', '2¹', '21']),
  },
  {
    title: 'Anti-Corruption Law, article 18',
    point: 'The site nests a <div> inside a <p>. Reading only <p> dropped provisions 18.2.2 and 18.4.16; the whole content block is read now.',
    source: { kind: 'markup', content: around(mng('anti-corruption-law'), '<div style="text-align:justify">18.2.2.', 80, 180), caption: 'legalinfo.mn markup' },
    sections: [{ ...pick(acl.sections, ['18'])[0]!, excerpt: '… ' + acl.sections.find((s) => s.label === '18')!.text.split('\n').find((l) => l.startsWith('18.2.2.'))! }],
  },
  {
    title: 'Government resolution No. 137 (2025)',
    point: 'Points 1.1 and 1.2 sit inside point 1. They were stored as three provisions all labelled "1".',
    source: { kind: 'lines', content: res137.text.split('\n\n').filter((l) => /^\d/.test(l)).join('\n').split('\n').filter((l) => /^\d/.test(l)).map((l) => l.slice(0, 90) + '…').join('\n'), caption: 'the resolution as printed' },
    sections: pick(res137.sections, ['1', '2']),
  },
  {
    title: 'Presidential decree No. 41 (2019), with the procedure it approves',
    point: 'The decree approves the military ranks procedure "per the annex", and the page carries only the decree. The annex is served on its own page. It is now fetched and read under its own name, numbered 2.1, 2.2… as it cites itself. Its unnumbered opening paragraphs form a provision too.',
    source: { kind: 'lines', content: ranks.sections.slice(0, 1).map((s) => s.text).join('\n'), caption: 'the decree itself: "…хавсралт ёсоор шинэчлэн баталсугай"' },
    sections: [
      ...pick(ranks.sections.filter((s) => s.headingPath.startsWith('Хавсралт')), [null, '2.1', '2.4', '3.1']),
    ],
  },
  {
    title: 'Heating tariff resolution, with a table annex',
    point: 'A tariff is a table. Each row is read as one line with its cells apart, so a price stays beside the consumer class it applies to.',
    source: { kind: 'lines', content: 'Д/Д | ХЭРЭГЛЭГЧДИЙН АНГИЛАЛ | ХЭМЖИХ НЭГЖ | ТАРИФ\n1. | Төсөвт байгууллагуудын халаалт | Төг/м3 | 2830', caption: 'the table, row by row' },
    sections: [(() => { const s = tariff.sections.find((x) => x.headingPath.startsWith('Хавсралт'))!; return { label: s.label, path: s.headingPath, excerpt: s.text.split('\n').filter((l) => l.includes('|')).slice(0, 4).join(' / '), repealed: s.repealed }; })()],
  },
];

/* ------------------------------------------------------------------ Russia */

const rus = (name: string) => decodeBody({ body: readFileSync(join(FIX, 'rus', `${name}.html`)), mediaType: 'text/html', charset: null });
const pd = parseIps(rus('law-152-fz'), 'u');
const info = parseIps(rus('law-149-fz'), 'u');
const decree = parseIps(rus('decree-763'), 'u');
const r1119 = parseIps(rus('government-resolution-1119'), 'u');
const koap = parseIps(rus('code-administrative-offences-section-i-ch1-4'), 'u');

const rusSamples: Sample[] = [
  {
    title: 'Federal Law No. 152-ФЗ On Personal Data',
    point: 'IPS marks each heading p.H and each superscript span.W9. Article 10¹ read as text was "Статья 101", an article that does not exist.',
    source: { kind: 'markup', content: around(rus('law-152-fz'), 'Статья 10<span', 20, 120), caption: 'pravo.gov.ru/proxy/ips markup (windows-1251)' },
    sections: pick(pd.sections, ['10¹', '12']),
  },
  {
    title: 'Federal Law No. 149-ФЗ On Information',
    point: 'Insertions within insertions: 10²⁻¹ and 10²⁻² stand apart from 10².',
    source: { kind: 'markup', content: around(rus('law-149-fz'), 'Статья 10<span class="W9" style="">2-1', 20, 120), caption: 'IPS markup' },
    sections: pick(info.sections, ['10²', '10²⁻¹', '10²⁻²']),
  },
  {
    title: 'Code of Administrative Offences, section I',
    point: 'The IPS viewer cuts a Code off at 747,740 bytes, so the Code is read from the system\'s own export. Articles sit under section, then chapter. A bare heading followed by the system\'s repeal note is a repealed article.',
    source: { kind: 'lines', content: 'РАЗДЕЛ I. ОБЩИЕ ПОЛОЖЕНИЯ\nГЛАВА 3. АДМИНИСТРАТИВНОЕ НАКАЗАНИЕ\nСтатья 3.6.\n(Статья утратила силу - Федеральный закон от 28.12.2010 № 398-ФЗ)', caption: 'as the Code prints it' },
    sections: pick(koap.sections, ['3.5', '3.6']),
  },
  {
    title: 'Presidential Decree No. 763',
    point: 'A decree is cited by its points. Point 2¹ is repealed, as the system states; the list annexed to the decree is its own block.',
    source: { kind: 'lines', content: decree.sections.filter((s) => ['2', '2¹', '3'].includes(s.label ?? '') && !s.headingPath.startsWith('Прил')).map((s) => s.text.split('\n')[0]!.slice(0, 110)).join('\n'), caption: 'the decree\'s points' },
    sections: [...pick(decree.sections, ['2¹'], (s) => !s.headingPath.startsWith('Прил')), ...pick(decree.sections, ['1'], (s) => s.headingPath.startsWith('Прил'))],
  },
  {
    title: 'Government Resolution No. 1119 (2012)',
    point: 'The resolution approves requirements for protecting personal data. They are read as their own block, numbered 1–17.',
    source: { kind: 'lines', content: r1119.sections.slice(0, 2).map((s) => s.text.slice(0, 140)).join('\n'), caption: 'the resolution\'s operative points' },
    sections: pick(r1119.sections.filter((s) => s.headingPath.startsWith('Прил')), ['1', '2', '17']),
  },
];

/* ------------------------------------------------------------------ Lao PDR */

const lao = (name: string) => sectioniseLao((JSON.parse(readFileSync(join(FIX, 'lao', `${name}.pages.json`), 'utf8')) as { pages: PageText[] }).pages);
const pay = lao('payment-system-decision-819');
const cyber = lao('cybersecurity-law-87');
const goods = lao('dangerous-goods-decree-283');
const inferredNote = (inf: string[], label: string | null): string | undefined => {
  const hit = inf.find((i) => i.startsWith(`${label} (`));
  return hit ? `label from the sequence; OCR ${hit.slice(hit.indexOf('(') + 1, -1)}` : undefined;
};
const laoPick = (r: ReturnType<typeof lao>, labels: string[], where?: (s: ParsedSection) => boolean): SampleSection[] =>
  pick(r.builder.sections, labels, where).map((s) => ({ ...s, ...(inferredNote(r.inferred, s.label) ? { note: inferredNote(r.inferred, s.label)! } : {}) }));

const laoSamples: Sample[] = [
  {
    title: 'Bank of the Lao PDR decision on payment systems (2026)',
    point: 'The scan prints ມາດຕາ 30 and ມາດຕາ 31; OCR read them as "390" and "81". The next headings confirm the sequence, so the provisions are labelled 30 and 31. The inference is recorded and the text is kept as OCR read it.',
    source: { kind: png('pay-p11') ? 'image' : 'lines', content: png('pay-p11') ?? '', caption: 'page 11 of the scan' },
    sections: laoPick(pay, ['29', '30', '31']),
  },
  {
    title: 'Law on Cybersecurity (2025)',
    point: 'A gazetted law is a bundle: the President\'s decree promulgating it, the National Assembly\'s resolution adopting it, then the law. Each numbers from article 1, and each is read as its own block. The part\'s Roman numeral does not survive OCR, so parts are numbered in order and named by their title.',
    source: { kind: png('cyber-p3') ? 'image' : 'lines', content: png('cyber-p3') ?? '', caption: 'page 3 of the scan: ພາກທີ I, articles 1–3' },
    sections: [
      ...laoPick(cyber, ['1'], (s) => s.headingPath.startsWith('ລັດຖະດຳລັດ')),
      ...laoPick(cyber, ['1'], (s) => s.headingPath.startsWith('ມະຕິ')),
      ...laoPick(cyber, ['1', '3'], (s) => s.headingPath.startsWith('ພາກທີ')),
    ],
  },
  {
    title: 'Government decree on transporting dangerous goods (2026)',
    point: 'OCR wrote the chapter word ໝວດ five different ways across eleven chapters. All eleven are recognised, and each chapter is named by its title rather than by the seal debris printed above it.',
    source: { kind: 'lines', content: 'ຫນວດທີ 1\nບນວດທີ 2\nບຫວດທີ 3\nຫວດທີ 5\nຫພວດທີ 8', caption: 'the chapter headings as OCR returned them' },
    sections: laoPick(goods, ['1', '8', '30']),
  },
];

/* ------------------------------------------------------------------ figures */

const db = openDb();
const one = <T>(sql: string, ...p: unknown[]): T => db.prepare(sql).get(...p) as T;
const figures = (code: string) => ({
  registered: one<{ n: number }>('SELECT COUNT(*) n FROM instrument WHERE economy_code = ?', code).n,
  byKind: db.prepare('SELECT kind, COUNT(*) n FROM instrument WHERE economy_code = ? GROUP BY kind ORDER BY n DESC').all(code),
  documents: one<{ n: number }>('SELECT COUNT(*) n FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ? AND d.section_count > 0', code).n,
  unread: one<{ n: number }>('SELECT COUNT(*) n FROM unread_document u JOIN document d ON d.id = u.document_id JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?', code).n,
  sections: one<{ n: number }>('SELECT COUNT(*) n FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?', code).n,
  repealed: one<{ n: number }>('SELECT COUNT(*) n FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ? AND s.repealed = 1', code).n,
  ocrConfidence: one<{ c: number | null }>('SELECT AVG(d.ocr_confidence) c FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?', code).c,
  largest: one<{ n: number | null }>('SELECT MAX(d.section_count) n FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?', code).n,
});

writeFileSync(
  out,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      economies: [
        { code: 'MNG', figures: figures('MNG'), samples: mngSamples },
        { code: 'RUS', figures: figures('RUS'), samples: rusSamples },
        { code: 'LAO', figures: figures('LAO'), samples: laoSamples },
      ],
    },
    null,
    1,
  ),
);
console.log(`wrote ${out}`);
