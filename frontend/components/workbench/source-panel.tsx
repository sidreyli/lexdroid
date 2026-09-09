"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Quote, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ExportRow } from "@/lib/data/types";

interface Span {
  start: number | null;
  end: number | null;
}

/** Reads a selection back as absolute document offsets using the base each span carries. */
function offsetsFromSelection(host: HTMLElement): Span | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!host.contains(range.commonAncestorContainer)) return null;

  const base = (node: Node | null): number | null => {
    let el = node instanceof Element ? node : node?.parentElement;
    while (el && el !== host) {
      const off = el.getAttribute("data-off");
      if (off !== null) return Number(off);
      el = el.parentElement;
    }
    return null;
  };

  const a = base(range.startContainer);
  const b = base(range.endContainer);
  if (a === null || b === null) return null;
  const start = a + range.startOffset;
  const end = b + range.endOffset;
  return end > start ? { start, end } : null;
}

export function SourcePanel({
  row,
  quote,
  onCite,
}: {
  row: ExportRow;
  quote: Span;
  onCite: (span: Span, text: string) => void;
}) {
  const [wide, setWide] = useState(false);
  const [picked, setPicked] = useState<{ span: Span; text: string } | null>(null);
  const host = useRef<HTMLDivElement>(null);

  const view = useMemo(
    () =>
      wide && row.context
        ? { text: row.context.text, base: row.context.offset }
        : row.sectionText !== null && row.sectionCharStart !== null
          ? { text: row.sectionText, base: row.sectionCharStart }
          : null,
    [wide, row.context, row.sectionText, row.sectionCharStart],
  );

  const readSelection = useCallback(() => {
    if (!host.current || !view) return;
    const span = offsetsFromSelection(host.current);
    if (!span || span.start === null || span.end === null) {
      setPicked(null);
      return;
    }
    const text = view.text.slice(span.start - view.base, span.end - view.base);
    setPicked(text.trim() ? { span, text } : null);
  }, [view]);

  useEffect(() => {
    const handler = () => readSelection();
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, [readSelection]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-6 pt-6 pb-4 sm:px-8">
        <div className="flex flex-wrap items-center gap-2">
          {row.instrumentStatus ? (
            <StatusPill status={row.instrumentStatus} basis={row.statusBasis} />
          ) : null}
          {row.instrumentKind ? (
            <span className="rounded-full bg-inset px-2.5 py-0.5 text-[11.5px] font-medium text-muted-foreground">
              {row.instrumentKind}
            </span>
          ) : null}
          {row.instrumentLanguage ? (
            <span className="rounded-full bg-inset px-2.5 py-0.5 text-[11.5px] font-medium text-muted-foreground">
              {row.instrumentLanguage === "en" ? "English" : row.instrumentLanguage}
            </span>
          ) : null}
        </div>

        <h2 className="mt-3 text-[20px] leading-tight font-semibold tracking-tight text-navy-deep">
          {row.lawName}
        </h2>

        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
          {row.officialNumber ? <span className="tnum">{row.officialNumber}</span> : null}
          {!row.commencedOn && !row.lastAmendedOn && row.lastAmended ? (
            <span>{row.lastAmended}</span>
          ) : null}
          {row.commencedOn || row.lastAmendedOn ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="tnum cursor-help underline decoration-edge decoration-dotted underline-offset-4">
                  {row.commencedOn ? `In force ${row.commencedOn}` : ""}
                  {row.lastAmendedOn ? `, amended ${row.lastAmendedOn}` : ""}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[26rem] text-[12px] leading-relaxed">
                {row.timeframeBasis ?? "No basis recorded for these dates."}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {row.headingPath ? (
          <p className="mt-3 text-[13px] leading-snug text-navy">{row.headingPath}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {row.sourceUrl ? (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg bg-inset px-3 text-[12.5px] font-medium text-navy hover:bg-edge"
            >
              <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                Open at the source
              </a>
            </Button>
          ) : null}
          {row.context && row.sectionText ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setWide((w) => !w);
                setPicked(null);
              }}
              aria-pressed={wide}
              className={cn(
                "h-8 rounded-lg px-3 text-[12.5px] font-medium",
                wide ? "bg-navy/10 text-navy" : "text-muted-foreground hover:bg-inset",
              )}
            >
              <ScanText className="size-3.5" />
              {wide ? "Just the provision" : "More of the document"}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8">
        {view ? (
          <div className="inset-surface rounded-2xl p-5 sm:p-6">
            {wide && row.context?.truncatedStart ? <Ellipsis /> : null}
            <div
              ref={host}
              onMouseUp={readSelection}
              onKeyUp={readSelection}
              className="text-[14px] leading-[1.75] whitespace-pre-wrap text-ink selection:bg-navy/15"
            >
              <Marked text={view.text} base={view.base} quote={quote} />
            </div>
            {wide && row.context?.truncatedEnd ? <Ellipsis /> : null}
          </div>
        ) : (
          <div className="inset-surface rounded-2xl p-6">
            <p className="text-[13.5px] leading-relaxed text-navy-deep">
              No provision is cited. The reader found nothing in this instrument that
              answers the indicator, so the finding rests on the search itself.
            </p>

          </div>
        )}
      </div>

      {picked ? (
        <div className="shrink-0 border-t border-edge bg-card px-6 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <Quote className="size-4 shrink-0 text-ochre" />
            <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
              {picked.text.replace(/\s+/g, " ").trim()}
            </p>
            <span className="tnum shrink-0 text-[11.5px] text-muted-foreground">
              {picked.span.start} to {picked.span.end}
            </span>
            <Button
              size="sm"
              onClick={() => {
                onCite(picked.span, picked.text);
                window.getSelection()?.removeAllRanges();
                setPicked(null);
              }}
              className="h-8 shrink-0 rounded-lg px-3 text-[12.5px]"
            >
              Cite this
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Ellipsis() {
  return <p className="mb-3 text-[13px] text-muted-foreground/70">...</p>;
}

/** Three text nodes, each carrying the document offset it starts at. */
function Marked({
  text,
  base,
  quote,
}: {
  text: string;
  base: number;
  quote: Span;
}) {
  const s = quote.start === null ? -1 : quote.start - base;
  const e = quote.end === null ? -1 : quote.end - base;
  const ok = s >= 0 && e > s && e <= text.length;

  if (!ok) {
    return <span data-off={base}>{text}</span>;
  }

  return (
    <>
      <span data-off={base}>{text.slice(0, s)}</span>
      <mark
        data-off={base + s}
        className="rounded-[5px] bg-ochre-soft px-0.5 py-[1px] text-ink shadow-[inset_0_-1px_0_var(--ochre)]"
      >
        {text.slice(s, e)}
      </mark>
      <span data-off={base + e}>{text.slice(e)}</span>
    </>
  );
}

function StatusPill({ status, basis }: { status: string; basis: string | null }) {
  const settled = status === "in-force";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "cursor-help rounded-full px-2.5 py-0.5 text-[11.5px] font-medium",
            settled ? "bg-navy/10 text-navy" : "bg-ochre-soft text-ochre",
          )}
        >
          {settled ? "In force" : status}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[26rem] text-[12px] leading-relaxed">
        {basis ?? "No basis recorded for this status."}
      </TooltipContent>
    </Tooltip>
  );
}
