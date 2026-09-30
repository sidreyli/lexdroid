"use client";

import { useState } from "react";
import { Eraser, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Plan {
  economies: string[];
  runs: number;
  cells: number;
  instruments: number;
  documents: number;
  sections: number;
  cacheFiles: number;
}

const n = (x: number, one: string, many = `${one}s`) => `${x.toLocaleString()} ${x === 1 ? one : many}`;

/**
 * Before the live hour: take the picked economies out of the store and empty the download cache,
 * so the run that follows walks the portals and downloads the law with the clock running. Asks
 * first, saying exactly what will go.
 */
export function ClearSlate({ economies, names }: { economies: string[]; names: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const response = await fetch(`/api/clear?economies=${encodeURIComponent(economies.join(","))}`);
      const body = (await response.json()) as Plan & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not say what clearing would take");
      setPlan(body);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/clear", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ economies }),
      });
      const body = (await response.json()) as Plan & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "The clear did not finish");
      setDone(
        `Cleared ${names}: ${n(body.documents, "document")} and ${n(body.runs, "run")} removed, ` +
          `${n(body.cacheFiles, "cached file")} deleted. The next run starts from nothing.`,
      );
      setPlan(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {plan ? (
        <div className="rounded-xl bg-ochre-soft px-3.5 py-3 text-[12.5px] leading-snug text-ochre">
          <p>
            This removes {names} from this store: {n(plan.instruments, "registered law")},{" "}
            {n(plan.documents, "downloaded document")}, {n(plan.sections, "provision")} and{" "}
            {n(plan.runs, "run")} over {plan.economies.length === 1 ? "it" : "them"}
            {plan.cells ? ` (${n(plan.cells, "answered cell")})` : ""}. It also empties the download
            cache ({n(plan.cacheFiles, "file")}). Other economies are not touched.
          </p>
          <div className="mt-2.5 flex gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={confirm} className="rounded-lg">
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Eraser className="size-3.5" />}
              Clear
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setPlan(null)} className="rounded-lg">
              Keep everything
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy || economies.length === 0}
          onClick={ask}
          className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-inset px-3.5 py-2 text-left text-[13.5px] leading-snug text-navy-deep transition-colors hover:bg-edge disabled:opacity-50"
        >
          <span className="min-w-0">Clear the cache and downloaded documents for {names}</span>
          {busy ? (
            <Loader2 className="size-4 shrink-0 animate-spin" />
          ) : (
            <Eraser className="size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
      )}
      {done ? <p className="text-[12px] leading-snug text-muted-foreground">{done}</p> : null}
      {error ? (
        <p className="text-[12px] leading-snug text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
