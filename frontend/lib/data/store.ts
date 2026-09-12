/**
 * The live working store, read-only. Runs the same queries the snapshot script ran,
 * so the interface shows the database as it stands instead of a file someone regenerated.
 */
import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";

const CONTEXT_CHARS = 2600;
const TTL_MS = 5_000;

const CHECKOUT = resolve(process.env.LEXDROID_CHECKOUT ?? join(process.cwd(), ".."));
const DB_PATH = process.env.LEXDROID_DB ?? join(CHECKOUT, "backend/data/lexdroid.db");

let handle: Database.Database | null = null;

/** Null when there is no database yet, which is how a fresh clone looks. */
function db(): Database.Database | null {
  if (handle) return handle;
  if (!existsSync(DB_PATH)) return null;
  try {
    handle = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    handle.pragma("busy_timeout = 4000");
    return handle;
  } catch {
    return null;
  }
}

export function storeIsLive(): boolean {
  return db() !== null;
}

function query<T>(sql: string): T[] {
  const d = db();
  if (!d) return [];
  return d.prepare(sql).all() as T[];
}

function jsonOr<T>(raw: unknown, fallback: T): T {
  try {
    return raw ? (JSON.parse(String(raw)) as T) : fallback;
  } catch {
    return fallback;
  }
}

function nullIfBlank<T>(v: T): T | null {
  return v === "" || v === undefined ? null : v;
}

/** Each dataset is rebuilt at most once every few seconds, so a page render is cheap. */
function cached<T>(build: () => T): () => T {
  let at = 0;
  let value: T;
  return () => {
    const now = Date.now();
    if (now - at > TTL_MS) {
      value = build();
      at = now;
    }
    return value;
  };
}

export const liveRubric = cached(() => {
  const p = join(CHECKOUT, "backend/data/rubric.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
});

export const liveEconomies = cached(() => {
  const dir = join(CHECKOUT, "backend/data/profiles");
  if (!existsSync(dir)) return null;
  const profiles = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as { code: string });

  const corpus = query<Record<string, number | string>>(`
    SELECT i.economy_code AS economy,
           COUNT(DISTINCT i.id) AS instruments,
           COUNT(DISTINCT d.id) AS documents,
           COUNT(DISTINCT s.id) AS sections,
           COUNT(DISTINCT e.section_id) AS embedded
      FROM instrument i
      LEFT JOIN document d ON d.instrument_id = i.id
      LEFT JOIN section s ON s.document_id = d.id
      LEFT JOIN section_embedding e ON e.section_id = s.id
     GROUP BY i.economy_code`);

  const unread = query<{ economy: string; reason: string; count: number }>(`
    SELECT i.economy_code AS economy, u.reason, COUNT(*) AS count
      FROM unread_document u
      JOIN document d ON d.id = u.document_id
      JOIN instrument i ON i.id = d.instrument_id
     GROUP BY 1, 2 ORDER BY 3 DESC`);

  return profiles.map((p) => {
    const c = corpus.find((r) => r["economy"] === p.code) ?? {};
    return {
      ...p,
      corpus: {
        instruments: c["instruments"] ?? 0,
        documents: c["documents"] ?? 0,
        sections: c["sections"] ?? 0,
        embedded: c["embedded"] ?? 0,
        unread: unread
          .filter((u) => u.economy === p.code)
          .map((u) => ({ reason: u.reason, count: u.count })),
      },
    };
  });
});

export const liveCells = cached(() => {
  const rows = query<Record<string, unknown>>(`
    SELECT c.id, c.run_id AS runId, c.economy_code AS economy, c.indicator_id AS indicatorId,
           c.state, c.unresolved_reason AS unresolvedReason, c.answered_at AS answeredAt,
           c.queries, c.depth, c.surfaced, c.sections_indexed AS sectionsIndexed,
           c.sections_read AS sectionsRead,
           ca.score, ca.band_ordinal AS bandOrdinal, ca.band_criterion AS bandCriterion,
           ca.deciding_fact AS decidingFact, ca.rationale, ca.computed_at AS computedAt,
           ca.controlling_instrument_id AS controllingInstrumentId,
           ci.title AS controllingInstrument, ci.source_url AS controllingInstrumentUrl,
           r.started_at AS runStartedAt, r.status AS runStatus,
           r.engine, r.engine_model AS model, r.source_mode AS sourceMode
      FROM cell c
      JOIN cell_answer ca ON ca.cell_id = c.id
      JOIN run r ON r.id = c.run_id
      LEFT JOIN instrument ci ON ci.id = ca.controlling_instrument_id
     ORDER BY r.started_at DESC`);
  if (rows.length === 0) return null;
  return rows.map((c) => ({
    ...c,
    queries: jsonOr(c["queries"], [] as string[]),
    unresolvedReason: nullIfBlank(c["unresolvedReason"]),
    controllingInstrument: nullIfBlank(c["controllingInstrument"]),
    controllingInstrumentUrl: nullIfBlank(c["controllingInstrumentUrl"]),
  }));
});

export const liveExportRows = cached(() => {
  const rows = query<Record<string, unknown>>(`
    SELECT e.id, e.cell_id AS cellId, e.economy, e.indicator_id AS indicatorId,
           e.law_name AS lawName, e.law_number_ref AS lawNumberRef, e.last_amended AS lastAmended,
           e.article, e.discovery_tag AS discoveryTag, e.location_reference AS locationReference,
           e.verbatim_snippet AS verbatimSnippet, e.quote_char_start AS quoteCharStart,
           e.quote_char_end AS quoteCharEnd, e.mapping_rationale AS mappingRationale,
           e.source_url AS sourceUrl, e.confidence, e.notes,
           e.language_of_source AS languageOfSource, e.section_id AS sectionId,
           e.reading_id AS readingId, e.created_at AS createdAt,
           c.run_id AS runId, c.state,
           ca.score, ca.band_ordinal AS bandOrdinal, ca.band_criterion AS bandCriterion,
           ca.deciding_fact AS decidingFact,
           s.heading_path AS headingPath, s.label AS sectionLabel, s.anchor,
           s.char_start AS sectionCharStart, s.char_end AS sectionCharEnd, s.page,
           i.id AS instrumentId, i.kind AS instrumentKind, i.status AS instrumentStatus,
           i.status_basis AS statusBasis, i.commenced_on AS commencedOn,
           i.last_amended_on AS lastAmendedOn, i.timeframe_basis AS timeframeBasis,
           i.official_number AS officialNumber, i.language AS instrumentLanguage,
           d.id AS documentId, d.extraction, d.media_type AS mediaType,
           rd.applies, rd.quote AS readingQuote, rd.subclause, rd.attributes,
           rd.reasoning, rd.engine, rd.model
      FROM export_row e
      JOIN cell c ON c.id = e.cell_id
      LEFT JOIN cell_answer ca ON ca.cell_id = c.id
      LEFT JOIN section s ON s.id = e.section_id
      LEFT JOIN document d ON d.id = s.document_id
      LEFT JOIN instrument i ON i.id = d.instrument_id
      LEFT JOIN reading rd ON rd.id = e.reading_id
     ORDER BY e.id`);
  if (rows.length === 0) return null;

  const gates = query<{ rowId: number; gate: string; passed: number; detail: string | null }>(`
    SELECT export_row_id AS rowId, gate, passed, detail
      FROM gate_result ORDER BY export_row_id, gate`);

  const ids = [...new Set(rows.map((r) => r["sectionId"]).filter(Boolean))];
  const texts = ids.length
    ? query<{ sectionId: number; sectionText: string; documentText: string }>(`
        SELECT s.id AS sectionId, s.text AS sectionText, dt.text AS documentText
          FROM section s JOIN document_text dt ON dt.document_id = s.document_id
         WHERE s.id IN (${ids.join(",")})`)
    : [];
  const bySection = new Map(texts.map((t) => [t.sectionId, t]));

  return rows.map((r) => {
    const t = bySection.get(r["sectionId"] as number);
    const start = r["quoteCharStart"] as number | null;
    const end = r["quoteCharEnd"] as number | null;
    let context = null;
    if (t && start != null && end != null) {
      const from = Math.max(0, start - CONTEXT_CHARS);
      const to = Math.min(t.documentText.length, end + CONTEXT_CHARS);
      context = {
        text: t.documentText.slice(from, to),
        offset: from,
        quoteStart: start - from,
        quoteEnd: end - from,
        truncatedStart: from > 0,
        truncatedEnd: to < t.documentText.length,
      };
    }
    return {
      ...r,
      article: nullIfBlank(r["article"]),
      discoveryTag: nullIfBlank(r["discoveryTag"]),
      locationReference: nullIfBlank(r["locationReference"]),
      verbatimSnippet: nullIfBlank(r["verbatimSnippet"]),
      notes: nullIfBlank(r["notes"]),
      attributes: jsonOr(r["attributes"], [] as unknown[]),
      sectionText: t?.sectionText ?? null,
      context,
      gates: gates
        .filter((g) => g.rowId === r["id"])
        .map((g) => ({ gate: g.gate, passed: !!g.passed, detail: nullIfBlank(g.detail) })),
    };
  });
});

export const liveRuns = cached(() => {
  const rows = query<Record<string, unknown>>(`
    SELECT r.id, r.started_at AS startedAt, r.finished_at AS finishedAt, r.economies,
           r.pillars, r.engine, r.engine_model AS model, r.source_mode AS sourceMode,
           r.code_revision AS codeRevision, r.rubric_derived_at AS rubricDerivedAt,
           r.status, r.notes,
           (SELECT COUNT(*) FROM cell c WHERE c.run_id = r.id) AS cells,
           (SELECT COUNT(*) FROM export_row e JOIN cell c ON c.id = e.cell_id WHERE c.run_id = r.id) AS rows_,
           (SELECT COALESCE(SUM(usd), 0) FROM run_cost rc WHERE rc.run_id = r.id) AS usd,
           (SELECT COALESCE(SUM(calls), 0) FROM run_cost rc WHERE rc.run_id = r.id) AS calls,
           (SELECT COALESCE(SUM(prompt_tokens + output_tokens), 0) FROM run_cost rc WHERE rc.run_id = r.id) AS tokens,
           (SELECT COALESCE(SUM(wall_seconds), 0) FROM run_cost rc WHERE rc.run_id = r.id) AS wallSeconds
      FROM run r ORDER BY r.started_at DESC`);
  if (rows.length === 0) return null;

  const stages = query<{ runId: string; stage: string; seconds: number; items: number }>(`
    SELECT run_id AS runId, stage, SUM(seconds) AS seconds, SUM(items) AS items
      FROM run_stage GROUP BY 1, 2`);

  return rows.map((r) => ({
    ...r,
    rows: r["rows_"],
    rows_: undefined,
    economies: jsonOr(r["economies"], [] as string[]),
    pillars: jsonOr<unknown>(r["pillars"], "all"),
    notes: nullIfBlank(r["notes"]),
    stages: stages
      .filter((s) => s.runId === r["id"])
      .map((s) => ({ stage: s.stage, seconds: s.seconds, items: s.items })),
  }));
});

export const liveRunEvents = cached(() => {
  const runs = query<{ id: string; status: string }>(
    `SELECT id, status FROM run ORDER BY started_at DESC LIMIT 8`,
  );
  if (runs.length === 0) return null;
  const watched = [
    ...runs.filter((r) => r.status === "running").map((r) => r.id),
    ...runs.slice(0, 3).map((r) => r.id),
  ].filter((id, i, all) => all.indexOf(id) === i);

  return watched.flatMap((id) =>
    query<Record<string, unknown>>(`
      SELECT id, run_id AS runId, at, economy_code AS economy, pillar_id AS pillarId,
             indicator_id AS indicatorId, stage, kind, subject, detail, seconds, done, total
        FROM run_event WHERE run_id = '${id}' ORDER BY id DESC LIMIT 2000`).reverse(),
  );
});
