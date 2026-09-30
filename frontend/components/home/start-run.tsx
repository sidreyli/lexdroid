"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
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
import { listOf } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RunningRun } from "@/lib/data/ledger";
import { ClearSlate } from "./clear-slate";
import { EngineTarget, type Target } from "./engine-target";

export interface RunFormPillar {
  id: number;
  name: string;
  indicatorIds: string[];
}

export interface RunFormEngine {
  id: string;
  label: string;
  model: string;
  declared: boolean;
}

const ALL = "all";
/** How often the page asks whether a run is under way, including one started from a terminal. */
const POLL_MS = 5000;

export function StartRun({
  economies,
  pillars,
  engines,
  chosenEngine,
  readOnly = false,
}: {
  economies: { code: string; name: string }[];
  pillars: RunFormPillar[];
  engines: RunFormEngine[];
  chosenEngine: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([economies[0]?.code ?? ""]);
  const [pillar, setPillar] = useState<string>(ALL);
  // The indicators of the chosen pillar to answer. None picked is every one of them.
  const [only, setOnly] = useState<string[]>([]);
  const pillarIndicators = pillars.find((p) => String(p.id) === pillar)?.indicatorIds ?? [];
  const [engine, setEngine] = useState(chosenEngine);
  const [fetchNew, setFetchNew] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>("local");
  const [targetReady, setTargetReady] = useState<{ ready: boolean; why: string }>({ ready: false, why: "" });
  const onReady = useCallback((ready: boolean, why: string) => setTargetReady({ ready, why }), []);
  // The run a fleet is working on now. Only one runs at a time, so while there is one the button
  // waits for it, and offers to stop it instead.
  const [active, setActive] = useState<RunningRun | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [stopping, setStopping] = useState(false);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/runs/active", { cache: "no-store" });
      const body = (await res.json()) as { run: RunningRun | null };
      setActive(body.run);
      if (!body.run) setConfirmStop(false);
    } catch {
      // The server is restarting; the next poll will say.
    }
  }, []);

  useEffect(() => {
    if (readOnly) return;
    void check();
    const timer = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(timer);
  }, [check, readOnly]);

  const stop = async () => {
    if (!active) return;
    setStopping(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${active.id}/stop`, { method: "POST" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The run could not be stopped");
      setConfirmStop(false);
      await check();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStopping(false);
    }
  };

  const toggle = (code: string) => {
    setError(null);
    setPicked((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const chosen = engines.find((e) => e.id === engine);
  const ready = !readOnly && picked.length > 0 && !!chosen?.declared && targetReady.ready && !starting && !active;

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      // The choice is remembered, so a run started from the command line uses the same engine.
      await fetch("/api/engines", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: engine }),
      });
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          economies: picked,
          pillars: pillar === ALL ? undefined : [Number(pillar)],
          indicators: pillar === ALL || only.length === 0 ? undefined : only,
          engine,
          cacheOnly: !fetchNew,
          on: target,
        }),
      });
      const body = (await response.json()) as { runId?: string; error?: string };
      if (response.status === 409) await check();
      if (!response.ok || !body.runId) throw new Error(body.error ?? "The run did not start");
      router.push(`/runs/${body.runId}`);
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  };

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
                setOnly([]);
                setError(null);
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
            <Label className="text-[12.5px] font-medium text-navy-deep">Engine</Label>
            <Select
              value={engine}
              onValueChange={(v) => {
                setEngine(v);
                setError(null);
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-xl bg-inset text-[13.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {engines.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.label}
                    {e.declared ? `, ${e.model}` : ", not declared yet"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {pillarIndicators.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium text-navy-deep">Indicators</Label>
            <div className="flex flex-wrap gap-2">
              {pillarIndicators.map((id) => {
                const on = only.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setError(null);
                      setOnly((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
                    }}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full px-3 py-1 text-[12.5px] font-medium tabular-nums transition-all duration-150",
                      "focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:outline-none",
                      on
                        ? "bg-navy text-paper shadow-[0_2px_8px_-3px_rgb(23_50_78/0.5)]"
                        : "bg-inset text-muted-foreground hover:bg-edge hover:text-navy-deep",
                    )}
                  >
                    {id}
                  </button>
                );
              })}
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">
              {only.length === 0
                ? "None picked answers every indicator of the pillar."
                : `Only ${[...only].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(" and ")} will be read and scored.`}
            </p>
          </div>
        ) : null}

        {chosen?.declared && !readOnly ? (
          <div className="flex flex-col gap-2">
            <Label className="text-[12.5px] font-medium text-navy-deep">Runs on</Label>
            <EngineTarget engineId={engine} target={target} onTarget={setTarget} onReady={onReady} />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <Label className="text-[12.5px] font-medium text-navy-deep">Sources</Label>
          <div className="flex h-10 items-center justify-between rounded-xl bg-inset px-3.5">
            <span className="text-[13.5px] text-navy-deep">
              {fetchNew ? "Fetch new documents" : "Read only what is already on disk"}
            </span>
            <Switch
              checked={fetchNew}
              onCheckedChange={(v) => {
                setFetchNew(v);
                setError(null);
              }}
              aria-label="Fetch new documents"
            />
          </div>
          {fetchNew && !readOnly ? (
            <ClearSlate
              economies={picked}
              names={
                picked.length > 3
                  ? `${picked.length} economies`
                  : listOf(economies.filter((e) => picked.includes(e.code)).map((e) => e.name)) ||
                    "the picked economies"
              }
            />
          ) : null}
        </div>
      </div>

      {readOnly ? (
        <p className="mt-5 rounded-xl bg-ochre-soft px-3.5 py-3 text-[12.5px] leading-snug text-ochre">
          Runs need the persistent SQLite store and a long-lived worker, so they start from a local
          checkout rather than this hosted snapshot.
        </p>
      ) : chosen && !chosen.declared ? (
        <p className="mt-5 text-[12.5px] leading-snug text-muted-foreground">
          {chosen.label} has no provider, model or checkpoint declared yet, so nothing can run on it.
        </p>
      ) : null}
      {chosen?.declared && !targetReady.ready && targetReady.why ? (
        <p className="mt-5 text-[12.5px] leading-snug text-muted-foreground">{targetReady.why}.</p>
      ) : null}
      {error ? (
        <p className="mt-5 text-[12.5px] leading-snug text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {active ? (
        <div className="mt-6 flex flex-col gap-3 rounded-xl bg-inset px-3.5 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-[12.5px] leading-snug">
              <p className="font-medium text-navy-deep">
                A run is under way: {listOf(active.economies)},{" "}
                {active.indicators.length
                  ? active.indicators.join(", ")
                  : active.pillars.length === 12
                    ? "all pillars"
                    : `pillar${active.pillars.length > 1 ? "s" : ""} ${active.pillars.join(", ")}`}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                Started{" "}
                {new Date(active.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
                Another can start when it finishes or is stopped.
              </p>
            </div>
            <Link
              href={`/runs/${active.id}`}
              className="shrink-0 text-[12.5px] font-medium text-navy underline-offset-2 hover:underline"
            >
              Watch it
            </Link>
          </div>
          {confirmStop ? (
            <div className="flex flex-col gap-2">
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                Stop it? What it has answered stays recorded, and the run is marked cancelled. A
                rented GPU keeps running until you stop it under Runs on.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={stopping}
                  onClick={stop}
                  className="h-9 rounded-lg text-[13px]"
                >
                  {stopping ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-3.5" />}
                  {stopping ? "Stopping" : "Stop run"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={stopping}
                  onClick={() => setConfirmStop(false)}
                  className="h-9 rounded-lg text-[13px]"
                >
                  Keep it going
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmStop(true)}
              className="h-9 self-start rounded-lg text-[13px] text-destructive hover:text-destructive"
            >
              <Square className="size-3.5" />
              Stop run
            </Button>
          )}
        </div>
      ) : null}

      <Button
        type="button"
        disabled={!ready}
        onClick={start}
        className="mt-6 h-11 rounded-xl bg-navy text-[14px] font-medium text-paper shadow-[0_3px_12px_-4px_rgb(23_50_78/0.55)] hover:bg-navy-deep"
      >
        {starting || active ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {readOnly ? "Available locally" : active ? "Run in progress" : starting ? "Starting" : "Start run"}
      </Button>
    </section>
  );
}
