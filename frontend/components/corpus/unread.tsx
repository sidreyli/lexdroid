import Link from "next/link";
import type { CorpusEconomy } from "@/lib/data/corpus";

/** What each recorded reason means for a reader, since the stored reason is a code. */
const MEANING: Record<string, string> = {
  "scanned-no-ocr":
    "A scan with no text layer. Nothing in it can be quoted until it goes through OCR.",
  "ocr-below-threshold": "OCR ran, but the text came back too poor to quote from.",
  "landing-page": "The page links to the law rather than carrying it.",
  empty: "The page was fetched and parsed, but held no provisions where provisions were expected.",
  "parse-error": "The document could not be parsed into sections.",
  "another-instrument":
    "The document calls itself something other than the title it was filed under, so nothing in it may be cited under that title.",
};

export function UnreadLedger({
  economies,
  names,
}: {
  economies: CorpusEconomy[];
  names: Map<string, string>;
}) {
  const rows = economies.flatMap((e) => e.unread.map((u) => ({ ...u, code: e.code })));
  if (rows.length === 0) {
    return (
      <p className="text-[13.5px] leading-relaxed text-muted-foreground">
        Every document fetched so far has been read. Nothing is being passed over in silence.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows
        .sort((a, b) => b.count - a.count)
        .map((row) => (
          <li
            key={`${row.code}-${row.reason}`}
            className="rounded-2xl border border-edge px-4 py-3.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[14px] font-medium text-navy-deep">{row.reason}</span>
              <Link
                href={`/corpus?economy=${row.code}&read=unread`}
                className="text-[12.5px] text-muted-foreground underline-offset-[3px] hover:underline"
              >
                {names.get(row.code) ?? row.code}
              </Link>
              <span className="tnum ml-auto text-[13px] text-ochre">
                {row.count.toLocaleString("en-GB")}{" "}
                {row.count === 1 ? "document" : "documents"}
              </span>
            </div>
            <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-muted-foreground">
              {MEANING[row.reason] ?? "Recorded as unreadable by the parser."}
            </p>
            {row.detail ? (
              <p className="mt-2 max-w-[80ch] truncate text-[11.5px] text-muted-foreground">
                For instance: {row.detail}
              </p>
            ) : null}
          </li>
        ))}
    </ul>
  );
}
