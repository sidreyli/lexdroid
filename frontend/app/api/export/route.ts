import { buildWorkbook, outputCsv, rowsFor } from "@/lib/export/workbook";

export const dynamic = "force-dynamic";

/** The workbook, or the evidence sheet alone as CSV. Both leave out what a reviewer rejected. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const economies = url.searchParams.get("economies")?.split(",").filter(Boolean);
  const selection = {
    runId: url.searchParams.get("run") ?? undefined,
    economies: economies?.length ? economies : undefined,
    // The other engine's pass, for the Engine Comparison sheet. Named rather than guessed: on the
    // day there are several runs and the comparison is between the two the short note describes.
    compareRunId: url.searchParams.get("compare") ?? undefined,
  };

  if (rowsFor(selection).length === 0) {
    return Response.json(
      { error: "Nothing to export yet: this run has produced no rows." },
      { status: 404 },
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") {
    return new Response(outputCsv(selection), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="lexdroid-rdtii-${stamp}.csv"`,
      },
    });
  }

  const book = await buildWorkbook(selection);
  return new Response(new Uint8Array(book), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="lexdroid-rdtii-${stamp}.xlsx"`,
    },
  });
}
