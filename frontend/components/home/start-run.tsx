"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface RunFormPillar {
  id: number;
  name: string;
  indicatorIds: string[];
}

const ALL = "all";

export function StartRun({
  economies,
  pillars,
}: {
  economies: { code: string; name: string }[];
  pillars: RunFormPillar[];
}) {
  const [picked, setPicked] = useState<string[]>([economies[0]?.code ?? ""]);
  const [pillar, setPillar] = useState<string>(ALL);
  const [indicator, setIndicator] = useState<string>(ALL);
  const [engine, setEngine] = useState("engine-a");
  const [fetchNew, setFetchNew] = useState(true);
  const [queued, setQueued] = useState(false);
  const [copied, setCopied] = useState(false);

  const indicators = useMemo(
    () => pillars.find((p) => String(p.id) === pillar)?.indicatorIds ?? [],
    [pillar, pillars],
  );

  const toggle = (code: string) => {
    setQueued(false);
    setPicked((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const scopeLabel =
    indicator !== ALL
      ? `indicator ${indicator}`
      : pillar !== ALL
        ? `pillar ${pillar}`
        : "all 12 pillars";

  const command = [
    "npm run -w backend fleet --",
    `--economies ${picked.join(",") || "none"}`,
    indicator !== ALL ? `--indicator ${indicator}` : pillar !== ALL ? `--pillars ${pillar}` : "",
    `--engine ${engine}`,
    fetchNew ? "" : "--cache-only",
  ]
    .filter(Boolean)
    .join(" ");

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const ready = picked.length > 0;

  return (
    <section className="bg-card lift flex flex-col rounded-3xl p-6 sm:p-7">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">Start a run</h2>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          Pick what to answer and which engine answers it.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label className="text-[12.5px] font-medium text-navy-deep">Economies</Label>
          <div className="flex flex-wrap gap-2">
            {economies.map((e) => {
              const on = picked.includes(e.code);
              return (
                <button
                  key={e.code}
                  type="button"
                  onClick={() => toggle(e.code)}
                  aria-pressed={on}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all duration-150",
                    "focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:outline-none",
                    on
                      ? "bg-navy text-paper shadow-[0_2px_8px_-3px_rgb(23_50_78/0.5)]"
                      : "bg-inset text-muted-foreground hover:bg-edge hover:text-navy-deep",
                  )}
                >
                  {e.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium text-navy-deep">Pillar</Label>
            <Select
              value={pillar}
              onValueChange={(v) => {
                setPillar(v);
                setIndicator(ALL);
                setQueued(false);
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-xl bg-inset text-[13.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value={ALL}>All 12 pillars</SelectItem>
                {pillars.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.id}. {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label
              className={cn(
                "text-[12.5px] font-medium transition-colors",
                pillar === ALL ? "text-muted-foreground" : "text-navy-deep",
              )}
            >
              Indicator
            </Label>
            <Select
              value={indicator}
              onValueChange={(v) => {
                setIndicator(v);
                setQueued(false);
              }}
              disabled={pillar === ALL}
            >
              <SelectTrigger className="h-10 w-full rounded-xl bg-inset text-[13.5px]">
                <SelectValue placeholder="Every indicator" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value={ALL}>Every indicator in the pillar</SelectItem>
                {indicators.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium text-navy-deep">Engine</Label>
            <Select
              value={engine}
              onValueChange={(v) => {
                setEngine(v);
                setQueued(false);
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-xl bg-inset text-[13.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="engine-a">Engine A, gemma4-lex-16k</SelectItem>
                <SelectItem value="engine-b">Engine B, second reader</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium text-navy-deep">Sources</Label>
            <div className="flex h-10 items-center justify-between rounded-xl bg-inset px-3.5">
              <span className="text-[13.5px] text-navy-deep">
                {fetchNew ? "Fetch new documents" : "Use cached documents"}
              </span>
              <Switch
                checked={fetchNew}
                onCheckedChange={(v) => {
                  setFetchNew(v);
                  setQueued(false);
                }}
                aria-label="Fetch new documents"
              />
            </div>
          </div>
        </div>
      </div>

      {queued ? (
        <div className="mt-6 rounded-2xl bg-inset p-4">
          <p className="text-[13.5px] leading-relaxed text-navy-deep">
            Reads{" "}
            <span className="font-medium">
              {picked
                .map((c) => economies.find((e) => e.code === c)?.name ?? c)
                .join(", ")}
            </span>{" "}
            against <span className="font-medium">{scopeLabel}</span> with{" "}
            <span className="font-medium">{engine === "engine-a" ? "Engine A" : "Engine B"}</span>,{" "}
            {fetchNew ? "fetching what is missing" : "reading only what is already on disk"}.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-card p-2 pl-3">
            <code className="flex-1 py-1 text-[12px] leading-relaxed break-words text-muted-foreground">
              {command}
            </code>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={copy}
              className="h-8 shrink-0 rounded-lg px-2.5 text-[12.5px]"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Runs are started from the command line until the backend accepts them from here.
            </p>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setQueued(false)}
              className="h-8 shrink-0 rounded-lg px-2.5 text-[12.5px]"
            >
              <RotateCcw className="size-3.5" />
              Change
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          disabled={!ready}
          onClick={() => setQueued(true)}
          className="mt-6 h-11 rounded-xl bg-navy text-[14px] font-medium text-paper shadow-[0_3px_12px_-4px_rgb(23_50_78/0.55)] hover:bg-navy-deep"
        >
          <Play className="size-4" />
          Start run
        </Button>
      )}
    </section>
  );
}
