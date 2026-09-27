"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { ExportRow, Indicator } from "@/lib/data/types";
import type { FindingEdit } from "@/lib/review";
import { DecisionBar } from "./decision-bar";
import { FindingPanel } from "./finding-panel";
import { SourcePanel } from "./source-panel";

function baseline(row: ExportRow): FindingEdit {
  return {
    article: row.article,
    locationReference: row.locationReference,
    verbatimSnippet: row.verbatimSnippet,
    quoteCharStart: row.quoteCharStart,
    quoteCharEnd: row.quoteCharEnd,
    score: row.score,
    bandOrdinal: row.bandOrdinal,
    bandCriterion: row.bandCriterion,
    mappingRationale: row.mappingRationale,
    notes: row.notes,
  };
}

function useWide() {
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return wide;
}

export function FindingView({
  row,
  indicator,
  economyName,
  position,
  total,
  prevId,
  nextId,
  readOnly = false,
}: {
  row: ExportRow;
  indicator: Indicator | undefined;
  economyName: string;
  position: number;
  total: number;
  prevId: number | null;
  nextId: number | null;
  readOnly?: boolean;
}) {
  const base = baseline(row);
  const [draft, setDraft] = useState<FindingEdit>(base);
  const [editing, setEditing] = useState(false);
  const wide = useWide();
  const router = useRouter();

  const patch = useCallback(
    (next: Partial<FindingEdit>) => setDraft((d) => ({ ...d, ...next })),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "j" && nextId) router.push(`/workbench/${nextId}`);
      if (e.key === "k" && prevId) router.push(`/workbench/${prevId}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nextId, prevId, router]);

  const source = (
    <SourcePanel
      row={row}
      quote={{ start: draft.quoteCharStart, end: draft.quoteCharEnd }}
      onCite={(span, text) => {
        if (readOnly) return;
        patch({
          quoteCharStart: span.start,
          quoteCharEnd: span.end,
          verbatimSnippet: text.replace(/\s+/g, " ").trim(),
        });
        setEditing(true);
      }}
    />
  );

  const finding = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FindingPanel
          row={row}
          indicator={indicator}
          economyName={economyName}
          draft={draft}
          patch={patch}
          editing={editing}
        />
      </div>
      <DecisionBar
        rowId={row.id}
        baseline={base}
        draft={draft}
        editing={editing}
        setEditing={setEditing}
        nextHref={nextId ? `/workbench/${nextId}` : null}
        readOnly={readOnly}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-edge px-5 py-1.5 sm:px-6">
        <p className="tnum text-[12px] text-muted-foreground">
          Finding {position} of {total}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Step href={prevId ? `/workbench/${prevId}` : null} label="Previous finding">
            <ChevronLeft className="size-4" />
          </Step>
          <Step href={nextId ? `/workbench/${nextId}` : null} label="Next finding">
            <ChevronRight className="size-4" />
          </Step>
        </div>
      </div>

      <ResizablePanelGroup
        orientation={wide ? "horizontal" : "vertical"}
        className="min-h-0 flex-1"
      >
        <ResizablePanel defaultSize="53%" minSize="28%" className="min-h-0">
          {source}
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="bg-edge transition-colors hover:bg-slate-soft"
        />
        <ResizablePanel defaultSize="47%" minSize="28%" className="min-h-0 bg-card">
          {finding}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Step({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const style = cn(
    "grid size-7 place-items-center rounded-lg transition-colors",
    href ? "text-muted-foreground hover:bg-inset hover:text-navy-deep" : "text-edge",
  );
  if (!href) {
    return (
      <span className={style} aria-hidden>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} aria-label={label} className={style}>
      {children}
    </Link>
  );
}
