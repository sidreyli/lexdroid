/**
 * How the exported workbook looks. Nothing here changes a value; it sizes and styles what the
 * sheets already hold.
 *
 * ExcelJS cannot measure text, and Excel only fits a row's height to its text when the row is
 * edited, so a file written without heights opens with every wrapped cell cut to one line. The
 * heights are estimated here instead, from each cell's text against its column's width.
 */
import type ExcelJS from "exceljs";

const FONT = "Arial";
const SIZE = 9;
/** Points per wrapped line of Arial 9, and the most Excel allows a row. */
const LINE = 12;
const MAX_HEIGHT = 409;
const LAO = /[຀-໿]/;
const LAO_LINE = 14.5;
/**
 * Latin characters of Arial 9 per unit of column width. Measured against Excel's own AutoFit on
 * the submitted workbook's 1,166 rows, and set to err towards a little white space rather than a
 * cut-off line.
 */
const CHARS_PER_WIDTH = 1.15;

const HEADER_FILL = "FF166534";
const BAND_FILL = "FFF8FAFC";
const RULE = { style: "thin", color: { argb: "FFD1D5DB" } } as const;
const BORDER = { top: RULE, left: RULE, bottom: RULE, right: RULE };

function text(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return String(value);
  if (value instanceof Date) return value.toISOString();
  if ("richText" in value) return value.richText.map((t) => t.text).join("");
  if ("text" in value) return String(value.text);
  if ("result" in value) return String(value.result ?? "");
  return "";
}

/**
 * How wide a string sets, in average lower-case Latin characters. Capitals and the digits and
 * percent signs of an encoded URL set wider, Thai and Lao far wider in Excel's fallback font, and
 * Cyrillic a little wider; titles in capitals and percent-encoded Lao links were the rows cut short
 * without this.
 */
function breadth(s: string): number {
  let n = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    n +=
      c >= 0x0e00 && c <= 0x0eff ? 1.6
      : c >= 0x0400 && c <= 0x04ff ? 1.15
      : c >= 0x2e80 ? 2
      : ch === "%" ? 1.6
      : (ch >= "A" && ch <= "Z") || (ch >= "0" && ch <= "9") ? 1.25
      : 1;
  }
  return n;
}

/**
 * Lines a cell needs when wrapped in a column this wide, wrapped the way Excel wraps: whole words
 * to a line, and a word longer than the line (a URL, mostly) broken wherever it runs out.
 */
export function linesFor(value: string, width: number): number {
  const perLine = Math.max(4, width * CHARS_PER_WIDTH);
  let lines = 0;
  for (const paragraph of value.split(/\r?\n/)) {
    let used = 0;
    lines += 1;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const size = breadth(word);
      const need = used === 0 ? size : used + 1 + size;
      if (need <= perLine) {
        used = need;
      } else if (size <= perLine) {
        lines += 1;
        used = size;
      } else {
        const rest = size - (perLine - (used === 0 ? 0 : used + 1));
        lines += Math.ceil(rest / perLine);
        used = rest % perLine || perLine;
      }
    }
  }
  return Math.max(1, lines);
}

/**
 * Sets each row from `from` on to the height its longest wrapped cell needs. A cell whose text is
 * wider than its column is wrapped; a cell that fits is left on one line.
 */
export function fitRows(sheet: ExcelJS.Worksheet, from = 1): void {
  for (let r = from; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    let height = LINE;
    row.eachCell((cell, col) => {
      const value = text(cell.value);
      if (!value) return;
      const width = sheet.getColumn(col).width ?? 10;
      if (!cell.alignment?.wrapText) {
        if (breadth(value) <= width * CHARS_PER_WIDTH && !value.includes("\n")) return;
        cell.alignment = { ...cell.alignment, wrapText: true, vertical: "top" };
      }
      // Any Lao in a cell sets every line of it in the taller fallback font, English included.
      const line = LAO.test(value) ? LAO_LINE : LINE;
      height = Math.max(height, linesFor(value, width) * line);
    });
    row.height = Math.min(MAX_HEIGHT, height + 4);
  }
}

/** The workbook's one typeface, keeping any weight or colour a sheet has already set. */
export function baseFont(sheet: ExcelJS.Worksheet): void {
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      cell.font = { ...cell.font, name: FONT, size: SIZE };
      cell.alignment = { vertical: "top", ...cell.alignment };
    }),
  );
}

/**
 * A table: a filled header row, ruled and banded rows below it, the header frozen and filterable.
 * `centred` names the columns of short codes and numbers; everything else reads left to right.
 */
export function styleTable(
  sheet: ExcelJS.Worksheet,
  { header = 1, columns, centred = [] }: { header?: number; columns: number; centred?: number[] },
): void {
  const last = sheet.rowCount;
  for (let r = header; r <= last; r++) {
    const row = sheet.getRow(r);
    for (let c = 1; c <= columns; c++) {
      const cell = row.getCell(c);
      cell.border = BORDER;
      const horizontal = centred.includes(c) ? "center" : "left";
      if (r === header) {
        cell.font = { name: FONT, size: SIZE, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
        cell.alignment = { vertical: "middle", horizontal, wrapText: true };
      } else {
        cell.font = { ...cell.font, name: FONT, size: SIZE };
        cell.alignment = { ...cell.alignment, vertical: "top", horizontal };
        if ((r - header) % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
        }
      }
    }
  }
  sheet.views = [{ state: "frozen", xSplit: 0, ySplit: header }];
  if (last > header) {
    sheet.autoFilter = { from: { row: header, column: 1 }, to: { row: last, column: columns } };
  }
  fitRows(sheet, header + 1);
  sheet.getRow(header).height = Math.max(24, sheet.getRow(header).height ?? 0);
}

/**
 * A sheet that is a document rather than a table: one typeface, and rows tall enough to read.
 *
 * A line of prose alone in its row -- a title, an introduction, a section heading -- was written to
 * run across the empty columns beside it, so it is given all of them rather than wrapped inside
 * the first. The first column is widened to hold the labels beside the values.
 */
export function styleDocument(sheet: ExcelJS.Worksheet): void {
  // A sheet written with no view at all has Excel shrink every row height set on it by a third.
  if (sheet.views.length === 0) sheet.views = [{ state: "normal" }];
  baseFont(sheet);
  const columns = sheet.columnCount;
  const filled = (row: ExcelJS.Row) =>
    Array.from({ length: columns }, (_, i) => text(row.getCell(i + 1).value)).filter(Boolean).length;

  const labels: string[] = [];
  const alone: number[] = [];
  sheet.eachRow((row, r) => {
    const first = text(row.getCell(1).value);
    if (!first) return;
    if (filled(row) === 1) alone.push(r);
    else labels.push(first);
  });
  const longest = Math.max(0, ...labels.map((l) => l.length));
  const first = sheet.getColumn(1);
  first.width = Math.max(first.width ?? 10, Math.min(40, longest / CHARS_PER_WIDTH + 2));

  fitRows(sheet);

  const across = Array.from({ length: columns }, (_, i) => sheet.getColumn(i + 1).width ?? 10)
    .reduce((a, b) => a + b, 0);
  for (const r of alone) {
    if (columns > 1) sheet.mergeCells(r, 1, r, columns);
    const cell = sheet.getRow(r).getCell(1);
    cell.alignment = { ...cell.alignment, wrapText: true, vertical: "top" };
    sheet.getRow(r).height = Math.min(MAX_HEIGHT, linesFor(text(cell.value), across) * LINE + 4);
  }

  const title = sheet.getRow(1).getCell(1);
  if (title.font?.bold) {
    title.font = { ...title.font, size: 12 };
    sheet.getRow(1).height = 20;
  }
}
