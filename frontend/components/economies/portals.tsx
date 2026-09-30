import { ExternalLink } from "lucide-react";
import type { Portal } from "@/lib/data/types";
import { humanize } from "@/lib/format";

/** Reads a pillar list the way a person would say it. */
function servesPillars(pillars: number[] | undefined): string {
  if (!pillars || pillars.length === 0) return "No pillar assigned yet";
  if (pillars.length === 12) return "All twelve pillars";
  if (pillars.length === 1) return `Pillar ${pillars[0]}`;
  const head = pillars.slice(0, -1).join(", ");
  return `Pillars ${head} and ${pillars.at(-1)}`;
}

export function PortalList({ portals }: { portals: Portal[] }) {
  const withAdapter = portals.filter((p) => p.adapter).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-[78ch] text-[13.5px] leading-relaxed text-muted-foreground">
        {withAdapter} of {portals.length} can be enumerated by a run. The rest are declared because
        they publish law this index measures, but nothing walks them yet, so an instrument only
        reaches the register from one of them if another document cites it.
      </p>

      <ul className="flex flex-col gap-2">
        {portals.map((portal) => (
          <li
            key={portal.url}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-2xl border border-edge px-4 py-3"
          >
            <a
              href={portal.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[14px] font-medium text-navy-deep underline-offset-4 hover:underline"
            >
              {portal.name}
              <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
            </a>
            <span className="text-[12.5px] text-muted-foreground">{humanize(portal.kind)}</span>
            <span className="ml-auto text-[12.5px] text-muted-foreground">
              {servesPillars(portal.pillars)}
            </span>
            <div className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-1">
              {portal.authority ? (
                <span className="text-[12.5px] text-muted-foreground">{portal.authority}</span>
              ) : null}
              <span
                className={
                  portal.adapter
                    ? "text-[12px] text-muted-foreground"
                    : "text-[12px] font-medium text-ochre"
                }
              >
                {portal.adapter ? `Walked by the ${portal.adapter} adapter` : "No adapter yet"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Commitments({
  commitments,
}: {
  commitments: { name: string; status?: string; sourceUrl?: string }[];
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {commitments.map((c) => (
        <li key={c.name} className="flex flex-wrap items-baseline gap-x-2.5 text-[13.5px]">
          {c.sourceUrl ? (
            <a
              href={c.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="text-navy-deep underline-offset-4 hover:underline"
            >
              {c.name}
            </a>
          ) : (
            <span className="text-navy-deep">{c.name}</span>
          )}
          {c.status ? (
            <span className="text-[12px] text-muted-foreground">{humanize(c.status)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
