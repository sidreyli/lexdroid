import { liveRunLedger, runStatus } from "@/lib/data/ledger";

export const dynamic = "force-dynamic";

const POLL_MS = 1000;

/**
 * A run as it happens, read from its own ledger. A viewer who joins halfway asks for
 * everything after the last event they hold, so they see the whole run rather than the rest of it.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  if (!runStatus(id)) return new Response("No such run", { status: 404 });

  let cursor = Number.isFinite(after) ? after : 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const stop = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        request.signal.removeEventListener("abort", stop);
        try {
          controller.close();
        } catch {
          // The viewer closed the tab first. Nothing to report.
        }
      };

      const tick = (): void => {
        if (closed) return;
        try {
          for (const event of liveRunLedger(id, cursor)) {
            cursor = event.id;
            send("run-event", event);
          }
          const status = runStatus(id);
          if (status && status !== "running") {
            send("done", { status });
            stop();
          }
        } catch {
          stop();
        }
      };

      const timer = setInterval(tick, POLL_MS);
      request.signal.addEventListener("abort", stop);
      tick();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
