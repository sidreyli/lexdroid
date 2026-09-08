/**
 * The run record.
 *
 * Until this module existed, an answer lived in a terminal and died with it. Every table below was
 * already in the schema and every one of them was empty, which meant a result could be printed but
 * not reopened, not reviewed, not exported, not compared between two engines and not costed. It
 * also meant nobody could check yesterday's number today.
 *
 * What is written here is deliberately more than the answers. A score without the search that
 * produced it is an assertion, and ESCAP's reviewers rejected assertions across the graded
 * submissions. So a recorded run carries, per cell: every query asked, which query and channel
 * surfaced each provision and at what rank, what the engine said about each provision including
 * when it said nothing, the score, the band, the one fact that chose that band, and everything
 * that was found and deliberately not counted.
 *
 * Nothing is deleted here and nothing is summarised away. A finding the reader got wrong is a
 * discard with a reason, not an absence.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { Db } from '../db/index.js';
import { loadRubric } from '../rubric/index.js';
import type { PillarAnswer } from '../cell/index.js';
import { refile, type Decision, type Evidence } from '../decide/index.js';
import { locateQuote } from '../util/locate.js';
import type { RunEvent } from './events.js';

/** The name a run answers to. Local engines cost nothing, and that is recorded rather than assumed. */
export const DEFAULT_ENGINE = 'engine-a';

export interface RunContext {
  id: string;
  db: Db;
  engine: string;
}

export interface OpenRunOptions {
  economies: string[];
  /** Pillar ids, or 'all'. Recorded verbatim so a partial run is never mistaken for a full one. */
  pillars: number[] | 'all';
  model: string;
  engine?: string;
  sourceMode?: 'fetch' | 'cache-only';
  notes?: string;
}

/**
 * Which code answered.
 *
 * The --dirty suffix is the point of it. An artefact produced from an edited working tree is not
 * reproducible, and a run that says so is worth more than one that quietly implies it is.
 */
export function codeRevision(): string {
  try {
    return execSync('git describe --always --dirty', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

export function openRun(db: Db, opts: OpenRunOptions): RunContext {
  const id = randomUUID();
  const engine = opts.engine ?? DEFAULT_ENGINE;
  db.prepare(
    `INSERT INTO run (id, started_at, economies, pillars, engine, engine_model, source_mode,
                      code_revision, rubric_derived_at, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
  ).run(
    id,
    new Date().toISOString(),
    JSON.stringify(opts.economies),
    JSON.stringify(opts.pillars),
    engine,
    opts.model,
    opts.sourceMode ?? 'fetch',
    codeRevision(),
    loadRubric().derivedAt,
    opts.notes ?? null,
  );
  return { id, db, engine };
}

export function finishRun(
  run: RunContext,
  status: 'complete' | 'failed' | 'cancelled' = 'complete',
): void {
  run.db
    .prepare('UPDATE run SET finished_at = ?, status = ? WHERE id = ?')
    .run(new Date().toISOString(), status, run.id);
}

export interface DiscardInput {
  stage: string;
  subject: string;
  reason: string;
  detail?: string;
}

/** Everything set aside, at any stage, with the reason. Absence is never silent. */
export function recordDiscard(run: RunContext, d: DiscardInput): void {
  run.db
    .prepare(
      'INSERT INTO discard (run_id, stage, subject, reason, detail, recorded_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(run.id, d.stage, d.subject, d.reason, d.detail ?? null, new Date().toISOString());
}

/**
 * One thing that happened, written down as it happens.
 *
 * Separate from recordStage, which is a total struck after the fact. This is the running commentary
 * a person can watch and a reviewer can reopen, and it is the same rows for both.
 */
export function recordEvent(run: RunContext, e: RunEvent): void {
  run.db
    .prepare(
      `INSERT INTO run_event (run_id, at, economy_code, pillar_id, indicator_id, stage, kind,
                              subject, detail, seconds, done, total, prompt_tokens, output_tokens)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      run.id,
      new Date().toISOString(),
      e.economy ?? null,
      e.pillarId ?? null,
      e.indicatorId ?? null,
      e.stage,
      e.kind,
      e.subject ?? null,
      e.detail ?? null,
      e.seconds ?? null,
      e.done ?? null,
      e.total ?? null,
      e.promptTokens ?? null,
      e.outputTokens ?? null,
    );
}

/** Everything the run has said, in order. `after` follows a run that is still going. */
export function runEvents(db: Db, runId: string, after = 0, limit = 500): (RunEvent & { id: number; at: string })[] {
  const rows = db
    .prepare(
      `SELECT id, at, economy_code, pillar_id, indicator_id, stage, kind, subject, detail,
              seconds, done, total, prompt_tokens, output_tokens
         FROM run_event WHERE run_id = ? AND id > ? ORDER BY id LIMIT ?`,
    )
    .all(runId, after, limit) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r['id'] as number,
    at: r['at'] as string,
    stage: r['stage'] as RunEvent['stage'],
    kind: r['kind'] as RunEvent['kind'],
    ...(r['economy_code'] === null ? {} : { economy: r['economy_code'] as string }),
    ...(r['pillar_id'] === null ? {} : { pillarId: r['pillar_id'] as number }),
    ...(r['indicator_id'] === null ? {} : { indicatorId: r['indicator_id'] as string }),
    ...(r['subject'] === null ? {} : { subject: r['subject'] as string }),
    ...(r['detail'] === null ? {} : { detail: r['detail'] as string }),
    ...(r['seconds'] === null ? {} : { seconds: r['seconds'] as number }),
    ...(r['done'] === null ? {} : { done: r['done'] as number }),
    ...(r['total'] === null ? {} : { total: r['total'] as number }),
    ...(r['prompt_tokens'] === null ? {} : { promptTokens: r['prompt_tokens'] as number }),
    ...(r['output_tokens'] === null ? {} : { outputTokens: r['output_tokens'] as number }),
  }));
}

export interface StageInput {
  stage: string;
  economy?: string;
  pillarId?: number;
  seconds: number;
  items?: number;
}

/**
 * Where the time went.
 *
 * Recorded per stage rather than as one duration, because the question this answers is not "was
 * the run slow" but "what would a run twenty times this size cost" -- and those have different
 * answers depending on which stage the seconds are in. A stage that is a fixed cost stays flat;
 * one that is per-provision does not.
 */
export function recordStage(run: RunContext, s: StageInput): void {
  run.db
    .prepare(
      `INSERT INTO run_stage (run_id, stage, economy_code, pillar_id, seconds, items, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(run.id, s.stage, s.economy ?? null, s.pillarId ?? null, s.seconds, s.items ?? null, new Date().toISOString());
}

/** Time a step and record it under the run in one move, returning whatever the step returned. */
export async function timed<T>(
  run: RunContext | null,
  s: Omit<StageInput, 'seconds'>,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    if (run) recordStage(run, { ...s, seconds: (Date.now() - started) / 1000 });
  }
}

/**
 * One pillar's answers, written down.
 *
 * A single transaction, because a half-recorded run is worse than an unrecorded one: it looks like
 * a finished run that found less.
 */
export function recordPillarAnswer(run: RunContext, answer: PillarAnswer): void {
  const db = run.db;
  const now = new Date().toISOString();

  const insertCell = db.prepare(
    `INSERT INTO cell (run_id, economy_code, indicator_id, state, unresolved_reason, answered_at,
                       queries, depth, surfaced, sections_indexed, sections_read)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertShortlist = db.prepare(
    `INSERT OR IGNORE INTO shortlist_entry (cell_id, section_id, channel, query, rank, score, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertReading = db.prepare(
    `INSERT OR REPLACE INTO reading
       (cell_id, section_id, engine, model, applies, quote, quote_char_start, quote_char_end,
        subclause, attributes, reasoning, prompt_tokens, output_tokens, latency_ms, engine_call, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFrameworkReading = db.prepare(
    `INSERT OR REPLACE INTO framework_reading
       (cell_id, instrument_id, engine, model, establishes_framework, horizontal, dedicated,
        dedicated_words, dedicated_shown, sector_words, sectoral_shown, sector, quote,
        quote_verified, reasoning, prompt_tokens, output_tokens, latency_ms, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAnswer = db.prepare(
    `INSERT OR REPLACE INTO cell_answer
       (cell_id, score, band_ordinal, band_criterion, deciding_fact, controlling_instrument_id,
        rationale, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const sectionMeta = sectionOffsets(
    db,
    answer.readings.map((r) => r.sectionId),
  );
  const frameworkByInstrument = new Map(answer.frameworkReadings.map((r) => [r.instrumentId, r]));

  db.transaction(() => {
    for (const decision of answer.decisions) {
      const record = answer.retrieval.find((r) => r.indicatorId === decision.indicatorId);

      const cellId = Number(
        insertCell.run(
          run.id,
          answer.economy,
          decision.indicatorId,
          decision.state,
          decision.state === 'unresolved' ? decision.rationale : null,
          now,
          JSON.stringify(record?.queries ?? []),
          record?.depth ?? null,
          record?.surfaced ?? null,
          record?.indexedSections ?? null,
          answer.readings.length,
        ).lastInsertRowid,
      );

      // What this cell asked for, and what each question returned. The shortlist is the cell's own
      // retrieval; the readings below cover the pillar's whole union, which is larger by design.
      for (const s of record?.sections ?? []) {
        for (const f of s.found) {
          insertShortlist.run(cellId, s.sectionId, f.channel, f.query, f.rank, f.score, now);
        }
      }

      // Every provision read against this cell, including -- especially -- the ones that said
      // nothing. A cell scoring zero is evidenced by these rows and by nothing else.
      for (const reading of answer.readings) {
        // Filed the way the decision filed it, not the way the reader did. These rows are what a
        // later verification re-derives the score from, and a finding the rubric moved between two
        // indicators used to be written under the one the reader named -- so the cell that acted
        // on it did not have it, and the score could not be reproduced from the record. The
        // reader's own filing travels with the finding rather than being lost.
        const mine = reading.findings.map(refile).filter((f) => f.indicatorId === decision.indicatorId);
        const lead = mine[0];
        const offsets = lead ? quoteOffsets(sectionMeta.get(reading.sectionId), lead.quote) : null;
        insertReading.run(
          cellId,
          reading.sectionId,
          run.engine,
          reading.model,
          mine.length > 0 ? 1 : 0,
          lead?.quote ?? null,
          offsets?.start ?? null,
          offsets?.end ?? null,
          lead?.dutyAct ?? null,
          JSON.stringify(mine),
          lead?.requirement ?? null,
          reading.promptTokens,
          reading.completionTokens,
          reading.durationMs,
          `${run.id}:p${answer.pillarId}:s${reading.sectionId}`,
          now,
        );
      }

      for (const f of decision.frameworkBasis) {
        const reading = frameworkByInstrument.get(f.instrumentId);
        insertFrameworkReading.run(
          cellId,
          f.instrumentId,
          run.engine,
          reading?.model ?? answer.model,
          f.establishesFramework ? 1 : 0,
          f.horizontal ? 1 : 0,
          f.dedicated ? 1 : 0,
          reading?.dedicatedWords ?? null,
          f.dedicatedShown ? 1 : 0,
          reading?.sectorWords ?? null,
          f.sectoralShown ? 1 : 0,
          f.sector,
          f.quote,
          reading?.quoteVerified ? 1 : 0,
          reading?.reasoning ?? null,
          reading?.promptTokens ?? null,
          reading?.completionTokens ?? null,
          reading?.durationMs ?? null,
          now,
        );
      }

      insertAnswer.run(
        cellId,
        decision.score,
        decision.band?.ordinal ?? null,
        decision.band?.criterion ?? null,
        decision.decidingFact,
        controllingInstrument(decision),
        decision.rationale,
        now,
      );

      // Found and deliberately not counted. The reason is the indicator's own text, so a reviewer
      // can disagree with the rule rather than guess at what happened.
      for (const x of decision.excluded) {
        recordDiscard(run, {
          stage: 'decide',
          subject: `${decision.indicatorId} :: ${x.evidence.instrumentTitle} :: ${x.evidence.headingPath}`,
          reason: x.reason,
          detail: x.evidence.finding.quote,
        });
      }
      for (const h of decision.held) {
        recordDiscard(run, {
          stage: 'decide',
          subject: `${decision.indicatorId} :: ${h.evidence.instrumentTitle} :: ${h.evidence.headingPath}`,
          reason: h.reason,
          detail: h.evidence.finding.quote,
        });
      }
    }

    // Provisions the engine never answered on. Written to the same ledger as everything else set
    // aside, because a cell that scored zero over a corpus with holes in it should be auditable as
    // such rather than presenting the holes as silence.
    for (const reading of answer.readings) {
      if (reading.failure === null) continue;
      recordDiscard(run, {
        stage: 'read',
        subject: `section ${reading.sectionId}`,
        reason: 'the engine did not answer',
        detail: reading.failure,
      });
    }

    // Findings the engine returned that did not survive the checks the reader runs on itself.
    // Recorded once for the pillar, not once per cell: they belong to the reading, not the score.
    for (const reading of answer.readings) {
      for (const r of reading.rejected) {
        recordDiscard(run, {
          stage: 'read',
          subject: `section ${reading.sectionId} :: ${r.finding.indicatorId}`,
          reason: r.reason,
          detail: r.finding.quote,
        });
      }
    }

    // Where this pillar's wall time went. Written with the answers rather than beside them, so a
    // recorded run always carries its own cost and a partial run carries a partial one.
    for (const st of answer.stages) {
      recordStage(run, {
        stage: st.stage,
        economy: answer.economy,
        pillarId: answer.pillarId,
        seconds: st.seconds,
        items: st.items,
      });
    }

    addCost(db, run, answer);
  })();
}

/** One engine call per provision per pillar, plus one per framework candidate. */
function addCost(db: Db, run: RunContext, answer: PillarAnswer): void {
  const calls = answer.readings.length + answer.frameworkReadings.length;
  const prompt =
    answer.readings.reduce((n, r) => n + r.promptTokens, 0) +
    answer.frameworkReadings.reduce((n, r) => n + r.promptTokens, 0);
  const output =
    answer.readings.reduce((n, r) => n + r.completionTokens, 0) +
    answer.frameworkReadings.reduce((n, r) => n + r.completionTokens, 0);

  db.prepare(
    `INSERT INTO run_cost (run_id, engine, model, calls, prompt_tokens, output_tokens, cached_calls, wall_seconds, usd)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0)
     ON CONFLICT (run_id, engine, model) DO UPDATE SET
       calls = calls + excluded.calls,
       prompt_tokens = prompt_tokens + excluded.prompt_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       wall_seconds = wall_seconds + excluded.wall_seconds`,
  ).run(run.id, run.engine, answer.model, calls, prompt, output, answer.engineMs / 1000);
}

/**
 * The instrument the answer rests on.
 *
 * For a score above zero, the instrument the leading evidence came from. For a zero, the
 * instrument the absence was read against -- ESCAP's own zero rows name what they read and say
 * what it does not require, and a zero that names nothing is an assertion rather than a finding.
 */
function controllingInstrument(decision: Decision): number | null {
  const lead: Evidence | undefined = decision.basis[0];
  if (lead) return lead.instrumentId;
  if (decision.absence) return decision.absence.instrumentId;
  return decision.frameworkBasis[0]?.instrumentId ?? null;
}

interface SectionMeta {
  text: string;
  charStart: number;
}

function sectionOffsets(db: Db, ids: number[]): Map<number, SectionMeta> {
  const out = new Map<number, SectionMeta>();
  const unique = [...new Set(ids)];
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const rows = db
      .prepare(
        `SELECT id, text, char_start FROM section WHERE id IN (${slice.map(() => '?').join(',')})`,
      )
      .all(...slice) as { id: number; text: string; char_start: number }[];
    for (const r of rows) out.set(r.id, { text: r.text, charStart: r.char_start });
  }
  return out;
}

/**
 * Where the quote sits in the document, so a verifier can read it back rather than trust that the
 * parser would produce the same string again.
 *
 * Folded on both sides before matching, because the reader returns the source's words in its own
 * typography; the span reported is still a span of the original text.
 */
function quoteOffsets(
  meta: SectionMeta | undefined,
  quote: string,
): { start: number; end: number } | null {
  if (!meta) return null;
  const at = locateQuote(meta.text, quote);
  return at ? { start: meta.charStart + at.start, end: meta.charStart + at.end } : null;
}
