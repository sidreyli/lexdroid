import Link from "next/link";
import { extractionName, humanize, languageName } from "@/lib/format";
import type { CorpusEconomy } from "@/lib/data/corpus";
import type { Economy } from "@/lib/data/types";

/**
 * What actually differs between the jurisdictions. The profiles are long and mostly
 * agree; this is the short column where they do not.
 */
export interface Column {
  economy: Economy;
  corpus: CorpusEconomy | undefined;
}

const num = (n: number) => n.toLocaleString("en-GB");

function rows(columns: Column[]): { label: string; values: string[] }[] {
  return [
    {
      label: "Legal tradition",
      values: columns.map((c) => humanize(c.economy.legalSystem.family)),
    },
    {
      label: "Official languages",
      values: columns.map((c) => c.economy.officialLanguages.map(languageName).join(", ")),
    },
    {
      label: "Source portals declared",
      values: columns.map((c) => num(c.economy.portals.length)),
    },
    {
      label: "Portals a run can walk",
      values: columns.map(
        (c) => `${c.economy.portals.filter((p) => p.adapter).length} of ${c.economy.portals.length}`,
      ),
    },
    {
      label: "Instruments registered",
      values: columns.map((c) => num(c.corpus?.registered ?? 0)),
    },
    {
      label: "Instruments fetched",
      values: columns.map((c) => num(c.corpus?.fetched ?? 0)),
    },
    {
      label: "Sections indexed",
      values: columns.map((c) => num(c.corpus?.sections ?? 0)),
    },
    {
      label: "Text recovered from",
      values: columns.map((c) => {
        const main = (c.corpus?.extractions ?? []).filter((e) => e.extraction !== "none");
        return main.length ? main.map((e) => extractionName(e.extraction)).join(", ") : "Nothing fetched yet";
      }),
    },
  ];
}

export function Comparison({ columns }: { columns: Column[] }) {
  const template = {
    gridTemplateColumns: `minmax(9rem, 1.1fr) repeat(${columns.length}, minmax(0, 1fr))`,
  };
  // Wide enough per economy that a name wraps at most once; past that the table scrolls under a
  // pinned label column instead of squeezing nine columns into one-word lines.
  const minWidth = `${9 + columns.length * 6}rem`;

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth }}>
        <div className="grid items-end gap-x-5 pb-3" style={template}>
          <span className="sticky left-0 z-10 self-stretch bg-card" />
          {columns.map((c) => (
            <Link
              key={c.economy.code}
              href={`/economies/${c.economy.code.toLowerCase()}`}
              className="group"
            >
              <span className="block text-[15px] leading-tight font-semibold tracking-tight text-navy-deep group-hover:underline group-hover:underline-offset-4">
                {c.economy.name}
              </span>
              <span className="tnum block text-[12px] text-muted-foreground">
                {c.economy.code}
              </span>
            </Link>
          ))}
        </div>

        {rows(columns).map((row) => (
          <div
            key={row.label}
            className="grid gap-x-5 border-t border-edge py-2.5"
            style={template}
          >
            <span className="sticky left-0 z-10 bg-card text-[12.5px] text-muted-foreground">
              {row.label}
            </span>
            {row.values.map((value, i) => (
              <span
                key={columns[i]?.economy.code ?? i}
                className="tnum text-[13.5px] break-words text-navy-deep"
              >
                {value}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
