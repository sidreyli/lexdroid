/**
 * Load ESCAP's sample kit into the quarantined baseline store.
 *
 *   docs/database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx   Australia, Malaysia, Singapore
 *   docs/database/ESCAP-RDTII-2.1_ Round 2 Database.xlsx   seven of the nine live-test economies
 *   docs/database/Singapore, Malaysia, Australia, Legal Inventory.csv
 *   docs/database/sample-government-portals-pillar-6-7.csv
 *
 * Writes data/baseline.db, which nothing in the pipeline opens. See src/baseline/README.md.
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

const ROUND_1 = join(docs, 'ESCAP-RDTII-2.1_ Round 1 Database.xlsx');
const ROUND_2 = join(docs, 'ESCAP-RDTII-2.1_ Round 2 Database.xlsx');
const INVENTORY = join(docs, 'Singapore, Malaysia, Australia, Legal Inventory.csv');
const PORTALS = join(docs, 'sample-government-portals-pillar-6-7.csv');

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

function num(cell: ExcelJS.Cell): number | null {
  const t = text(cell);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
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

/** Pull every http(s) URL out of a cell. ESCAP spread them across columns and separated by ";". */
function urlsIn(s: string): string[] {
  return (s.match(/https?:\/\/[^\s;,)"']+/gi) ?? []).map((u) => u.replace(/[.,;]+$/, ''));
}

async function importWorkbook(
  db: ReturnType<typeof openBaseline>,
  path: string,
  source: string,
): Promise<{ rows: number; instruments: number; economies: string[] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const insertRow = db.prepare(
    `INSERT INTO baseline_row
       (source, economy, pillar_id, indicator_id, raw_score, act_or_practice, coverage,
        impact, timeframe, references_raw, note, sheet_row)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertInstrument = db.prepare(
    `INSERT OR IGNORE INTO baseline_instrument (economy, title_norm, title_raw, url_norm, source)
     VALUES (?, ?, ?, ?, ?)`,
  );

  let rows = 0;
  let instruments = 0;
  const economies: string[] = [];

  for (const sheet of wb.worksheets) {
    const economy = sheet.name.trim();
    if (NOT_AN_ECONOMY.has(economy)) continue;
    economies.push(economy);

    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= 1) return;

      const indicatorCell = row.getCell(2);
      const indicatorId = text(indicatorCell);
      // Pillar heading rows carry a name where the indicator id belongs.
      if (!indicatorId || !/^\d/.test(indicatorId)) return;

      const act = text(row.getCell(4));
      // ESCAP put URLs in columns 8 through 11 and sometimes the note column too.
      const refs: string[] = [];
      for (let c = 8; c <= Math.max(12, sheet.columnCount); c++) {
        const t = text(row.getCell(c));
        if (t) refs.push(t);
      }
      const refsJoined = refs.join(' ; ');

      insertRow.run(
        source,
        economy,
        num(row.getCell(1)),
        indicatorId,
        num(row.getCell(3)),
        act || null,
        text(row.getCell(5)) || null,
        text(row.getCell(6)) || null,
        text(row.getCell(7)) || null,
        refsJoined || null,
        text(row.getCell(sheet.columnCount)) || null,
        rowNumber,
      );
      rows++;

      // ESCAP's format rule: "Act and/or practice" holds one or more instruments, semicolon
      // separated, without article numbers. Each is a separate thing we might rediscover.
      const urls = urlsIn(refsJoined);
      for (const piece of act.split(/\s*;\s*/)) {
        const title = piece.trim();
        if (title.length < 4) continue;
        if (urls.length === 0) {
          instruments += insertInstrument.run(economy, normaliseTitle(title), title, null, source).changes;
        } else {
          for (const u of urls) {
            instruments += insertInstrument.run(economy, normaliseTitle(title), title, normaliseUrl(u), source).changes;
          }
        }
      }
    });
  }

  return { rows, instruments, economies };
}

function importCsv(
  db: ReturnType<typeof openBaseline>,
  path: string,
  source: string,
): { rows: number; instruments: number } {
  const table = parseCsv(readFileSync(path, 'utf8'));
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string): number => header.findIndex((h) => h === name.toLowerCase());

  const iCountry = col('country');
  const iAct = col('Act.and.or.practice');
  const iCoverage = col('Coverage');
  const iTimeframe = col('Timeframe');
  const iRefs = col('References');
  const iCluster = col('cluster');
  const iDesc = col('policy.description');

  const insertRow = db.prepare(
    `INSERT INTO baseline_row
       (source, economy, pillar_id, indicator_id, raw_score, act_or_practice, coverage,
        impact, timeframe, references_raw, note, sheet_row)
     VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertInstrument = db.prepare(
    `INSERT OR IGNORE INTO baseline_instrument (economy, title_norm, title_raw, url_norm, source)
     VALUES (?, ?, ?, ?, ?)`,
  );

  let rows = 0;
  let instruments = 0;

  for (let r = 1; r < table.length; r++) {
    const line = table[r]!;
    const economy = (line[iCountry] ?? '').trim();
    const act = (line[iAct] ?? '').trim();
    if (!economy || !act) continue;

    const refs = (line[iRefs] ?? '').trim();
    const cluster = iCluster >= 0 ? Number((line[iCluster] ?? '').trim()) : Number.NaN;

    insertRow.run(
      source,
      economy,
      Number.isFinite(cluster) ? cluster : null,
      act,
      iCoverage >= 0 ? (line[iCoverage] ?? '').trim() || null : null,
      iDesc >= 0 ? (line[iDesc] ?? '').trim() || null : null,
      iTimeframe >= 0 ? (line[iTimeframe] ?? '').trim() || null : null,
      refs || null,
      null,
      r + 1,
    );
    rows++;

    const urls = urlsIn(refs);
    for (const piece of act.split(/\s*;\s*/)) {
      const title = piece.trim();
      if (title.length < 4) continue;
      if (urls.length === 0) {
        instruments += insertInstrument.run(economy, normaliseTitle(title), title, null, source).changes;
      } else {
        for (const u of urls) {
          instruments += insertInstrument.run(economy, normaliseTitle(title), title, normaliseUrl(u), source).changes;
        }
      }
    }
  }
  return { rows, instruments };
}

async function main(): Promise<void> {
  for (const p of [ROUND_1, ROUND_2, INVENTORY, PORTALS]) {
    if (!existsSync(p)) throw new Error(`Missing sample-kit file: ${relative(repoRoot, p)}`);
  }

  const db = openBaseline();
  db.exec('DELETE FROM baseline_row; DELETE FROM baseline_instrument;');

  const r1 = await importWorkbook(db, ROUND_1, 'round-1');
  const r2 = await importWorkbook(db, ROUND_2, 'round-2');
  const inv = importCsv(db, INVENTORY, 'legal-inventory');
  const por = importCsv(db, PORTALS, 'portal-table');

  const totalRows = (db.prepare('SELECT COUNT(*) c FROM baseline_row').get() as { c: number }).c;
  const totalInstruments = (db.prepare('SELECT COUNT(*) c FROM baseline_instrument').get() as { c: number }).c;

  console.log(`baseline written to ${relative(repoRoot, BASELINE_DB_PATH).replace(/\\/g, '/')}`);
  console.log(`  round 1        ${String(r1.rows).padStart(4)} rows  ${r1.economies.join(', ')}`);
  console.log(`  round 2        ${String(r2.rows).padStart(4)} rows  ${r2.economies.join(', ')}`);
  console.log(`  legal inventory${String(inv.rows).padStart(5)} rows`);
  console.log(`  portal table   ${String(por.rows).padStart(4)} rows`);
  console.log(`  ${totalRows} rows, ${totalInstruments} distinct instrument/url pairs to tag against`);

  const perEconomy = db
    .prepare(
      `SELECT economy, COUNT(*) c FROM baseline_row WHERE source IN ('round-1','round-2')
       GROUP BY economy ORDER BY economy`,
    )
    .all() as { economy: string; c: number }[];
  console.log('\n  ESCAP\'s own row counts, all 61 indicators:');
  for (const e of perEconomy) console.log(`    ${e.economy.padEnd(20)} ${String(e.c).padStart(4)}`);

  db.close();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
