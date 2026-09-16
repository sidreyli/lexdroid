"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { citation, whyUnread } from "@/lib/runs/progress";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RunEvent } from "@/lib/data/types";

type View = "all" | "unread" | "decisions";

interface Line {
  id: number;
  at: string;
  lead: string;
  subject: string;
  detail: string;
  title: string;
  unread: boolean;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Every stage says what it did in words an analyst reads, not in the words the code uses. */
function line(e: RunEvent): Line | null {
  const where = e.indicatorId ?? (e.pillarId ? `pillar ${e.pillarId}` : "");
  const cite = citation(e.subject);
  const base = { id: e.id, at: e.at, title: e.detail ?? "", unread: false };

  if (e.kind === "refused" || e.kind === "failed") {
    return {
      ...base,
      lead: where,
      subject: cite.section || cite.instrument,
      detail: whyUnread(e.detail ?? ""),
      unread: true,
    };
  }
  if (e.stage === "read") {
    return { ...base, lead: where, subject: cite.section || cite.instrument, detail: cite.instrument };
  }
  if (e.stage === "decide") {
    const m = /score\s+([\d.]+)\s*\[([a-z-]+)\]/i.exec(e.detail ?? "");
    if (!m) return null;
    const settled =
      m[2] === "restricted"
        ? "a measure was found"
        : m[2] === "no-restriction"
          ? "the law imposes none"
          : "the search did not settle it";
    return { ...base, lead: where, subject: `Scored ${m[1]}`, detail: settled };
  }
  if (e.stage === "retrieve") {
    const m = /(\d+) of (\d+)/.exec(e.detail ?? "");
    return {
      ...base,
      lead: where,
      subject: "Searched the corpus",
      detail: m ? `kept ${m[1]} provisions of ${m[2]} surfaced` : (e.detail ?? ""),
    };
  }
  if (e.stage === "run") {
    return {
      ...base,
      lead: "",
      subject: e.kind === "started" ? "Pillar opened" : "Pillar finished",
      detail: e.detail ?? "",
    };
  }
  // Building the corpus, and making the answers submittable. These are the longest parts of a cold
  // run and used to say nothing at all, because the ledger only knew the stages between them.
  const PHASE: Record<string, [string, string]> = {
    discover: ["Read the official portals", "Looked for what this economy publishes"],
    fetch: ["Downloaded the law", "Fetched and parsed what the questions asked for"],
    index: ["Indexed the new provisions", "Made them reachable by search"],
    confirm: ["Checked each finding again", "Asked whether the provision really says it"],
    export: ["Built the evidence rows", "One row per provision, ready to review"],
    verify: ["Checked every row", "Quote, citation, link and score, without a model"],
  };
  const phase = PHASE[e.stage];
  if (phase) {
    return {
      ...base,
      lead: e.economy ?? "",
      subject: e.kind === "started" ? `${phase[0]}…` : phase[0],
      detail: e.detail ?? phase[1],
    };
  }
  return null;
}

export function Ledger({ events }: { events: RunEvent[] }) {
  const [view, setView] = useState<View>("all");
  // What was already on screen when the page opened. Anything past it arrived while watching.
  const [known] = useState(() => events.at(-1)?.id ?? 0);

  const lines = useMemo(() => {
    const all = events.map(line).filter((l): l is Line => l !== null);
    const shown =
      view === "unread"
        ? all.filter((l) => l.unread)
        : view === "decisions"
          ? all.filter((l) => l.subject.startsWith("Scored"))
          : all;
    return shown.reverse().slice(0, 200);
  }, [events, view]);

  const unreadCount = useMemo(() => events.filter((e) => e.kind === "refused" || e.kind === "failed").length, [events]);

  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">Everything it said</h2>
          <p className="mt-0.5 max-w-[68ch] text-[13px] leading-snug text-muted-foreground">
            Each provision the run read, each cell it settled, and each provision it could not read.
          </p>
        </div>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as View)}
          variant="outline"
          size="sm"
          className="shrink-0"
        >
          <ToggleGroupItem value="all" className="px-3 text-[12.5px]">
            Everything
          </ToggleGroupItem>
          <ToggleGroupItem value="decisions" className="px-3 text-[12.5px]">
            Cells settled
          </ToggleGroupItem>
          <ToggleGroupItem value="unread" className="px-3 text-[12.5px]">
            Went unread
            {unreadCount > 0 ? <span className="tnum ml-1.5 text-brick">{unreadCount}</span> : null}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="inset-surface mt-5 max-h-[26rem] overflow-y-auto rounded-2xl">
        {lines.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
            {view === "unread"
              ? "Every provision the run reached was read."
              : "Nothing recorded yet."}
          </p>
        ) : (
          <ul className="divide-y divide-edge/70">
            {lines.map((l) => (
              <li
                key={l.id}
                className={cn(
                  "grid grid-cols-[4.5rem_3.2rem_1fr] items-baseline gap-x-3 px-4 py-2.5 sm:grid-cols-[5rem_3.5rem_1fr]",
                  l.id > known && "motion-safe:animate-in motion-safe:fade-in",
                )}
              >
                <span className="tnum text-[11.5px] leading-tight text-muted-foreground/80">
                  {clock(l.at)}
                </span>
                <span className="tnum text-[12px] leading-tight font-medium text-navy">{l.lead}</span>
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block truncate text-[13px] leading-tight",
                      l.unread ? "font-medium text-brick" : "text-navy-deep",
                    )}
                    title={l.title || undefined}
                  >
                    {l.subject}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted-foreground">
                    {l.detail}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
