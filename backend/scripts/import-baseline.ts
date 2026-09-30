/**
 * Load the instruments named in the 2025 sample kit, for the Discovery Tag.
 *
 *   docs/database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx
 *   docs/database/ESCAP-RDTII-2.1_ Round 2 Database.xlsx
 *   docs/database/Singapore, Malaysia, Australia, Legal Inventory.csv
 *   docs/database/sample-government-portals-pillar-6-7.csv
 *
 * Only instrument titles and their URLs are kept. The output template asks whether each row's
 * instrument was "in the sample kit" (KNOWN) or found independently (NEW), and that is the one
 * question this store answers. Writes data/baseline.db, which nothing upstream of export opens.
 *
 *   npm run -w backend import-baseline
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { openBaseline, normaliseTitle, normaliseUrl, BASELINE_DB_PATH } from '../src/baseline/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const docs = join(repoRoot, 'docs', 'database');

const WORKBOOKS = [
  join(docs, 'ESCAP-RDTII-2.1_ Round 1 Database.xlsx'),
  join(docs, 'ESCAP-RDTII-2.1_ Round 2 Database.xlsx'),
];
const TABLES = [
  join(docs, 'Singapore, Malaysia, Australia, Legal Inventory.csv'),
  join(docs, 'sample-government-portals-pillar-6-7.csv'),
];

const NOT_AN_ECONOMY = new Set(['RDTII 2.1 Methodology', 'Consolidated']);

function text(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('hyperlink' in v && typeof v.hyperlink === 'string') return v.hyperlink.trim();
    if ('result' in v) return String(v.result ?? '').trim();
  }
  return String(v).trim();
}

/** Minimal RFC 4180 reader. The inventory has commas and newlines inside quoted fields. */
function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]!;
    if (quoted) {
      if (c === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim().length));
}

/** Every http(s) URL in a field. The kit spreads them across columns, separated by ";". */
function urlsIn(s: string): string[] {
  return (s.match(/https?:\/\/[^\s;,)"']+/gi) ?? []).map((u) => u.replace(/[.,;]+$/, ''));
}

type Store = ReturnType<typeof openBaseline>;

/** One "Act and/or practice" field names one or more instruments, semicolon separated. */
function addInstruments(db: Store, economy: string, act: string, refs: string, source: string): number {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO baseline_instrument (economy, title_norm, title_raw, url_norm, source)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const urls = urlsIn(refs);
  let added = 0;
  for (const piece of act.split(/\s*;\s*/)) {
    const title = piece.trim();
    if (title.length < 4) continue;
    for (const u of urls.length ? urls : [null]) {
      added += insert.run(economy, normaliseTitle(title), title, u ? normaliseUrl(u) : null, source).changes;
    }
  }
  return added;
}

async function importWorkbook(db: Store, path: string, source: string): Promise<number> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  let added = 0;
  for (const sheet of wb.worksheets) {
    const economy = sheet.name.trim();
    if (NOT_AN_ECONOMY.has(economy)) continue;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;
      // Pillar heading rows carry a name where the indicator id belongs.
      if (!/^\d/.test(text(row.getCell(2)))) return;
      const refs: string[] = [];
      for (let c = 8; c <= Math.max(12, sheet.columnCount); c++) {
        const t = text(row.getCell(c));
        if (t) refs.push(t);
      }
      added += addInstruments(db, economy, text(row.getCell(4)), refs.join(' ; '), source);
    });
  }
  return added;
}

function importCsv(db: Store, path: string, source: string): number {
  const table = parseCsv(readFileSync(path, 'utf8'));
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.findIndex((h) => h === name.toLowerCase());
  const iCountry = col('country');
  const iAct = col('Act.and.or.practice');
  const iRefs = col('References');

  let added = 0;
  for (let r = 1; r < table.length; r++) {
    const line = table[r]!;
    const economy = (line[iCountry] ?? '').trim();
    const act = (line[iAct] ?? '').trim();
    if (!economy || !act) continue;
    added += addInstruments(db, economy, act, (line[iRefs] ?? '').trim(), source);
  }
  return added;
}

async function main(): Promise<void> {
  for (const p of [...WORKBOOKS, ...TABLES]) {
    if (!existsSync(p)) throw new Error(`Missing sample-kit file: ${relative(repoRoot, p)}`);
  }

  const db = openBaseline();
  db.exec('DELETE FROM baseline_instrument;');
  let added = 0;
  for (const [i, p] of WORKBOOKS.entries()) added += await importWorkbook(db, p, `round-${i + 1}`);
  added += importCsv(db, TABLES[0]!, 'legal-inventory');
  added += importCsv(db, TABLES[1]!, 'portal-table');

  console.log(`sample-kit instruments written to ${relative(repoRoot, BASELINE_DB_PATH).replace(/\\/g, '/')}`);
  console.log(`  ${added} distinct instrument/url pairs to tag against`);
  db.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
