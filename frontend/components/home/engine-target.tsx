"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Cpu, Loader2, Power, Square, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/** What `backend/scripts/gpu.ts status` prints, as far as this panel reads it. */
interface LocalState {
  host: string;
  up: boolean;
  version: string;
  pulled: boolean;
  built: boolean;
  loaded: boolean;
  fits: boolean;
  needsGb: number;
  progress: { stage: string; detail: string; fraction: number | null; at: string } | null;
}
interface PodState {
  id: string;
  gpu: string;
  usdPerHour: number;
  spentUsd: number;
  status: { stage: string; detail: string; progress: number | null; gpu: string };
}
interface Offer {
  gpu: string;
  memoryGb: number;
  usdPerHour: number;
  cloud: "COMMUNITY" | "SECURE";
}
interface EngineState {
  id: string;
  label: string;
  model: string;
  checkpoint: string;
  local: LocalState | null;
  rented: {
    minGpuMemoryGb: number;
    maxUsdPerHour?: number;
    maxPods: number;
    pods: PodState[];
    offers?: Offer[];
    error: string | null;
  } | null;
}
interface GpuStatus {
  gpu: { name: string; memoryGb: number } | null;
  engines: EngineState[];
}

export type Target = "local" | "runpod";

const POLL_MS = 5_000;
const LOADING = new Set(["starting", "pulling", "building", "loading"]);

function gpuName(id: string): string {
  return id.replace(/^NVIDIA (GeForce )?/, "");
}

/**
 * Where the chosen engine runs, whether it is ready there, and the buttons that make it ready:
 * load it into this machine's GPU, or rent one and let the pod load it.
 */
export function EngineTarget({
  engineId,
  target,
  onTarget,
  onReady,
}: {
  engineId: string;
  target: Target;
  onTarget: (t: Target) => void;
  onReady: (ready: boolean, why: string) => void;
}) {
  const [status, setStatus] = useState<GpuStatus | null>(null);
  const [offers, setOffers] = useState<Record<string, Offer[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** How many GPUs the engine should read on. Only ever raised by the user, never by a poll. */
  const [want, setWant] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async (withOffers = false) => {
    try {
      const res = await fetch(`/api/gpu${withOffers ? "?offers=1" : ""}`, { cache: "no-store" });
      const body = (await res.json()) as GpuStatus & { error?: string };
      if (!alive.current) return;
      if (!res.ok) throw new Error(body.error ?? "Could not read the engines' state");
      setStatus(body);
      if (withOffers) {
        setOffers(Object.fromEntries(body.engines.map((e) => [e.id, e.rented?.offers ?? []])));
      }
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void refresh(true);
    const timer = setInterval(() => void refresh(false), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  const engine = status?.engines.find((e) => e.id === engineId);
  const local = engine?.local ?? null;
  const rented = engine?.rented ?? null;
  const pods = rented?.pods ?? [];
  const ready = pods.filter((p) => p.status.stage === "ready");
  const failed = pods.filter((p) => p.status.stage === "failed");
  const count = want ?? Math.max(1, pods.length);
  const hourly = pods.reduce((t, p) => t + p.usdPerHour, 0);
  const spent = pods.reduce((t, p) => t + p.spentUsd, 0);
  const localLoading = !!local?.progress && LOADING.has(local.progress.stage) && !local.loaded;

  // An engine that cannot run here is run where it can, without the user having to find that out.
  useEffect(() => {
    if (!engine) return;
    if (target === "local" && (!local || !local.fits) && rented) onTarget("runpod");
    if (target === "runpod" && !rented && local) onTarget("local");
  }, [engine, local, rented, target, onTarget]);

  useEffect(() => {
    if (!engine) return onReady(false, "Reading the engines' state");
    if (target === "local") {
      if (!local?.up) return onReady(false, "Ollama is not running on this machine");
      if (!local.loaded) return onReady(false, `Load ${engine.model} before starting`);
      return onReady(true, "");
    }
    if (pods.length === 0) return onReady(false, "Rent a GPU for this engine before starting");
    if (failed.length > 0) return onReady(false, "A rented GPU could not load the engine. Stop it, then start");
    if (count > pods.length) {
      return onReady(false, `${pods.length} of the ${count} GPUs picked are rented; rent the rest or pick ${pods.length}`);
    }
    if (ready.length < pods.length) {
      return onReady(false, `${ready.length} of ${pods.length} rented GPUs ready; the run starts when all are`);
    }
    return onReady(true, "");
  }, [engine, local, pods.length, ready.length, failed.length, count, target, onReady]);

  const act = async (action: "load" | "unload" | "start" | "stop", extra: { pods?: number; pod?: string } = {}) => {
    setBusy(extra.pod ? `stop:${extra.pod}` : action);
    setError(null);
    try {
      const res = await fetch("/api/gpu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, engine: engineId, ...extra }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; shortfall?: string | null };
      if (!res.ok || body.ok === false) throw new Error(body.error ?? `Could not ${action}`);
      if (body.shortfall) setError(body.shortfall);
      if (action === "stop" && !extra.pod) setWant(null);
      await refresh(action === "stop");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!status) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-xl bg-inset px-3.5 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Checking where this engine can run
      </div>
    );
  }
  if (!engine) return null;
  const cheapest = (offers[engineId] ?? [])[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where the engine runs">
        <Choice
          on={target === "local"}
          disabled={!local || !local.fits}
          onClick={() => onTarget("local")}
          icon={<Cpu className="size-3.5" />}
          title="This machine"
          note={status.gpu ? `${gpuName(status.gpu.name)}, ${status.gpu.memoryGb} GB` : "No GPU found"}
        />
        <Choice
          on={target === "runpod"}
          disabled={!rented}
          onClick={() => onTarget("runpod")}
          icon={<Cloud className="size-3.5" />}
          title="Rented GPU"
          note={
            pods.length > 0
              ? `${pods.length} × ${gpuName(pods[0]!.gpu)}, $${hourly.toFixed(2)}/hr`
              : cheapest
                ? `from $${cheapest.usdPerHour.toFixed(2)}/hr`
                : rented
                  ? `${rented.minGpuMemoryGb} GB or more`
                  : "not declared"
          }
        />
      </div>

      {target === "local" && local ? (
        <div className="rounded-xl bg-inset px-3.5 py-3">
          {!local.fits ? (
            <p className="text-[12.5px] text-muted-foreground">
              {engine.label} needs {local.needsGb} GB of GPU memory; this machine has{" "}
              {status.gpu?.memoryGb ?? "no"} GB. Rent a GPU for it instead.
            </p>
          ) : !local.up ? (
            <p className="text-[12.5px] text-muted-foreground">
              Ollama is not answering at {local.host}. Start Ollama, and this will update by itself.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-navy-deep">{engine.model}</p>
                <p className="text-[12px] text-muted-foreground">
                  {local.loaded
                    ? "Loaded and ready"
                    : localLoading
                      ? local.progress!.detail || local.progress!.stage
                      : local.built
                        ? "Built, not in memory"
                        : local.pulled
                          ? "Downloaded, not built"
                          : `Not downloaded (${engine.checkpoint})`}
                </p>
              </div>
              {local.loaded ? (
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("unload")}>
                  {busy === "unload" ? <Loader2 className="size-3.5 animate-spin" /> : <Square className="size-3.5" />}
                  Unload
                </Button>
              ) : (
                <Button size="sm" disabled={!!busy || localLoading} onClick={() => act("load")}>
                  {busy === "load" || localLoading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  Load
                </Button>
              )}
            </div>
          )}
          {localLoading && local.progress?.fraction != null ? (
            <Progress value={local.progress.fraction * 100} className="mt-2.5 h-1.5" />
          ) : null}
          {local.progress?.stage === "failed" ? (
            <p className="mt-2 text-[12px] text-destructive">{local.progress.detail}</p>
          ) : null}
        </div>
      ) : null}

      {target === "runpod" && rented ? (
        <div className="flex flex-col gap-2.5 rounded-xl bg-inset px-3.5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-navy-deep">GPUs</p>
              <p className="text-[12px] leading-snug text-muted-foreground">
                The pillar's reads divide across them, one at a time on each.
              </p>
            </div>
            <div className="flex shrink-0 gap-1" role="radiogroup" aria-label="How many GPUs">
              {Array.from({ length: rented.maxPods }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={count === n}
                  disabled={!!busy || n < pods.length}
                  onClick={() => setWant(n)}
                  className={cn(
                    "size-8 rounded-lg text-[13px] font-medium tabular-nums transition-colors duration-150",
                    "focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    count === n ? "bg-navy text-paper" : "bg-paper text-navy-deep hover:bg-edge",
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {pods.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {pods.map((pod) => (
                <li key={pod.id} className="rounded-lg bg-paper px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                      <span className="font-medium text-navy-deep">{gpuName(pod.gpu) || "GPU"}</span>{" "}
                      <span className={cn(pod.status.stage === "ready" && "font-medium text-navy-deep")}>
                        {pod.status.stage === "ready" ? "Ready" : pod.status.stage}
                      </span>
                      {pod.status.stage !== "ready" && pod.status.detail ? `: ${pod.status.detail}` : ""}
                      <span className="text-muted-foreground/70">{` · ${pod.id}`}</span>
                    </p>
                    <button
                      type="button"
                      aria-label={`Stop ${pod.id}`}
                      title="Stop this GPU"
                      disabled={!!busy}
                      onClick={() => act("stop", { pod: pod.id })}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-edge hover:text-navy-deep disabled:opacity-45"
                    >
                      {busy === `stop:${pod.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                    </button>
                  </div>
                  {pod.status.stage !== "ready" && pod.status.progress != null ? (
                    <Progress value={pod.status.progress * 100} className="mt-2 h-1" />
                  ) : null}
                  {pod.status.stage === "failed" ? (
                    <p className="mt-1.5 text-[12px] text-destructive">
                      Could not load the engine. Stop it so it stops billing, then rent another.
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              {pods.length > 0
                ? `$${spent.toFixed(2)} so far at $${hourly.toFixed(2)}/hr for ${pods.length}.`
                : cheapest
                  ? `Rents the cheapest free cards with ${rented.minGpuMemoryGb} GB or more, at most $${(rented.maxUsdPerHour ?? 0.34).toFixed(2)}/hr each. Each pod loads ${engine.model} itself, in a few minutes.`
                  : `No card with ${rented.minGpuMemoryGb} GB or more is listed under $${(rented.maxUsdPerHour ?? 0.34).toFixed(2)}/hr right now.`}
            </p>
            <div className="flex shrink-0 gap-1.5">
              {pods.length > 0 ? (
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("stop")}>
                  {busy === "stop" ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                  {pods.length > 1 ? "Stop all" : "Stop GPU"}
                </Button>
              ) : null}
              {count > pods.length ? (
                <Button size="sm" disabled={!!busy || !cheapest} onClick={() => act("start", { pods: count })}>
                  {busy === "start" ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                  {pods.length === 0
                    ? count === 1
                      ? "Rent GPU"
                      : `Rent ${count} GPUs`
                    : `Rent ${count - pods.length} more`}
                </Button>
              ) : null}
            </div>
          </div>
          {rented.error ? <p className="text-[12px] text-destructive">{rented.error}</p> : null}
        </div>
      ) : null}

      {error ? (
        <p className="text-[12.5px] leading-snug text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Choice({
  on,
  disabled,
  onClick,
  icon,
  title,
  note,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  note: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-xl px-3.5 py-2.5 text-left transition-all duration-150",
        "focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-45",
        on ? "bg-navy text-paper shadow-[0_2px_8px_-3px_rgb(23_50_78/0.5)]" : "bg-inset text-navy-deep hover:bg-edge",
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        {icon}
        {title}
      </span>
      <span className={cn("mt-0.5 text-[11.5px]", on ? "text-paper/75" : "text-muted-foreground")}>{note}</span>
    </button>
  );
}
