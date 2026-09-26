import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { BACKEND, ENGINES_PATH, TSX_CLI } from "@/lib/data/paths";
import { readFileSync } from "node:fs";
import { isReadOnlyDeployment, READ_ONLY_DEPLOYMENT_MESSAGE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

interface StartRun {
  economies?: string[];
  pillars?: number[];
  engine?: string;
  cacheOnly?: boolean;
  /** Where the engine runs: this machine, or the GPU rented for it from the engine panel. */
  on?: "local" | "runpod";
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
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }

  let body: StartRun;
  try {
    body = (await request.json()) as StartRun;
  } catch {
    return NextResponse.json({ error: "Send a JSON body describing the run" }, { status: 400 });
  }

  // These two go into a command line that is run through a shell, so what they may contain is
  // stated rather than assumed: three letters, and a pillar the rubric has. Anything else is
  // refused here instead of being quoted somewhere further down.
  const economies = (body.economies ?? []).map((e) => String(e).trim().toUpperCase()).filter(Boolean);
  if (economies.length === 0) {
    return NextResponse.json({ error: "Pick at least one economy" }, { status: 400 });
  }
  const badEconomy = economies.find((e) => !/^[A-Z]{3}$/.test(e));
  if (badEconomy) {
    return NextResponse.json(
      { error: `${badEconomy} is not an economy code; use three letters, as in MYS` },
      { status: 400 },
    );
  }
  const pillars = (body.pillars ?? ALL_PILLARS).filter((p) => Number.isInteger(p));
  if (pillars.length === 0) {
    return NextResponse.json({ error: "Pick at least one pillar" }, { status: 400 });
  }
  const badPillar = pillars.find((p) => !ALL_PILLARS.includes(p));
  if (badPillar !== undefined) {
    return NextResponse.json({ error: `There is no pillar ${badPillar}` }, { status: 400 });
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
    TSX_CLI,
    "scripts/fleet.ts",
    "--economies",
    economies.join(","),
    "--pillars",
    pillars.join(","),
    "--engine",
    engine.id,
  ];
  if (body.cacheOnly) args.push("--cache-only");
  if (body.on === "runpod") args.push("--on", "runpod");
  else if (body.on !== undefined && body.on !== "local") {
    return NextResponse.json({ error: `Nowhere called ${body.on} to run` }, { status: 400 });
  }

  const logDir = join(BACKEND, "data", "runs");
  mkdirSync(logDir, { recursive: true });
  const startedAt = new Date().toISOString().replace(/[:.]/g, "-");
  const logPath = join(logDir, `${startedAt}.log`);
  const log = createWriteStream(logPath);

  // No shell. The arguments are an array the operating system hands to the program as they are,
  // so nothing in them can be read as a command however it is spelled -- the validation above and
  // this are two answers to the same question, and only this one holds if the validation is ever
  // widened. Node runs the runner itself, because Windows will not start npx's .cmd without a
  // shell and putting the shell back is the thing being removed.
  const child = spawn(process.execPath, args, {
    cwd: BACKEND,
    shell: false,
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
