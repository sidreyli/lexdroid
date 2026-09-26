import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { BACKEND, TSX_CLI } from "@/lib/data/paths";

export const dynamic = "force-dynamic";

/**
 * Score a finished run again under today's decision rules, over the readings it already has. No
 * engine and no network. `dryRun` reports what would change and writes nothing.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{8,36}$/.test(id)) return NextResponse.json({ error: "Not a run id" }, { status: 400 });
  let dryRun = true;
  try {
    dryRun = ((await request.json()) as { dryRun?: boolean }).dryRun !== false;
  } catch {
    // No body is a preview.
  }
  const args = [TSX_CLI, "scripts/rescore.ts", "--run", id];
  if (dryRun) args.push("--dry-run");

  const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd: BACKEND, shell: false, env: process.env });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.stderr.on("data", (c: Buffer) => (out += c.toString()));
    const timer = setTimeout(() => child.kill(), 300_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, out });
    });
  });
  const lines = out
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== "");
  return NextResponse.json({ ok: code === 0, dryRun, lines }, { status: code === 0 ? 200 : 409 });
}
