/**
 * The live hour's export: which two runs it compares, what clock it prints, and the Run Record's
 * document list, whose Engine B count is the figure a steward checks.
 */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { clockAt, passesOf } from "./pair";
import { addRunRecord, fileType } from "./sheets";
import type { Run } from "@/lib/data/types";

function run(over: Partial<Run>): Run {
  return {
    id: "a",
    startedAt: "2026-10-15T03:05:00.000Z",
    finishedAt: "2026-10-15T03:35:00.000Z",
    economies: ["THA"],
    pillars: [11],
    indicators: ["11.3", "11.4"],
    engine: "engine-a",
    model: "gemma4-lex-16k",
    sourceMode: "fetch",
    codeRevision: "abc",
    rubricDerivedAt: "",
    status: "complete",
    notes: null,
    cells: 2,
    rows: 10,
    usd: 0,
    calls: 1,
    tokens: 1,
    wallSeconds: 1,
    stages: [],
    ...over,
  };
}

const a = run({});
const b = run({
  id: "b",
  engine: "engine-b",
  model: "qwen3.8-lex-16k",
  sourceMode: "cache-only",
  startedAt: "2026-10-15T03:10:00.000Z",
  finishedAt: "2026-10-15T04:00:00.000Z",
  usd: 0.24,
});

describe("finding the hour's two passes", () => {
  it("pairs the fetching pass as A and the cache-only pass as B, from either page", () => {
    expect(passesOf(a, [a, b])).toEqual({ a, b });
    expect(passesOf(b, [a, b])).toEqual({ a, b });
  });

  it("does not pair across a different draw", () => {
    expect(passesOf(a, [a, run({ ...b, indicators: ["11.1", "11.2"] })])).toBeNull();
    expect(passesOf(a, [a, run({ ...b, economies: ["VNM"] })])).toBeNull();
    expect(passesOf(a, [a, run({ ...b, pillars: [6] })])).toBeNull();
  });

  it("does not pair a run with its own engine, or with a pass that did not finish", () => {
    expect(passesOf(a, [a, run({ ...b, engine: "engine-a" })])).toBeNull();
    expect(passesOf(a, [a, run({ ...b, status: "failed" })])).toBeNull();
    expect(passesOf(run({ status: "running" }), [a, b])).toBeNull();
  });

  it("takes the other engine's pass nearest in time", () => {
    const lastWeek = run({ ...b, id: "old", startedAt: "2026-10-08T03:10:00.000Z" });
    expect(passesOf(a, [lastWeek, a, b])?.b.id).toBe("b");
  });

  it("prefers a cache-only partner to another fetching one", () => {
    const fetched = run({ ...b, id: "f", sourceMode: "fetch", startedAt: a.startedAt });
    expect(passesOf(a, [a, fetched, b])?.b.id).toBe("b");
  });
});

describe("the clock the sheets print", () => {
  it("is Bangkok's, where the live test is held, not UTC", () => {
    expect(clockAt("2026-10-15T03:15:00.000Z")).toBe("10:15");
    expect(clockAt("2026-10-15T17:30:00.000Z")).toBe("00:30");
    expect(clockAt(null)).toBe("");
    expect(clockAt("not a time")).toBe("");
  });
});

describe("file types in the document list", () => {
  it("comes from the stored document, then the URL", () => {
    expect(fileType("application/pdf", "https://x.go.th/a")).toBe("PDF");
    expect(fileType("text/html; charset=utf-8", "https://x.go.th/a.pdf")).toBe("HTML");
    expect(fileType(null, "https://x.go.th/law/ETA-2544.pdf?v=2")).toBe("PDF");
    expect(fileType(null, "https://x.go.th/robots.txt")).toBe("TXT");
    expect(fileType(null, "https://app.bot.or.th/FIPCS/Thai/PFIPCS_list.aspx")).toBe("HTML");
    expect(fileType("application/vnd.lexdroid.ocs+json", "https://x.go.th/api/getLawDoc")).toBe("JSON");
  });

  it("is left blank rather than guessed when neither the server nor the URL says", () => {
    expect(fileType(null, "https://searchlaw.ocs.go.th/ocs-api/public/doc/getLawDoc")).toBe("");
  });
});

describe("the Run Record", () => {
  const cells = (book: ExcelJS.Workbook): string[][] => {
    const out: string[][] = [];
    book.getWorksheet("Run Record")!.eachRow((r) => {
      out.push((r.values as unknown[]).slice(1).map((v) => (v === undefined || v === null ? "" : String(v))));
    });
    return out;
  };
  const docs = [
    { runId: "a", url: "https://x.go.th/robots.txt", at: "2026-10-15T03:06:00.000Z", bytes: 900, mediaType: null },
    { runId: "a", url: "https://x.go.th/eta.pdf", at: "2026-10-15T03:07:00.000Z", bytes: 812 * 1024, mediaType: "application/pdf" },
  ];

  it("lists every document with its pass and Bangkok time, and counts Engine B's from the list", () => {
    const book = new ExcelJS.Workbook();
    addRunRecord(book, { run: a, rows: [], documentsFetched: 2 }, { run: b, rows: [], documentsFetched: 0 }, docs);
    const rows = cells(book);
    expect(rows).toContainEqual(["2", "https://x.go.th/eta.pdf", "Engine A pass", "10:07", "812", "PDF"]);
    expect(rows.find((r) => r[0]?.startsWith("Documents fetched during the hour"))?.[4]).toBe("2");
    expect(rows.find((r) => r[0]?.startsWith("Documents fetched by Engine B"))?.[4]).toBe("0");
    expect(rows.find((r) => r[0] === "Engine B — second pass")).toEqual([
      "Engine B — second pass", "qwen3.8-lex-16k", "10:10", "11:00", "50", "0.24", "b",
    ]);
    expect(rows.find((r) => r[0] === "Total cost for the hour (US$)")?.[5]).toBe("0.24");
  });

  it("says unknown for a total over an unrecorded cost, rather than summing it as free", () => {
    const book = new ExcelJS.Workbook();
    addRunRecord(book, { run: a, rows: [], documentsFetched: 0 }, { run: { ...b, usd: null }, rows: [], documentsFetched: 0 }, []);
    expect(cells(book).find((r) => r[0] === "Total cost for the hour (US$)")?.[5]).toBe("unknown");
  });

  it("leaves Engine B's count blank when there was no second pass, rather than certifying zero", () => {
    const book = new ExcelJS.Workbook();
    addRunRecord(book, { run: a, rows: [], documentsFetched: 2 }, { run: null, rows: [], documentsFetched: 0 }, docs);
    expect(cells(book).find((r) => r[0]?.startsWith("Documents fetched by Engine B"))?.[4]).toBe("");
  });
});
