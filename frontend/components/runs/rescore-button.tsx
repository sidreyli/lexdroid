"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Re-decide a finished run under today's rules. It previews first, because a rescore replaces the
 * banked answers, and only writes when the preview has been seen.
 */
export function RescoreButton({ runId }: { runId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/rescore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const body = (await res.json()) as { ok: boolean; lines?: string[]; error?: string };
      if (!res.ok) throw new Error(body.lines?.join(" ") ?? body.error ?? "Rescore failed");
      if (dryRun) setPreview(body.lines ?? []);
      else {
        setDone(body.lines ?? []);
        router.refresh();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !preview && !done) void call(true);
        if (!o) {
          setPreview(null);
          setDone(null);
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-10 shrink-0 rounded-xl text-[13px]">
          <RefreshCw className="size-4" />
          Rescore
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] rounded-2xl p-4">
        <p className="text-[13.5px] font-medium text-navy-deep">Rescore under today&apos;s rules</p>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          The same readings, decided again. No engine is asked anything.
        </p>
        <pre className="mt-3 max-h-56 overflow-auto rounded-lg bg-inset p-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap text-navy-deep">
          {busy && !preview && !done ? "Working out what would change..." : (done ?? preview ?? []).join("\n")}
        </pre>
        {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
        {preview && !done ? (
          <Button className="mt-3 w-full rounded-xl" disabled={busy} onClick={() => call(false)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Apply
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
