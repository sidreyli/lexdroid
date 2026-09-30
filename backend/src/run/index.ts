/**
 * The run record.
 *
 * Until this module existed, an answer lived in a terminal and died with it. Every table below was
 * already in the schema and every one of them was empty, which meant a result could be printed but
 * not reopened, not reviewed, not exported, not compared between two engines and not costed. It
 * also meant nobody could check yesterday's number today.
 *
 * What is written here is deliberately more than the answers. A score without the search that
 * produced it is an assertion. So a recorded run carries, per cell: every query asked, which query and channel
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
import { FRAMEWORK_OF, type PillarAnswer } from '../cell/index.js';
import { readInFull } from '../read/index.js';
import { refile, type Decision, type Evidence } from '../decide/index.js';
import type { FxRates } from '../decide/currency.js';
import { locateQuote } from '../util/locate.js';
import type { RetrievalRecord } from '../retrieve/index.js';
import type { RunEvent } from './events.js';
import { hostedConfig } from '../engines/hosted.js';

/** The name a run answers to. Local engines cost nothing, and that is recorded rather than assumed. */
export const DEFAULT_ENGINE = 'engine-a';

export interface RunContext {
  id: string;
  db: Db;
  engine: string;
  /** 'cache-only' may not reach the network for anything, exchange rates included. */
  sourceMode: 'fetch' | 'cache-only';
}

export interface OpenRunOptions {
  economies: string[];
  /** Pillar ids, or 'all'. Recorded verbatim so a partial run is never mistaken for a full one. */
  pillars: number[] | 'all';
  /** Only these indicators of those pillars. Absent or empty is all of them. */
  indicators?: readonly string[];
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
                      code_revision, rubric_derived_at, status, notes, indicators)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?)`,
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
    opts.indicators?.length ? JSON.stringify(opts.indicators) : null,
  );
  return { id, db, engine, sourceMode: opts.sourceMode ?? 'fetch' };
}

/**
 * Attach to a run somebody else opened, so several processes can answer one run together.
 * Refuses a run that is finished: a closed run's totals have already been read.
 */
export function joinRun(db: Db, runId: string, engine?: string): RunContext {
  const row = db.prepare('SELECT engine, status, source_mode FROM run WHERE id = ?').get(runId) as
    | { engine: string; status: string; source_mode: 'fetch' | 'cache-only' }
    | undefined;
  if (!row) throw new Error(`No run ${runId}.`);
  if (row.status !== 'running') throw new Error(`Run ${runId} is ${row.status}, not running.`);
  return { id: runId, db, engine: engine ?? row.engine, sourceMode: row.source_mode };
}

export function finishRun(
  run: RunContext,
  status: 'complete' | 'failed' | 'cancelled' = 'complete',
): void {
  run.db
    .prepare('UPDATE run SET finished_at = ?, status = ? WHERE id = ?')
    .run(new Date().toISOString(), status, run.id);
}

/**
 * The exchange rates this run scores with, settled once for everybody working on it.
 *
 * The first process to arrive writes what it fetched and every other process reads that back, so
 * a fleet of six hosts answering one run cannot price the same threshold two ways. Stored on the
 * run because verification re-derives every score later and must use the rate that produced it.
 */
export function settleRates(run: RunContext, fetched: FxRates | null): FxRates | null {
  if (fetched) {
    run.db
      .prepare('UPDATE run SET fx_rates = ? WHERE id = ? AND fx_rates IS NULL')
      .run(JSON.stringify(fetched), run.id);
  }
  return ratesOfRun(run.db, run.id);
}

/** The rates a run recorded, or null if it recorded none. */
export function ratesOfRun(db: Db, runId: string): FxRates | null {
  const row = db.prepare('SELECT fx_rates FROM run WHERE id = ?').get(runId) as
    | { fx_rates: string | null }
    | undefined;
  if (!row?.fx_rates) return null;
  try {
    return JSON.parse(row.fx_rates) as FxRates;
  } catch {
    return null;
  }
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
                       queries, depth, surfaced, sections_indexed, sections_read, governing,
                       surfaced_instruments, framework_failed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertShortlist = db.prepare(
    `INSERT OR IGNORE INTO shortlist_entry (cell_id, section_id, channel, query, rank, score, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertReading = db.prepare(
    `INSERT OR REPLACE INTO reading
       (cell_id, section_id, engine, model, applies, quote, quote_char_start, quote_char_end,
        subclause, attributes, reasoning, prompt_tokens, output_tokens, latency_ms, engine_call, read_at,
        rejected, unreadable)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertFrameworkReading = db.prepare(
    `INSERT OR REPLACE INTO framework_reading
       (cell_id, instrument_id, engine, model, establishes_framework, framework_words,
        framework_shown, horizontal, dedicated,
        dedicated_words, dedicated_shown, sector_words, sectoral_shown, sector, quote,
        quote_verified, reasoning, prompt_tokens, output_tokens, latency_ms, read_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertBasis = db.prepare(
    `INSERT OR IGNORE INTO answer_basis (cell_id, ordinal, instrument_id, section_id, measure, quote)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertAnswer = db.prepare(
    `INSERT OR REPLACE INTO cell_answer
       (cell_id, score, band_ordinal, band_criterion, deciding_fact, controlling_instrument_id,
        absence_basis, rationale, confirmations_asked, confirmations_applied, computed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const cellIdentity = db.prepare('SELECT run_id, economy_code, indicator_id FROM cell WHERE id = ?');
  const currentTo = new Map(
    (
      db
        .prepare(
          `SELECT id, COALESCE(current_to, last_amended_on) AS current_to FROM instrument
            WHERE economy_code = ?`,
        )
        .all(answer.economy) as { id: number; current_to: string | null }[]
    ).map((r) => [r.id, r.current_to]),
  );

  /** One entry per instrument the cell's search returned, best rank first, as the decision saw it. */
  const surfacedOf = (record: RetrievalRecord | undefined) => {
    const out: { instrumentId: number; instrumentTitle: string; rank: number; currentTo: string | null }[] = [];
    for (const s of record?.sections ?? []) {
      if (out.some((x) => x.instrumentId === s.instrumentId)) continue;
      out.push({
        instrumentId: s.instrumentId,
        instrumentTitle: s.instrumentTitle,
        rank: s.rank,
        currentTo: currentTo.get(s.instrumentId) ?? null,
      });
    }
    return out;
  };

  // Whether a provision belongs to this economy at all. A unit writes only its own corpus, so a
  // section from elsewhere is not a finding about this cell but another unit's row landing on it.
  const economyOf = db.prepare(
    `SELECT i.economy_code AS economy FROM section s
       JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
      WHERE s.id = ?`,
  );
  const owned = new Map<number, boolean>();
  const ownsSection = (sectionId: number): boolean => {
    let own = owned.get(sectionId);
    if (own === undefined) {
      own = (economyOf.get(sectionId) as { economy: string } | undefined)?.economy === answer.economy;
      owned.set(sectionId, own);
    }
    return own;
  };

  const sectionMeta = sectionOffsets(
    db,
    answer.readings.map((r) => r.sectionId),
  );
  // Keyed by subject as well as instrument. 8.1 and 8.2 examine the same instruments -- that is
  // what interleaving the register and the retrieval gets them -- and ask a different question of
  // each. Keyed by instrument alone the two readings of Singapore's Online Safety Act collapsed to
  // whichever was taken last, so a row's words, quote and reasoning could be the other indicator's
  // answer about the same Act while its booleans were its own. The columns disagreed and neither
  // was marked wrong.
  const frameworkByInstrument = new Map(
    answer.frameworkReadings.map((r) => [`${r.subject}:${r.instrumentId}`, r]),
  );

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
          // Read, not sent: the live decision counts only the provisions the engine answered for,
          // and a replay reading every attempt here decided over coverage the run never had.
          answer.readings.filter(readInFull).length,
          // The register's verdict on which instruments govern the question. Recorded because the
          // score is derived from it, and a score that cannot be re-derived is not computed.
          JSON.stringify((record?.governing ?? []).map((g) => g.instrumentId)),
          // The instruments this cell's search surfaced, best first. A zero is cited against one
          // of these, and a count cannot say which -- so a zero could not be reproduced from the
          // record that was meant to evidence it.
          JSON.stringify(surfacedOf(record)),
          answer.frameworkUnread?.[decision.indicatorId] ?? null,
        ).lastInsertRowid,
      );

      // That the row we are about to hang a cell's whole record on is the row we just made.
      // Units run concurrently against one database, and in the twelve-pillar run one unit's
      // readings landed on another's cell: 5,446 provisions of the wrong economy, scored.
      const identity = cellIdentity.get(cellId) as
        | { run_id: string; economy_code: string; indicator_id: string }
        | undefined;
      if (
        !identity ||
        identity.run_id !== run.id ||
        identity.economy_code !== answer.economy ||
        identity.indicator_id !== decision.indicatorId
      ) {
        throw new Error(
          `cell ${cellId} is not the cell just created for ${answer.economy} ${decision.indicatorId}; ` +
            'refusing to write another unit\'s record',
        );
      }

      // What this cell asked for, and what each question returned. The shortlist is the cell's own
      // retrieval; the readings below cover the pillar's whole union, which is larger by design.
      // read_at is documented as NULL when a candidate never reached the model, and was being
      // stamped on every row. It is the only record of whether retrieval's own pick was used.
      const wasRead = new Set(answer.readings.map((r) => r.sectionId));
      for (const s of record?.sections ?? []) {
        if (!ownsSection(s.sectionId)) continue;
        for (const f of s.found) {
          insertShortlist.run(cellId, s.sectionId, f.channel, f.query, f.rank, f.score,
            wasRead.has(s.sectionId) ? now : null);
        }
      }

      // Every provision read against this cell, including -- especially -- the ones that said
      // nothing. A cell scoring zero is evidenced by these rows and by nothing else.
      for (const reading of answer.readings) {
        // A provision of another economy is not evidence about this one, whatever it says.
        if (!ownsSection(reading.sectionId)) {
          recordDiscard(run, {
            stage: 'read',
            subject: `${decision.indicatorId} :: section ${reading.sectionId}`,
            reason: `the provision is not in ${answer.economy}'s corpus`,

          });
          continue;
        }
        // A provision the engine did not answer on was not read. Written as a reading it became
        // applies = 0 -- "read, and nothing applies" -- which is the evidence a zero is made of,
        // made out of an engine failure. It goes on the discard record instead, where it is
        // countable and says what went wrong.
        if (reading.failure !== null) {
          recordDiscard(run, {
            stage: 'read',
            subject: `${decision.indicatorId} :: section ${reading.sectionId}`,
            reason: 'the engine gave no usable answer on this provision',
            detail: reading.failure,
          });
          continue;
        }
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
          `${reading.carriedFrom ?? run.id}:p${answer.pillarId}:s${reading.sectionId}`,
          now,
          // What the answer held that did not become a finding, so a replay can tell a clean
          // negative from a reading whose claims were all thrown away. The call's, repeated on each
          // of its rows like the tokens are.
          reading.rejected.length,
          reading.unreadable ?? 0,
        );
      }

      // Every instrument examined for a framework, not only the ones that became a basis. A cell
      // saying "none of the 5 instruments examined establishes such a framework" held no rows at
      // all for those five, so the strongest claim in the rubric had no record behind it.
      //
      // Which is what this line said and did not do: preferring the basis whenever there was one
      // kept the negatives only for cells that found nothing, and dropped them exactly where they
      // are most worth having -- beside a positive, saying what was rejected in its favour.
      // Singapore's pillar 8 examined ten instruments on 17 September and recorded two. The basis
      // is the fallback now, for a decision that named instruments the examined list somehow did
      // not carry; the examined list leads.
      const examined =
        answer.frameworkExamined[decision.indicatorId] ?? decision.frameworkBasis;
      const subject = FRAMEWORK_OF[decision.indicatorId];
      for (const f of examined) {
        const reading = subject ? frameworkByInstrument.get(`${subject}:${f.instrumentId}`) : undefined;
        insertFrameworkReading.run(
          cellId,
          f.instrumentId,
          run.engine,
          reading?.model ?? answer.model,
          f.establishesFramework ? 1 : 0,
          reading?.frameworkWords ?? null,
          f.frameworkShown ? 1 : 0,
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

      // What the score stood on, in the decision's order. The export shows these and nothing
      // else, so a finding Zone 3 set aside cannot reappear as a measure in the deliverable.
      let ordinal = 0;
      for (const e of decision.basis) {
        if (!ownsSection(e.sectionId)) continue;
        insertBasis.run(cellId, (ordinal += 1), e.instrumentId, e.sectionId, e.finding.measure, e.finding.quote);
      }
      // A framework is one measure however many instruments carry it, so the leading instrument is
      // the basis and the rest are corroboration the row names in its notes. `frameworkBasis`
      // otherwise holds what was examined and found wanting, which is a record, not a basis.
      const framework = decision.state === 'restricted' ? decision.frameworkBasis[0] : undefined;
      if (framework) insertBasis.run(cellId, (ordinal += 1), framework.instrumentId, null, null, null);

      insertAnswer.run(
        cellId,
        decision.score,
        decision.band?.ordinal ?? null,
        decision.band?.criterion ?? null,
        decision.decidingFact,
        controllingInstrument(decision),
        // Whether the zero stands on an instrument read to govern the subject or one the search
        // merely returned. Only the first sustains a band that scores for an absence.
        decision.absence?.basis ?? null,
        decision.rationale,
        decision.confirmations?.asked ?? null,
        decision.confirmations?.applied ?? null,
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
          // A claim too malformed to coerce into a finding has none; it is still counted.
          subject: `section ${reading.sectionId} :: ${r.finding?.indicatorId ?? '?'}`,
          reason: r.reason,
          detail: r.finding?.quote ?? null,
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
    // Immediate, not deferred: a deferred transaction reads first and asks for the write lock
    // later, so two units can interleave between a cell being made and its record being written.
  }).immediate();
}

/**
 * What the run cost to rent, which is not what it cost to compute.
 * A hired GPU bills for the hour whether it is decoding or idle, so the launcher charges hours.
 */
/**
 * What a pass over a run's findings cost, added to the run's own record.
 *
 * The confirmation pass asks one question per finding and was billed nowhere, so a run's recorded
 * cost was its first reading alone.
 */
export function recordPassCost(
  db: Db,
  runId: string,
  model: string,
  cost: { calls: number; promptTokens: number; outputTokens: number; seconds: number },
): void {
  const run = db.prepare('SELECT engine FROM run WHERE id = ?').get(runId) as { engine: string } | undefined;
  if (!run) return;
  db.prepare(
    `INSERT INTO run_cost (run_id, engine, model, calls, prompt_tokens, output_tokens, wall_seconds, usd, usd_unknown)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT (run_id, engine, model) DO UPDATE SET
       calls = calls + excluded.calls,
       prompt_tokens = prompt_tokens + excluded.prompt_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       wall_seconds = wall_seconds + excluded.wall_seconds,
       usd_unknown = MAX(usd_unknown, excluded.usd_unknown)`,
  ).run(runId, run.engine, model, cost.calls, cost.promptTokens, cost.outputTokens, cost.seconds, hostedConfig() ? 1 : 0);
}

export function recordRent(db: Db, runId: string, engine: string, model: string, usd: number): void {
  db.prepare(
    `INSERT INTO run_cost (run_id, engine, model, usd) VALUES (?, ?, ?, ?)
     ON CONFLICT (run_id, engine, model) DO UPDATE SET usd = usd + excluded.usd`,
  ).run(runId, engine, model, usd);
}

/**
 * What a run says about itself when it was replayed instead of measured.
 *
 * On the run's own notes, where anyone reopening it reads it first. A cached run answers a
 * question about the scoring code; it answers nothing about the engine, the corpus or the time.
 */
export const CACHED_RUN_NOTE = 'SERVED FROM THE DEVELOPMENT CACHE -- not a measurement, not quotable as a result';

/**
 * What a run says when a unit was killed and picked up where it stopped.
 *
 * Not the note above and not the same claim. Every reading here was asked for once and answered
 * once by this run's own engine; what the restart avoided was paying a second time for provisions
 * already read. Wall-clock for that pillar is no longer a measurement, and engine time still is.
 */
export const RESUMED_RUN_NOTE =
  'RESUMED AFTER AN INTERRUPTION -- every reading was performed by this run; per-pillar wall-clock is not a measurement';

/**
 * What a run says when it reused an earlier run's readings.
 *
 * Neither of the two above. Nothing here was replayed from a cache and nothing was asked twice:
 * the provisions this run added were read by its own engine, and the provisions the named run had
 * already read keep that run's answers and that run's call ids. It is a valid measurement of a
 * retrieval change against the run it names, and it is not a fresh reading of the whole corpus.
 */
export const CARRIED_RUN_NOTE =
  'CARRIED READINGS FROM AN EARLIER RUN -- only the provisions this change added were read afresh; compare against that run, not as a standalone corpus read';

function note(db: Db, run: RunContext, text: string): void {
  db.prepare(
    `UPDATE run SET notes = CASE
       WHEN notes IS NULL OR notes = '' THEN ?
       WHEN notes LIKE ? THEN notes
       ELSE notes || ' | ' || ? END
     WHERE id = ?`,
  ).run(text, `%${text}%`, text, run.id);
}

/** One engine call per provision per pillar, plus one per framework candidate. */
function addCost(db: Db, run: RunContext, answer: PillarAnswer): void {
  // Calls made, not provisions read: a long provision is read in parts, one call each.
  const calls = answer.readings.reduce((n, r) => n + (r.calls ?? 1), 0) + answer.frameworkReadings.length;
  const prompt =
    answer.readings.reduce((n, r) => n + r.promptTokens, 0) +
    answer.frameworkReadings.reduce((n, r) => n + r.promptTokens, 0);
  const output =
    answer.readings.reduce((n, r) => n + r.completionTokens, 0) +
    answer.frameworkReadings.reduce((n, r) => n + r.completionTokens, 0);

  db.prepare(
    `INSERT INTO run_cost (run_id, engine, model, calls, prompt_tokens, output_tokens, cached_calls, wall_seconds, usd, usd_unknown)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT (run_id, engine, model) DO UPDATE SET
       calls = calls + excluded.calls,
       prompt_tokens = prompt_tokens + excluded.prompt_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       cached_calls = cached_calls + excluded.cached_calls,
       wall_seconds = wall_seconds + excluded.wall_seconds,
       usd_unknown = MAX(usd_unknown, excluded.usd_unknown)`,
  ).run(
    run.id,
    run.engine,
    answer.model,
    calls,
    prompt,
    output,
    answer.cachedCalls + answer.carriedCalls,
    answer.engineMs / 1000,
    // A hosted engine bills by the token at a price this run was never told.
    hostedConfig() ? 1 : 0,
  );

  // A run that replayed even one answer says so on its own record, not only in a column someone
  // has to know to look at.
  if (answer.cachedCalls > 0) note(db, run, CACHED_RUN_NOTE);
  if (answer.resumedCalls > 0) note(db, run, RESUMED_RUN_NOTE);
  if (answer.carriedCalls > 0) note(db, run, CARRIED_RUN_NOTE);
}

/**
 * The instrument the answer rests on.
 *
 * For a score above zero, the instrument the leading evidence came from. For a zero, the
 * instrument the absence was read against. A zero row names what it read and says what it does
 * not require, and a zero that names nothing is an assertion rather than a finding.
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
