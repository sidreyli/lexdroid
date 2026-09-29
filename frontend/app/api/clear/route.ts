import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { BACKEND, TSX_CLI } from "@/lib/data/paths";
import { isReadOnlyDeployment, READ_ONLY_DEPLOYMENT_MESSAGE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

/**
 * Clearing the slate before the live hour: the backend's `clear` command, run and read. GET says
 * what clearing the named economies would take; POST takes it. It prints one line of JSON.
 */
function clear(args: string[]): Promise<{ ok: boolean; body: unknown }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, "scripts/clear.ts", ...args], {
      cwd: BACKEND,
      shell: false,
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    const timer = setTimeout(() => child.kill(), 600_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const line = out.trim().split("\n").at(-1) ?? "";
      try {
        resolve({ ok: code === 0, body: JSON.parse(line) });
      } catch {
        resolve({ ok: false, body: { ok: false, error: "The clear command printed nothing readable" } });
      }
    });
  });
}

function economiesOf(raw: unknown): string[] | null {
  const list = (Array.isArray(raw) ? raw : String(raw ?? "").split(","))
    .map((e) => String(e).trim().toUpperCase())
    .filter(Boolean);
  // Goes to a child process as one argument, never through a shell; still stated, not assumed.
  return list.length > 0 && list.every((e) => /^[A-Z]{3}$/.test(e)) ? list : null;
}

export async function GET(request: Request) {
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }
  const economies = economiesOf(new URL(request.url).searchParams.get("economies"));
  if (!economies) return NextResponse.json({ error: "Name the economies, as in LAO" }, { status: 400 });
  const { ok, body } = await clear(["--economy", economies.join(","), "--dry-run"]);
  return NextResponse.json(body, { status: ok ? 200 : 502 });
}

export async function POST(request: Request) {
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }
  let body: { economies?: unknown };
  try {
    body = (await request.json()) as { economies?: unknown };
  } catch {
    return NextResponse.json({ error: "Send a JSON body naming the economies" }, { status: 400 });
  }
  const economies = economiesOf(body.economies);
  if (!economies) return NextResponse.json({ error: "Name the economies, as in LAO" }, { status: 400 });
  const { ok, body: result } = await clear(["--economy", economies.join(",")]);
  return NextResponse.json(result, { status: ok ? 200 : 502 });
}
