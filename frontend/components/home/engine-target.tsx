"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, Cpu, Loader2, Power, Square, Upload } from "lucide-react";
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
    pod: PodState | null;
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
  const pod = rented?.pod ?? null;
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
    if (!pod) return onReady(false, "Rent a GPU for this engine before starting");
    if (pod.status.stage !== "ready") return onReady(false, "The rented GPU is still getting ready");
    return onReady(true, "");
  }, [engine, local, pod, target, onReady]);

  const act = async (action: "load" | "unload" | "start" | "stop") => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/gpu", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, engine: engineId }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || body.ok === false) throw new Error(body.error ?? `Could not ${action}`);
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
            pod
              ? `${gpuName(pod.gpu)}, $${pod.usdPerHour.toFixed(2)}/hr`
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
        <div className="rounded-xl bg-inset px-3.5 py-3">
          {pod ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-navy-deep">
                    {gpuName(pod.gpu)} <span className="text-muted-foreground">({pod.id})</span>
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    <span className={cn(pod.status.stage === "ready" && "text-navy-deep font-medium")}>
                      {pod.status.stage === "ready" ? "Ready" : pod.status.stage}
                    </span>
                    {pod.status.stage !== "ready" && pod.status.detail ? `: ${pod.status.detail}` : ""}
                    {` · $${pod.spentUsd.toFixed(2)} so far at $${pod.usdPerHour.toFixed(2)}/hr`}
                  </p>
                </div>
                <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => act("stop")}>
                  {busy === "stop" ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                  Stop GPU
                </Button>
              </div>
              {pod.status.stage !== "ready" && pod.status.progress != null ? (
                <Progress value={pod.status.progress * 100} className="mt-2.5 h-1.5" />
              ) : null}
              {pod.status.stage === "failed" ? (
                <p className="mt-2 text-[12px] text-destructive">
                  The pod could not load the engine. Stop it so it stops billing, then try again.
                </p>
              ) : null}
            </>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                {cheapest
                  ? `Rents the cheapest free card with ${rented.minGpuMemoryGb} GB or more, at most $${(rented.maxUsdPerHour ?? 0.34).toFixed(2)}/hr. The pod downloads and loads ${engine.model} itself, which takes a few minutes the first time.`
                  : `No card with ${rented.minGpuMemoryGb} GB or more is listed under $${(rented.maxUsdPerHour ?? 0.34).toFixed(2)}/hr right now.`}
              </p>
              <Button size="sm" disabled={!!busy || !cheapest} onClick={() => act("start")}>
                {busy === "start" ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                Rent GPU
              </Button>
            </div>
          )}
          {rented.error ? <p className="mt-2 text-[12px] text-destructive">{rented.error}</p> : null}
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
