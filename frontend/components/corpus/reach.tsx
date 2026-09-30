import Link from "next/link";
import type { CorpusEconomy } from "@/lib/data/corpus";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Registering an instrument is cheap; reading one is not. The bar is the register, and the
 * filled part is what has actually been fetched, so the distance between them is the honest number.
 */
const num = (n: number) => n.toLocaleString("en-GB");

function share(part: number, whole: number): string {
  if (!whole) return "0%";
  const pct = (part / whole) * 100;
  return pct < 1 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

export function Reach({
  economies,
  names,
}: {
  economies: CorpusEconomy[];
  names: Map<string, string>;
}) {
  return (
    // Now that the bars run the card's full width, several economies share it two to a row.
    <div className={cn("grid gap-x-10 gap-y-5", economies.length > 1 && "lg:grid-cols-2")}>
      {economies.map((e) => {
        const width = e.registered ? Math.max(0.4, (e.fetched / e.registered) * 100) : 0;
        return (
          <div key={e.code}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <Link
                href={`/economies/${e.code.toLowerCase()}`}
                className="text-[14.5px] font-medium text-navy-deep underline-offset-4 hover:underline"
              >
                {names.get(e.code) ?? e.code}
              </Link>
              <span className="tnum text-[12.5px] text-muted-foreground">
                {num(e.fetched)} of {num(e.registered)} instruments fetched, {share(e.fetched, e.registered)}
              </span>
            </div>
            <div
              className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-edge"
              role="img"
              aria-label={`${num(e.fetched)} of ${num(e.registered)} instruments fetched`}
            >
              <div className="h-full rounded-full bg-navy" style={{ width: `${width}%` }} />
            </div>
            <p className="tnum mt-1.5 text-[12px] text-muted-foreground">
              {num(e.documents)} documents, {num(e.sections)} sections, all of them searchable by
              meaning
            </p>
          </div>
        );
      })}
    </div>
  );
}

const TIER: { match: (kind: string) => boolean; className: string }[] = [
  { match: (k) => k === "act", className: "bg-navy-deep" },
  { match: (k) => k === "regulation", className: "bg-navy" },
  { match: (k) => k === "order", className: "bg-navy/70" },
  { match: (k) => k === "rule", className: "bg-navy/45" },
  { match: (k) => k === "notice", className: "bg-ochre" },
  { match: (k) => k === "guideline", className: "bg-slate-soft" },
];

function tint(kind: string): string {
  return TIER.find((t) => t.match(kind))?.className ?? "bg-edge";
}

/** The shape of the register: how much of it creates obligations and how much explains them. */
export function Composition({
  economies,
  names,
}: {
  economies: CorpusEconomy[];
  names: Map<string, string>;
}) {
  return (
    <div className="flex flex-col gap-5">
      {economies.map((e) => (
        <div key={e.code}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="text-[14.5px] font-medium text-navy-deep">
              {names.get(e.code) ?? e.code}
            </span>
            <span className="tnum text-[12.5px] text-muted-foreground">
              {num(e.inForce)} recorded as in force
            </span>
          </div>
          <div className="mt-2 flex h-2.5 w-full overflow-hidden rounded-full bg-inset">
            {e.kinds.map((k) => (
              <span
                key={k.kind}
                className={tint(k.kind)}
                style={{ width: `${(k.count / e.registered) * 100}%` }}
                title={`${humanize(k.kind)}: ${num(k.count)}`}
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {e.kinds.map((k) => (
              <li
                key={k.kind}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground"
              >
                <span className={`size-2 rounded-[3px] ${tint(k.kind)}`} aria-hidden />
                <span className="tnum">
                  {humanize(k.kind)} {num(k.count)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
