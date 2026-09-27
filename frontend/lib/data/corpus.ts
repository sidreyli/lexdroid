/**
 * The register, and what became of it. Its own connection because the register is searched
 * with parameters, and a search is not worth caching the way a page dataset is.
 */
import "server-only";
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { DB_PATH } from "./paths";

export const PAGE_SIZE = 25;
const TTL_MS = 5_000;

let handle: Database.Database | null = null;

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

function all<T>(sql: string, params: unknown[] = []): T[] {
  const d = db();
  if (!d) return [];
  return d.prepare(sql).all(...(params as never[])) as T[];
}

export interface CorpusEconomy {
  code: string;
  registered: number;
  inForce: number;
  fetched: number;
  documents: number;
  sections: number;
  /** What the parser tallied. Above `sections` when a document was counted and then lost. */
  sectionsCounted: number;
  embedded: number;
  kinds: { kind: string; count: number }[];
  extractions: { extraction: string; documents: number; sections: number }[];
  unread: { reason: string; count: number; detail: string | null }[];
}

export interface CorpusOverview {
  economies: CorpusEconomy[];
  registered: number;
  fetched: number;
  documents: number;
  sections: number;
  sectionsCounted: number;
  embedded: number;
  unread: number;
  portals: number;
}

let cachedOverview: { at: number; value: CorpusOverview | null } = { at: 0, value: null };

export function corpusOverview(): CorpusOverview | null {
  if (cachedOverview.value && Date.now() - cachedOverview.at < TTL_MS) return cachedOverview.value;
  if (!db()) return null;

  const registered = all<{ economy: string; registered: number; inForce: number }>(
    `SELECT economy_code AS economy, COUNT(*) AS registered,
            SUM(status = 'in-force') AS inForce
       FROM instrument GROUP BY 1`,
  );
  const fetched = all<{
    economy: string;
    fetched: number;
    documents: number;
    sectionsCounted: number;
  }>(
    `SELECT i.economy_code AS economy, COUNT(DISTINCT i.id) AS fetched,
            COUNT(DISTINCT d.id) AS documents,
            COALESCE(SUM(d.section_count), 0) AS sectionsCounted
       FROM instrument i JOIN document d ON d.instrument_id = i.id GROUP BY 1`,
  );
  // Counted from the sections that are actually there, not from what a document says it held.
  const held = all<{ economy: string; sections: number }>(
    `SELECT i.economy_code AS economy, COUNT(s.id) AS sections
       FROM instrument i
       JOIN document d ON d.instrument_id = i.id
       JOIN section s ON s.document_id = d.id
      GROUP BY 1`,
  );
  const embedded = all<{ economy: string; embedded: number }>(
    `SELECT i.economy_code AS economy, COUNT(DISTINCT e.section_id) AS embedded
       FROM instrument i
       JOIN document d ON d.instrument_id = i.id
       JOIN section s ON s.document_id = d.id
       JOIN section_embedding e ON e.section_id = s.id
      GROUP BY 1`,
  );
  const kinds = all<{ economy: string; kind: string; count: number }>(
    `SELECT economy_code AS economy, COALESCE(kind, 'unclassified') AS kind, COUNT(*) AS count
       FROM instrument GROUP BY 1, 2 ORDER BY 3 DESC`,
  );
  const extractions = all<{
    economy: string;
    extraction: string;
    documents: number;
    sections: number;
  }>(
    `SELECT i.economy_code AS economy, COALESCE(d.extraction, 'none') AS extraction,
            COUNT(*) AS documents, COALESCE(SUM(d.section_count), 0) AS sections
       FROM document d JOIN instrument i ON i.id = d.instrument_id
      GROUP BY 1, 2 ORDER BY 3 DESC`,
  );
  const unread = all<{ economy: string; reason: string; count: number; detail: string | null }>(
    `SELECT i.economy_code AS economy, u.reason, COUNT(*) AS count, MIN(u.detail) AS detail
       FROM unread_document u
       JOIN document d ON d.id = u.document_id
       JOIN instrument i ON i.id = d.instrument_id
      GROUP BY 1, 2 ORDER BY 3 DESC`,
  );
  const portals = all<{ n: number }>(`SELECT COUNT(*) AS n FROM portal`)[0]?.n ?? 0;

  const economies: CorpusEconomy[] = registered
    .map((r) => {
      const f = fetched.find((x) => x.economy === r.economy);
      return {
        code: r.economy,
        registered: r.registered,
        inForce: r.inForce,
        fetched: f?.fetched ?? 0,
        documents: f?.documents ?? 0,
        sections: held.find((x) => x.economy === r.economy)?.sections ?? 0,
        sectionsCounted: f?.sectionsCounted ?? 0,
        embedded: embedded.find((x) => x.economy === r.economy)?.embedded ?? 0,
        kinds: kinds.filter((k) => k.economy === r.economy),
        extractions: extractions.filter((x) => x.economy === r.economy),
        unread: unread.filter((u) => u.economy === r.economy),
      };
    })
    .sort((a, b) => b.registered - a.registered);

  const sum = (pick: (e: CorpusEconomy) => number) => economies.reduce((a, e) => a + pick(e), 0);
  const value: CorpusOverview = {
    economies,
    registered: sum((e) => e.registered),
    fetched: sum((e) => e.fetched),
    documents: sum((e) => e.documents),
    sections: sum((e) => e.sections),
    sectionsCounted: sum((e) => e.sectionsCounted),
    embedded: sum((e) => e.embedded),
    unread: unread.reduce((a, u) => a + u.count, 0),
    portals,
  };
  cachedOverview = { at: Date.now(), value };
  return value;
}

export type ReadState = "read" | "unread" | "unfetched";

export interface RegisterFilters {
  economy?: string | undefined;
  kind?: string | undefined;
  status?: string | undefined;
  read?: ReadState | undefined;
  q?: string | undefined;
  page?: number | undefined;
}

export interface RegisterRow {
  id: number;
  economy: string;
  title: string;
  kind: string | null;
  status: string;
  officialNumber: string | null;
  lastAmendedOn: string | null;
  language: string | null;
  sourceUrl: string;
  discoveredVia: string;
  documents: number;
  sections: number;
  unreadReason: string | null;
}

export interface RegisterPage {
  rows: RegisterRow[];
  total: number;
  page: number;
  pages: number;
}

const HAVING: Record<ReadState, string> = {
  read: "COALESCE(SUM(d.section_count), 0) > 0",
  unread: "COUNT(d.id) > 0 AND COALESCE(SUM(d.section_count), 0) = 0",
  unfetched: "COUNT(d.id) = 0",
};

/** The register as a page of rows, narrowed by whatever the reader asked for. */
export function searchRegister(filters: RegisterFilters): RegisterPage {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.economy) {
    where.push("i.economy_code = ?");
    params.push(filters.economy);
  }
  if (filters.kind) {
    where.push("i.kind = ?");
    params.push(filters.kind);
  }
  if (filters.status) {
    where.push("i.status = ?");
    params.push(filters.status);
  }
  if (filters.q) {
    where.push("(i.title LIKE ? OR i.official_number LIKE ?)");
    params.push(`%${filters.q}%`, `%${filters.q}%`);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const having = filters.read ? `HAVING ${HAVING[filters.read]}` : "";

  const grouped = `
    SELECT i.id, i.economy_code AS economy, i.title, i.kind, i.status,
           i.official_number AS officialNumber, i.last_amended_on AS lastAmendedOn,
           i.language, i.source_url AS sourceUrl, i.discovered_via AS discoveredVia,
           COUNT(DISTINCT d.id) AS documents,
           COALESCE(SUM(d.section_count), 0) AS sections,
           MAX(u.reason) AS unreadReason
      FROM instrument i
      LEFT JOIN document d ON d.instrument_id = i.id
      LEFT JOIN unread_document u ON u.document_id = d.id
      ${clause}
     GROUP BY i.id
     ${having}`;

  const total = all<{ n: number }>(`SELECT COUNT(*) AS n FROM (${grouped})`, params)[0]?.n ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pages);
  const rows = all<RegisterRow>(`${grouped} ORDER BY sections DESC, i.title LIMIT ? OFFSET ?`, [
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE,
  ]);
  return { rows, total, page, pages };
}

/** Every kind and status actually present, so a filter can never offer an empty result. */
export function registerFacets(): { kinds: string[]; statuses: string[] } {
  return {
    kinds: all<{ kind: string }>(
      `SELECT DISTINCT kind FROM instrument WHERE kind IS NOT NULL ORDER BY kind`,
    ).map((r) => r.kind),
    statuses: all<{ status: string }>(`SELECT DISTINCT status FROM instrument ORDER BY status`).map(
      (r) => r.status,
    ),
  };
}
