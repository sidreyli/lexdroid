/**
 * A cell's retrieval, rebuilt from what a run stored instead of searched again.
 *
 * A reader fix changes how a provision is read, not which provisions are read. Measuring one
 * against another economy's cells used to need that economy's whole corpus -- embeddings, the
 * lexical index, the instrument vectors, some 4 GB a database -- only to arrive back at the
 * shortlist the run already recorded. The run records every provision each cell retrieved, with
 * the query, channel and rank that found it, and the instruments its search surfaced and named as
 * governing. That is the retrieval, and replaying it puts exactly the same provisions in front of
 * the new reader.
 *
 * Two things are approximate, and both only in order. The fused order is not stored, so provisions
 * are put back in the order of the instruments the cell surfaced, then by their best rank; that
 * order is what a zero is cited against, and it is the order `surfaced_instruments` recorded. A
 * framework candidate's extra subject provisions are not stored either, so a replayed framework
 * reading sees the candidate's opening and the provisions the cell retrieved from it.
 */
import type { Db } from '../db/index.js';
import type { Channel } from '../index/index.js';
import type { RetrievalRecord, RetrievedSection, Surfacing } from './index.js';

interface StoredCell {
  id: number;
  queries: string | null;
  depth: number | null;
  surfaced: number | null;
  sections_indexed: number | null;
  governing: string | null;
  surfaced_instruments: string | null;
}

interface StoredEntry {
  section_id: number;
  channel: Channel;
  query: string;
  rank: number;
  score: number;
  document_id: number;
  instrument_id: number;
  instrument_title: string;
  heading_path: string;
  text: string;
  anchor: string | null;
}

function storedCell(db: Db, runId: string, economy: string, indicatorId: string): StoredCell | null {
  return (
    (db
      .prepare(
        `SELECT id, queries, depth, surfaced, sections_indexed, governing, surfaced_instruments
           FROM cell WHERE run_id = ? AND economy_code = ? AND indicator_id = ?`,
      )
      .get(runId, economy, indicatorId) as StoredCell | undefined) ?? null
  );
}

function ids(json: string | null): number[] {
  if (!json) return [];
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return [];
  // surfaced_instruments holds objects on some runs and bare ids on others.
  return parsed
    .map((x) => (typeof x === 'number' ? x : (x as { instrumentId?: number } | null)?.instrumentId))
    .filter((x): x is number => typeof x === 'number');
}

/** The retrieval `runId` recorded for this cell, or null when the run has no such cell. */
export function storedRetrieval(db: Db, runId: string, economy: string, indicatorId: string): RetrievalRecord | null {
  const cell = storedCell(db, runId, economy, indicatorId);
  if (!cell) return null;

  const entries = db
    .prepare(
      `SELECT se.section_id, se.channel, se.query, se.rank, se.score,
              s.document_id, d.instrument_id, i.title AS instrument_title, s.heading_path, s.text, s.anchor
         FROM shortlist_entry se
         JOIN section s ON s.id = se.section_id
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE se.cell_id = ?
        ORDER BY se.id`,
    )
    .all(cell.id) as StoredEntry[];

  const bySection = new Map<number, RetrievedSection>();
  for (const e of entries) {
    const found: Surfacing = { channel: e.channel, query: e.query, rank: e.rank, score: e.score };
    const held = bySection.get(e.section_id);
    if (held) {
      held.found.push(found);
      if (!held.channels.includes(e.channel)) held.channels.push(e.channel);
      held.rank = Math.min(held.rank, e.rank);
      continue;
    }
    bySection.set(e.section_id, {
      sectionId: e.section_id,
      documentId: e.document_id,
      instrumentId: e.instrument_id,
      instrumentTitle: e.instrument_title,
      headingPath: e.heading_path,
      text: e.text,
      anchor: e.anchor,
      rank: e.rank,
      channels: [e.channel],
      found: [found],
    });
  }

  const surfacedOrder = new Map(ids(cell.surfaced_instruments).map((id, n) => [id, n] as const));
  const place = (s: RetrievedSection) => surfacedOrder.get(s.instrumentId) ?? Number.MAX_SAFE_INTEGER;
  const sections = [...bySection.values()].sort((a, b) => place(a) - place(b) || a.rank - b.rank);

  const titles = new Map(sections.map((s) => [s.instrumentId, s.instrumentTitle] as const));
  const titleOf = db.prepare('SELECT title FROM instrument WHERE id = ?');
  const governing = ids(cell.governing).map((instrumentId, rank) => ({
    instrumentId,
    title: titles.get(instrumentId) ?? (titleOf.get(instrumentId) as { title: string } | undefined)?.title ?? '',
    rank,
    seated: sections.filter((s) => s.instrumentId === instrumentId).length,
  }));

  const queries = cell.queries ? (JSON.parse(cell.queries) as string[]) : [];
  return {
    indicatorId,
    economy,
    queries,
    depth: cell.depth ?? sections.length,
    surfaced: cell.surfaced ?? sections.length,
    indexedSections: cell.sections_indexed ?? 0,
    perQueryDepth: Math.max(0, ...entries.map((e) => e.rank)),
    governing,
    sections,
  };
}

/** The instruments `runId` examined as a possible framework for this cell, in the order it did. */
export function storedFrameworkCandidates(
  db: Db,
  runId: string,
  economy: string,
  indicatorId: string,
): { instrumentId: number; title: string; url: string; sectionIds: number[] }[] {
  const cell = storedCell(db, runId, economy, indicatorId);
  if (!cell) return [];
  return db
    .prepare(
      `SELECT fr.instrument_id AS instrumentId, i.title, i.source_url AS url
         FROM framework_reading fr JOIN instrument i ON i.id = fr.instrument_id
        WHERE fr.cell_id = ?
        ORDER BY fr.id`,
    )
    .all(cell.id)
    .map((r) => ({ ...(r as { instrumentId: number; title: string; url: string }), sectionIds: [] }));
}
