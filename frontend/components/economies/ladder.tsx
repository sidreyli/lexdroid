import type { InstrumentType } from "@/lib/data/types";

/**
 * The hierarchy an economy's law is published in, drawn as it ranks. A citation is only
 * as good as the rung it came from, so the rung is the thing this page has to make legible.
 */
const BINDING: Record<string, { label: string; rule: string; dot: string }> = {
  binding: { label: "Binding", rule: "bg-navy", dot: "bg-navy" },
  "binding-on-licensees": { label: "Binding on licensees", rule: "bg-ochre", dot: "bg-ochre" },
  advisory: { label: "Advisory", rule: "bg-slate-soft", dot: "bg-slate-soft" },
};

const INDENT = ["ml-0", "ml-3", "ml-6", "ml-9", "ml-12"];

export function InstrumentLadder({
  types,
  counts,
}: {
  types: InstrumentType[];
  counts: Map<string, number>;
}) {
  const ranked = [...types].sort((a, b) => a.rank - b.rank);

  return (
    <ol className="flex flex-col gap-2.5">
      {ranked.map((type, i) => {
        const binding = BINDING[type.bindingness] ?? BINDING["advisory"]!;
        const registered = counts.get(type.kind) ?? 0;
        return (
          <li
            key={type.kind}
            className={`${INDENT[i] ?? "ml-12"} inset-surface flex gap-3.5 rounded-2xl p-4 pl-3.5`}
          >
            <span className={`mt-0.5 w-[3px] shrink-0 rounded-full ${binding.rule}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="tnum text-[12px] text-muted-foreground">Rank {type.rank}</span>
                <span className="text-[14.5px] font-semibold tracking-tight text-navy-deep">
                  {type.localName}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  <span className={`size-1.5 rounded-full ${binding.dot}`} aria-hidden />
                  {binding.label}
                </span>
                <span className="tnum ml-auto text-[12.5px] text-muted-foreground">
                  {registered.toLocaleString("en-GB")} registered
                </span>
              </div>
              <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-muted-foreground">
                {type.note}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
