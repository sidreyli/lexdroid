/**
 * Reads the working store read-only and writes the fixtures the app renders.
 * Never opens the database for writing and never runs a pipeline stage.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CHECKOUT = resolve(process.env.LEXDROID_CHECKOUT ?? 'C:/Users/sidha/Code/Projects/lexdroid');
const DB = join(CHECKOUT, 'backend/data/lexdroid.db');
const OUT = resolve('lib/data/fixtures');
const CONTEXT_CHARS = 2600;

function query(sql) {
  const raw = execFileSync(
    'sqlite3',
    ['-readonly', '-json', `file:${DB.replace(/\\/g, '/')}?mode=ro`, sql],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 512 },
  );
  return raw.trim() ? JSON.parse(raw) : [];
}

const jsonOr = (raw, fallback) => {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const nullIfBlank = (v) => (v === '' || v === undefined ? null : v);

mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// Rubric and economy profiles are checked-in files, so they are copied as they are.
// ---------------------------------------------------------------------------

const rubric = JSON.parse(readFileSync(join(CHECKOUT, 'backend/data/rubric.json'), 'utf8'));
writeFileSync(join(OUT, 'rubric.json'), JSON.stringify(rubric));

const profileDir = join(CHECKOUT, 'backend/data/profiles');
const profiles = readdirSync(profileDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(profileDir, f), 'utf8')));

// ---------------------------------------------------------------------------
// What each economy's corpus holds. Mirrors corpusOf() in the API.
// ---------------------------------------------------------------------------

const corpusRows = query(`
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

const unreadRows = query(`
  SELECT i.economy_code AS economy, u.reason, COUNT(*) AS count
    FROM unread_document u
    JOIN document d ON d.id = u.document_id
    JOIN instrument i ON i.id = d.instrument_id
   GROUP BY 1, 2 ORDER BY 3 DESC`);

const economies = profiles.map((p) => {
  const c = corpusRows.find((r) => r.economy === p.code) ?? {};
  return {
    ...p,
    corpus: {
      instruments: c.instruments ?? 0,
      documents: c.documents ?? 0,
      sections: c.sections ?? 0,
      embedded: c.embedded ?? 0,
      unread: unreadRows.filter((u) => u.economy === p.code).map((u) => ({ reason: u.reason, count: u.count })),
    },
  };
});
writeFileSync(join(OUT, 'economies.json'), JSON.stringify(economies));

// ---------------------------------------------------------------------------
// Cells. One answer per economy and indicator: the newest complete run wins,
// and every earlier answer is kept beside it as history.
// ---------------------------------------------------------------------------

const cellRows = query(`
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

const cells = cellRows.map((c) => ({
  ...c,
  queries: jsonOr(c.queries, []),
  unresolvedReason: nullIfBlank(c.unresolvedReason),
  controllingInstrument: nullIfBlank(c.controllingInstrument),
  controllingInstrumentUrl: nullIfBlank(c.controllingInstrumentUrl),
}));
writeFileSync(join(OUT, 'cells.json'), JSON.stringify(cells));

// ---------------------------------------------------------------------------
// Export rows, each with its gates and the source text behind its citation.
// ---------------------------------------------------------------------------

const rows = query(`
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

const gates = query(`
  SELECT export_row_id AS rowId, gate, passed, detail
    FROM gate_result ORDER BY export_row_id, gate`);

// The window of document text a reviewer reads around the cited words, with the
// offsets rebased onto it so the span is highlighted where it actually sits.
const withSection = [...new Set(rows.map((r) => r.sectionId).filter(Boolean))];
const textRows = withSection.length
  ? query(`
      SELECT s.id AS sectionId, s.text AS sectionText, dt.text AS documentText
        FROM section s JOIN document_text dt ON dt.document_id = s.document_id
       WHERE s.id IN (${withSection.join(',')})`)
  : [];
const textBySection = new Map(textRows.map((t) => [t.sectionId, t]));

const exportRows = rows.map((r) => {
  const t = textBySection.get(r.sectionId);
  let context = null;
  if (t && r.quoteCharStart != null && r.quoteCharEnd != null) {
    const from = Math.max(0, r.quoteCharStart - CONTEXT_CHARS);
    const to = Math.min(t.documentText.length, r.quoteCharEnd + CONTEXT_CHARS);
    context = {
      text: t.documentText.slice(from, to),
      offset: from,
      quoteStart: r.quoteCharStart - from,
      quoteEnd: r.quoteCharEnd - from,
      truncatedStart: from > 0,
      truncatedEnd: to < t.documentText.length,
    };
  }
  return {
    ...r,
    article: nullIfBlank(r.article),
    discoveryTag: nullIfBlank(r.discoveryTag),
    locationReference: nullIfBlank(r.locationReference),
    verbatimSnippet: nullIfBlank(r.verbatimSnippet),
    notes: nullIfBlank(r.notes),
    attributes: jsonOr(r.attributes, []),
    sectionText: t?.sectionText ?? null,
    context,
    gates: gates.filter((g) => g.rowId === r.id).map((g) => ({ gate: g.gate, passed: !!g.passed, detail: nullIfBlank(g.detail) })),
  };
});
writeFileSync(join(OUT, 'export-rows.json'), JSON.stringify(exportRows));

// ---------------------------------------------------------------------------
// Runs, what they cost and where their time went.
// ---------------------------------------------------------------------------

const runRows = query(`
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

const stageRows = query(`
  SELECT run_id AS runId, stage, SUM(seconds) AS seconds, SUM(items) AS items
    FROM run_stage GROUP BY 1, 2`);

const runs = runRows.map((r) => ({
  ...r,
  rows: r.rows_,
  rows_: undefined,
  economies: jsonOr(r.economies, []),
  pillars: jsonOr(r.pillars, 'all'),
  notes: nullIfBlank(r.notes),
  stages: stageRows.filter((s) => s.runId === r.id).map((s) => ({ stage: s.stage, seconds: s.seconds, items: s.items })),
}));
writeFileSync(join(OUT, 'runs.json'), JSON.stringify(runs));

// The tail of the newest run's ledger, so the run view has something to render
// before a live stream is wired to it.
const newest = runRows[0]?.id;
const events = newest
  ? query(`
      SELECT id, run_id AS runId, at, economy_code AS economy, pillar_id AS pillarId,
             indicator_id AS indicatorId, stage, kind, subject, detail, seconds, done, total
        FROM run_event WHERE run_id = '${newest}' ORDER BY id DESC LIMIT 400`).reverse()
  : [];
writeFileSync(join(OUT, 'run-events.json'), JSON.stringify(events));

const discards = query(`
  SELECT stage, reason, COUNT(*) AS count FROM discard GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40`);
writeFileSync(join(OUT, 'discards.json'), JSON.stringify(discards));

const size = (f) => (readFileSync(join(OUT, f)).length / 1024).toFixed(0).padStart(7) + ' kB';
for (const f of readdirSync(OUT)) console.log(`${size(f)}  ${f}`);
console.log(`\n${cells.length} cells, ${exportRows.length} rows, ${runs.length} runs, ${economies.length} economies`);
