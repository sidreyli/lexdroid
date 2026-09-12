import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { BACKEND, ENGINES_PATH } from "@/lib/data/paths";
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";

interface StartRun {
  economies?: string[];
  pillars?: number[];
  engine?: string;
  cacheOnly?: boolean;
}

const ALL_PILLARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function declaredEngine(id: string | undefined): { id: string; declared: boolean } | undefined {
  if (!existsSync(ENGINES_PATH)) return undefined;
  const registry = JSON.parse(readFileSync(ENGINES_PATH, "utf8")) as {
    default: string;
    engines: { id: string; declared: boolean }[];
  };
  return registry.engines.find((e) => e.id === (id ?? registry.default));
}

/** The runner prints its run id first, so the interface can follow the run it just started. */
function firstRunId(stdout: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffered = "";
    const timer = setTimeout(() => reject(new Error("The runner did not report a run id")), 120_000);
    stdout.on("data", (chunk: Buffer) => {
      buffered += chunk.toString();
      const match = buffered.match(/^run ([0-9a-f-]{36})$/m);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    stdout.on("close", () => {
      clearTimeout(timer);
      reject(new Error("The runner stopped before it opened a run"));
    });
  });
}

export async function POST(request: Request) {
  let body: StartRun;
  try {
    body = (await request.json()) as StartRun;
  } catch {
    return NextResponse.json({ error: "Send a JSON body describing the run" }, { status: 400 });
  }

  const economies = (body.economies ?? []).map((e) => e.trim().toUpperCase()).filter(Boolean);
  if (economies.length === 0) {
    return NextResponse.json({ error: "Pick at least one economy" }, { status: 400 });
  }
  const pillars = (body.pillars ?? ALL_PILLARS).filter((p) => Number.isInteger(p) && p > 0);
  if (pillars.length === 0) {
    return NextResponse.json({ error: "Pick at least one pillar" }, { status: 400 });
  }

  const engine = declaredEngine(body.engine);
  if (!engine) return NextResponse.json({ error: `No engine ${body.engine}` }, { status: 404 });
  if (!engine.declared) {
    return NextResponse.json(
      { error: `${engine.id} has nothing declared to run on` },
      { status: 409 },
    );
  }

  const args = [
    "tsx",
    "scripts/fleet.ts",
    "--economies",
    economies.join(","),
    "--pillars",
    pillars.join(","),
    "--engine",
    engine.id,
  ];
  if (body.cacheOnly) args.push("--cache-only");

  const logDir = join(BACKEND, "data", "runs");
  mkdirSync(logDir, { recursive: true });
  const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(logDir, `${startedAt}.log`);
  const log = createWriteStream(logPath);

  const child = spawn("npx", args, {
    cwd: BACKEND,
    shell: true,
    detached: false,
    env: { ...process.env, LLM_PROVIDER: "ollama" },
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);

  try {
    const runId = await firstRunId(child.stdout);
    child.unref();
    return NextResponse.json({ ok: true, runId, log: logPath });
  } catch (err) {
    child.kill();
    return NextResponse.json({ error: (err as Error).message, log: logPath }, { status: 500 });
  }
}
