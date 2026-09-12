import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { ENGINES_PATH } from "@/lib/data/paths";

export const dynamic = "force-dynamic";

interface Engine {
  id: string;
  label: string;
  declared: boolean;
}
interface Registry {
  default: string;
  engines: Engine[];
}

function read(): Registry {
  if (!existsSync(ENGINES_PATH)) return { default: "", engines: [] };
  return JSON.parse(readFileSync(ENGINES_PATH, "utf8")) as Registry;
}

export async function GET() {
  return NextResponse.json(read());
}

/** Only the choice moves. The declarations themselves are frozen after 30 September. */
export async function POST(request: Request) {
  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Send a JSON body naming an engine" }, { status: 400 });
  }

  const registry = read();
  const engine = registry.engines.find((e) => e.id === body.id);
  if (!engine) return NextResponse.json({ error: `No engine ${body.id}` }, { status: 404 });
  if (!engine.declared) {
    return NextResponse.json(
      { error: `${engine.label} has no provider, model or checkpoint declared yet` },
      { status: 409 },
    );
  }

  const next = { ...registry, default: engine.id };
  writeFileSync(ENGINES_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  return NextResponse.json(next);
}
