"use client";

/**
 * The run, as it happens. Events are pushed from the backend ledger, so a viewer who joins
 * halfway still sees the whole run rather than only what happens next.
 */
import { useEffect, useState } from "react";
import { useSecondsSince } from "./now";
import type { RunEvent, RunStatus } from "@/lib/data/types";

const API = process.env.NEXT_PUBLIC_LEXDROID_API ?? "";

export type Connection = "live" | "connecting" | "offline" | "closed";

export interface LiveRun {
  events: RunEvent[];
  status: RunStatus;
  connection: Connection;
  /** Seconds since the run last said anything, ticking. Null before the first event. */
  silentFor: number | null;
}

export function useLiveRun(runId: string, seed: RunEvent[], seedStatus: RunStatus): LiveRun {
  const [events, setEvents] = useState<RunEvent[]>(seed);
  const [status, setStatus] = useState<RunStatus>(seedStatus);
  const [connection, setConnection] = useState<Connection>(
    seedStatus === "running" ? (API ? "connecting" : "offline") : "closed",
  );
  const [lastAt, setLastAt] = useState<string | null>(seed.at(-1)?.at ?? null);
  // Silence is the failure this view exists to catch: a read can stall saying nothing.
  const silence = useSecondsSince(lastAt);

  useEffect(() => {
    if (!API || seedStatus !== "running") return;
    const after = seed.at(-1)?.id ?? 0;
    const source = new EventSource(`${API}/api/runs/${runId}/stream?after=${after}`);

    source.addEventListener("run-event", (m) => {
      const event = JSON.parse((m as MessageEvent<string>).data) as RunEvent;
      setLastAt(event.at);
      setConnection("live");
      setEvents((prev) => (prev.some((e) => e.id === event.id) ? prev : [...prev, event]));
    });
    source.addEventListener("done", (m) => {
      setStatus((JSON.parse((m as MessageEvent<string>).data) as { status: RunStatus }).status);
      setConnection("closed");
      source.close();
    });
    source.onerror = () => setConnection("offline");

    return () => source.close();
  }, [runId, seedStatus, seed]);

  return { events, status, connection, silentFor: status === "running" ? silence : null };
}
