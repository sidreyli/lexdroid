import { NextResponse } from "next/server";
import { recordVerdict, type Verdict } from "@/lib/data/write";
import { isReadOnlyDeployment, READ_ONLY_DEPLOYMENT_MESSAGE } from "@/lib/deployment";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["accept", "edit", "reject"]);

export async function POST(request: Request) {
  if (isReadOnlyDeployment()) {
    return NextResponse.json({ error: READ_ONLY_DEPLOYMENT_MESSAGE }, { status: 503 });
  }

  let body: Partial<Verdict>;
  try {
    body = (await request.json()) as Partial<Verdict>;
  } catch {
    return NextResponse.json({ error: "Send a JSON verdict" }, { status: 400 });
  }

  const rowId = Number(body.rowId);
  if (!Number.isInteger(rowId)) {
    return NextResponse.json({ error: "rowId must be a row number" }, { status: 400 });
  }
  if (!body.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "action must be accept, edit or reject" }, { status: 400 });
  }
  // A correction and a rejection both say a reviewer checked the source. An acceptance does not.
  if (body.action !== "accept" && !String(body.attestation ?? "").trim()) {
    return NextResponse.json(
      { error: `A ${body.action} needs an attestation saying what was checked` },
      { status: 400 },
    );
  }

  try {
    const saved = recordVerdict({
      rowId,
      action: body.action,
      attestation: String(body.attestation ?? ""),
      changedFields: body.changedFields ?? {},
      reviewer: String(body.reviewer ?? ""),
    });
    return NextResponse.json({ ok: true, id: saved.id });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
