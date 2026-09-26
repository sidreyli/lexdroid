/**
 * The facts about the submission itself, as opposed to the facts about the law.
 *
 * The Submission Checklist and the Engine Comparison sheets ask questions the evidence rows cannot
 * answer: which engines are declared, how many documents a pass took off a government server,
 * whether a zero-fetch second pass has ever actually been demonstrated. They come from the run
 * record and the engine registry rather than from anybody's recollection, because the two that
 * matter most -- the document count and the engine declaration -- are the ones a steward checks.
 */
import "server-only";
import { existsSync, readFileSync } from "node:fs";
import { ENGINES_PATH } from "./paths";
import { hasColumn, queryWith, storeIsLive } from "./store";

export interface DeclaredEngine {
  label: string;
  model: string;
  hosted: boolean;
  kind: string;
}

/** The engines declared for Section 5. An undeclared one is not a declaration. */
export function getEngines(): DeclaredEngine[] {
  if (!existsSync(ENGINES_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(ENGINES_PATH, "utf8")) as {
      engines?: { label?: string; model?: string; hosted?: boolean; kind?: string; declared?: boolean }[];
    };
    return (raw.engines ?? [])
      .filter((e) => e.declared)
      .map((e) => ({
        label: e.label ?? "",
        model: e.model ?? "",
        hosted: e.hosted === true,
        kind: e.kind ?? "",
      }));
  } catch {
    return [];
  }
}

/**
 * Documents this run took over the network.
 *
 * Counted from the fetch log rather than from anything the run says about itself, because this is
 * the number ESCAP checks: "if no documents were fetched during the hour, C5a scores zero", and
 * the second engine's count "must be 0. A steward checks this against the Run Record."
 *
 * 'ok' only. A cached read, a robots refusal and a skipped cache-only request all reached no
 * government server and none of them is a document fetched.
 */
export function documentsFetchedBy(runId: string | undefined): number {
  if (!runId || !storeIsLive()) return 0;
  const rows = queryWith<{ n: number }>(
    `SELECT COUNT(*) AS n FROM fetch_log WHERE run_id = ? AND outcome = 'ok'`,
    [runId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Whether a pass that fetched nothing has actually happened, rather than being a thing we believe
 * would work. A cache-only run that completed and took no document off a server is the evidence.
 */
export function zeroFetchDemonstrated(): boolean {
  if (!storeIsLive()) return false;
  const rows = queryWith<{ n: number }>(
    `SELECT COUNT(*) AS n FROM run r
      WHERE r.source_mode = 'cache-only' AND r.status = 'complete'
        AND (SELECT COUNT(*) FROM fetch_log f WHERE f.run_id = r.id AND f.outcome = 'ok') = 0
        AND (SELECT COUNT(*) FROM cell c WHERE c.run_id = r.id) > 0`,
    [],
  );
  return (rows[0]?.n ?? 0) > 0;
}

export interface DownloadedDocument {
  runId: string;
  url: string;
  at: string;
  bytes: number | null;
  /** From the stored document where there is one; register pages and robots.txt have none. */
  mediaType: string | null;
}

/**
 * Every document the runs took over the network, in the order they were taken: the Run Record's
 * second section, which is the check C5a is marked on. Counted from the same rows, and by the same
 * rule, as `documentsFetchedBy`, so the list and the count on the sheet cannot disagree.
 */
export function documentsFetchedIn(runIds: readonly string[]): DownloadedDocument[] {
  if (runIds.length === 0 || !storeIsLive()) return [];
  // What the server said it sent, where the fetch logged it; before that, the stored document's.
  const logged = hasColumn("fetch_log", "media_type") ? "f.media_type" : "NULL";
  return queryWith<DownloadedDocument>(
    `SELECT f.run_id AS runId, f.url, f.requested_at AS at, f.bytes,
            COALESCE(${logged}, (SELECT MAX(d.media_type) FROM document d WHERE d.url = f.url)) AS mediaType
       FROM fetch_log f
      WHERE f.run_id IN (${runIds.map(() => "?").join(", ")}) AND f.outcome = 'ok'
      ORDER BY f.requested_at, f.id`,
    [...runIds],
  );
}
