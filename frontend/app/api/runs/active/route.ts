import { NextResponse } from "next/server";
import { activeRun } from "@/lib/data/active-run";

export const dynamic = "force-dynamic";

/** The run under way, so the Start button can wait for it rather than open a second. */
export function GET() {
  return NextResponse.json({ run: activeRun() });
}
