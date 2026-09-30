import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { fitRows, linesFor, styleTable } from "./style";

describe("sizing a row to its text", () => {
  it("wraps whole words, so a line never ends mid-word unless the word is longer than the line", () => {
    expect(linesFor("short", 20)).toBe(1);
    expect(linesFor("one two three four five six seven eight nine ten", 20)).toBe(3);
    expect(linesFor(`https://example.gov/${"a".repeat(200)}`, 20)).toBeGreaterThan(8);
  });

  it("counts each paragraph from a fresh line", () => {
    expect(linesFor("a\nb\nc", 40)).toBe(3);
  });

  it("gives Thai and Lao more room than the same count of Latin letters", () => {
    expect(linesFor("ກ".repeat(60), 40)).toBeGreaterThan(linesFor("a".repeat(60), 40));
  });

  it("makes a row with a long snippet taller than a row without one, and never past Excel's limit", () => {
    const sheet = new ExcelJS.Workbook().addWorksheet("t");
    sheet.columns = [{ width: 20 }, { width: 20 }];
    sheet.addRow(["short", "short"]);
    sheet.addRow(["short", "a long verbatim snippet ".repeat(8)]);
    sheet.addRow(["short", "word ".repeat(5000)]);
    fitRows(sheet);
    expect(sheet.getRow(2).height).toBeGreaterThan(sheet.getRow(1).height!);
    expect(sheet.getRow(2).getCell(2).alignment?.wrapText).toBe(true);
    expect(sheet.getRow(3).height).toBe(409);
  });
});

describe("a styled table", () => {
  it("changes how the values look and never the values", () => {
    const sheet = new ExcelJS.Workbook().addWorksheet("t");
    sheet.columns = [{ width: 10 }, { width: 30 }];
    sheet.addRow(["Indicator ID", "Verbatim Snippet"]);
    sheet.addRow(["12.10", "the exact words of the provision"]);
    styleTable(sheet, { columns: 2, centred: [1] });
    expect(sheet.getRow(2).values).toEqual([undefined, "12.10", "the exact words of the provision"]);
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(sheet.getRow(2).getCell(1).alignment?.horizontal).toBe("center");
    expect(sheet.getRow(2).getCell(2).alignment?.horizontal).toBe("left");
  });
});
