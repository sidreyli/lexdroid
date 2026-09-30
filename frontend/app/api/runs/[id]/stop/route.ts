import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { BACKEND, TSX_CLI } from "@/lib/data/paths";
import { isReadOnlyDeployment, READ_ONLY_DEPLOYMENT_MESSAGE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

/** Stop every fleet working on a run and record it as cancelled. Rented GPUs are left running. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Not a run id" }, { status: 400 });

  const { code, out } = await new Promise<{ code: number | null; out: string }>((resolve) => {
    const child = spawn(process.execPath, [TSX_CLI, "scripts/stop-run.ts", "--run", id], {
      cwd: BACKEND,
      shell: false,
      env: process.env,
    });
    let out = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.stderr.on("data", (c: Buffer) => (out += c.toString()));
    child.on("close", (code) => resolve({ code, out }));
  });
  if (code !== 0) {
    const reason = out.match(/Error: (.+)/)?.[1] ?? "The run could not be stopped";
    return NextResponse.json({ error: reason }, { status: 500 });
  }
  return NextResponse.json({ ok: true, detail: out.trim() });
}
