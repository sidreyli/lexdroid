import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { BACKEND, TSX_CLI } from "@/lib/data/paths";
import { isReadOnlyDeployment, READ_ONLY_DEPLOYMENT_MESSAGE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

const ACTIONS = ["load", "unload", "start", "stop", "cap"] as const;
/** Mirrors MAX_PODS in backend/src/gpu/runpod.ts, which refuses more whatever this says. */
const MAX_PODS = 4;
/** Mirrors CAP_LIMITS there, which refuses outside them whatever this says. */
const CAP_MIN = 0.1;
const CAP_MAX = 2;
type Action = (typeof ACTIONS)[number];

/**
 * The backend's `gpu` command, run and read. It prints one line of JSON and never a key or a
 * token, so what it prints can go straight to the browser.
 */
function gpu(args: string[], timeoutMs = 90_000): Promise<{ ok: boolean; body: unknown }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, "scripts/gpu.ts", ...args], {
      cwd: BACKEND,
      shell: false,
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = out.trim().split("\n").at(-1) ?? "";
      try {
        resolve({ ok: code === 0, body: JSON.parse(line) });
      } catch {
        resolve({ ok: false, body: { ok: false, error: "The GPU command printed nothing readable" } });
      }
    });
  });
}

export async function GET(request: Request) {
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }
  const offers = new URL(request.url).searchParams.get("offers") === "1";
  const { ok, body } = await gpu(offers ? ["status", "--offers"] : ["status"]);
  return NextResponse.json(body, { status: ok ? 200 : 502 });
}

export async function POST(request: Request) {
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }
  let body: { action?: string; engine?: string; pods?: number; pod?: string; usd?: number | "declared" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Send a JSON body with an action and an engine" }, { status: 400 });
  }
  const action = body.action as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `No action ${body.action}` }, { status: 400 });
  }
  // Goes to a child process as one argument, never through a shell; still stated, not assumed.
  if (!body.engine || !/^[a-z0-9-]{1,40}$/.test(body.engine)) {
    return NextResponse.json({ error: "Name an engine" }, { status: 400 });
  }

  if (action === "load") {
    // Pulling a model takes minutes. It runs on by itself and writes its progress where the
    // status call finds it.
    const child = spawn(process.execPath, [TSX_CLI, "scripts/gpu.ts", "load", "--engine", body.engine], {
      cwd: BACKEND,
      shell: false,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    return NextResponse.json({ ok: true, started: true });
  }

  const args = [action, "--engine", body.engine];
  if (action === "start" && body.pods !== undefined) {
    if (!Number.isInteger(body.pods) || body.pods < 1 || body.pods > MAX_PODS) {
      return NextResponse.json({ error: `Between 1 and ${MAX_PODS} GPUs` }, { status: 400 });
    }
    args.push("--pods", String(body.pods));
  }
  if (action === "cap") {
    // What one pod may cost an hour, or "declared" to go back to the engine's own figure.
    if (body.usd === "declared") args.push("--usd", "declared");
    else if (typeof body.usd === "number" && body.usd >= CAP_MIN && body.usd <= CAP_MAX) {
      args.push("--usd", body.usd.toFixed(2));
    } else {
      return NextResponse.json(
        { error: `A cap is between $${CAP_MIN.toFixed(2)} and $${CAP_MAX.toFixed(2)} an hour` },
        { status: 400 },
      );
    }
  }
  if (action === "stop" && body.pod !== undefined) {
    if (!/^[a-z0-9]{6,40}$/.test(body.pod)) {
      return NextResponse.json({ error: "Name a pod by its id" }, { status: 400 });
    }
    args.push("--pod", body.pod);
  }
  // Renting four pods is four RunPod calls in a row, each of which can wait on stock.
  const { ok, body: result } = await gpu(args, action === "start" ? 240_000 : 120_000);
  return NextResponse.json(result, { status: ok ? 200 : 502 });
}
