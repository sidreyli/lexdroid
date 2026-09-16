/**
 * The cell, answered.
 *
 * One economy and one indicator is the unit of work, but the unit of *reading* is a pillar: a
 * provision is read once against the whole pillar's rubric and its findings are then sorted to the
 * indicators they belong to. Reading per indicator would put the same section through the engine
 * four times for pillar 6 and ask it, each time, to consider a distinction in isolation from the
 * one it is defined against.
 *
 * Nothing here decides anything. It retrieves, reads, and hands the facts to Zone 3, and the
 * record it returns is what a reviewer sees: which provisions were looked at, what each was found
 * to say, which of those the score rests on, and which were found and deliberately not counted.
 */
import type { Db } from '../db/index.js';
import type { Emit } from '../run/events.js';
import { citationUrl } from '../export/index.js';
import { enginePool } from '../engines/pool.js';
import { amendsAnotherAct, citesADefinition } from '../parse/identity.js';
import { loadProfile } from '../profile/index.js';
import type { InstrumentType } from '../profile/types.js';
import type { Indicator } from '../rubric/types.js';
import { indicatorsOfPillar, loadRubric } from '../rubric/index.js';
import { loadVectors, type LoadedVectors } from '../index/index.js';
import { retrieveForIndicator, type RetrievalRecord } from '../retrieve/index.js';
import { shortlistInstruments } from '../shortlist/index.js';
import {
  openingOf,
  readFramework,
  readSection,
  subjectQueries,
  READING_MODEL,
  type FrameworkReading,
  type FrameworkSubject,
  type SectionInput,
  type SectionReading,
} from '../read/index.js';
import { carriedReadings } from '../read/carry.js';
import type { FxRates } from '../decide/currency.js';
import {
  decide,
  type Coverage,
  type Decision,
  type Evidence,
  type FrameworkEvidence,
  type SurfacedInstrument,
} from '../decide/index.js';

/**
 * How many provisions one engine reads at once. One: batching changes the answers, measured twice.
 * scripts/concurrency.ts is the re-test -- 18 of 40 read differently at two, 0 at one.
 */
const READ_CONCURRENCY = Math.max(1, Number(process.env['LEXDROID_READ_CONCURRENCY'] ?? 1));

/**
 * How many provisions the pillar reads at once: one per engine. Width comes from engines, which
 * changed no answers, never from asking one engine for more, which changed many.
 */
function readWidth(): number {
  return enginePool().width() * READ_CONCURRENCY;
}

/** How many instruments a framework indicator examines. */
const FRAMEWORK_CANDIDATES = 5;

/**
 * How long one stage took, and what it bought.
 *
 * A total tells you the run was slow. This tells you which part of it was, which is the only form
 * of the number that can answer whether a wider run is affordable: a stage that is a twentieth of
 * nine cells can be most of six hundred.
 */
export interface StageTiming {
  stage: 'retrieve' | 'read' | 'framework' | 'decide';
  seconds: number;
  /** Provisions read, queries run, instruments examined -- so the seconds can be extrapolated. */
  items: number;
}

export interface PillarAnswer {
  economy: string;
  pillarId: number;
  decisions: Decision[];
  retrieval: RetrievalRecord[];
  readings: SectionReading[];
  frameworkReadings: FrameworkReading[];
  /**
   * Every instrument examined as a possible framework, by indicator.
   * A cell that establishes none still examined them, and the record has to say which.
   */
  frameworkExamined: Record<string, FrameworkEvidence[]>;
  /** Findings the engine returned that the check refused. A measurement, not noise. */
  rejectedFindings: number;
  /** Of those, the ones refused because the words were not in the provision. */
  rejectedQuotes: number;
  model: string;
  durationMs: number;
  /** Engine time only, summed across calls -- the number a cost sheet quotes. */
  engineMs: number;
  /** Calls replayed from the development cache. Any number above zero disqualifies the run. */
  cachedCalls: number;
  /** Calls this unit had already made before it was interrupted, replayed instead of paid for twice. */
  resumedCalls: number;
  /** Readings an earlier named run performed, reused rather than bought a second time. */
  carriedCalls: number;
  /** Where the wall time went, stage by stage. */
  stages: StageTiming[];
}

export interface AnswerOptions {
  depth?: number;
  model?: string;
  embeddingModel?: string;
  contextTokens?: number;
  vectors?: LoadedVectors;
  log?: (line: string) => void;
  /** Where this pillar says what it is doing, while it does it. */
  emit?: Emit;
  /** The rates the run settled on. Only indicator 12.5 consults them. */
  rates?: FxRates | null;
  /**
   * An earlier run whose readings this one may reuse rather than pay for again.
   *
   * For measuring a retrieval change: the provisions it adds are read by this run's own engine,
   * and every provision the earlier run already read against this pillar is carried across. See
   * carriedReadings for why that is the same call and not a replay of a different question.
   */
  carryFrom?: string;
}

interface SectionRow {
  id: number;
  instrument_id: number;
  instrument_title: string;
  instrument_kind: InstrumentType['kind'];
  source_url: string;
  heading_path: string;
  text: string;
  anchor: string | null;
}

/** The link a reviewer follows. One official URL, and the provision's own anchor on it. */
function citationFor(row: { source_url: string; anchor: string | null }): string {
  return citationUrl(row.source_url, row.anchor);
}

async function inPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function answerPillar(
  db: Db,
  pillarId: number,
  economy: string,
  opts: AnswerOptions = {},
): Promise<PillarAnswer> {
  const started = Date.now();
  const log = opts.log ?? ((): void => {});
  const emit = opts.emit ?? ((): void => {});
  const rubric = loadRubric();
  // What this economy says each kind of instrument can do. Declared per economy because the answer
  // differs: a Malaysian Order is subsidiary legislation, and an ACMA guide binds nobody.
  const bindingness = new Map(loadProfile(economy).instrumentTypes.map((t) => [t.kind, t.bindingness]));
  const indicators = indicatorsOfPillar(pillarId, rubric);
  if (indicators.length === 0) throw new Error(`No indicators in pillar ${pillarId}`);
  const pillarName = indicators[0]!.pillarName;

  const vectors =
    opts.vectors ??
    loadVectors(db, { economy, ...(opts.embeddingModel ? { model: opts.embeddingModel } : {}) });

  const stages: StageTiming[] = [];
  let mark = Date.now();
  const stage = (name: StageTiming['stage'], items: number): void => {
    stages.push({ stage: name, seconds: (Date.now() - mark) / 1000, items });
    mark = Date.now();
  };

  // 1. Retrieve, per indicator, and keep each record: it is the evidence behind a zero.
  const retrieval: RetrievalRecord[] = [];
  for (const indicator of indicators) {
    const record = await retrieveForIndicator(db, indicator, {
      economy,
      vectors,
      ...(opts.depth ? { depth: opts.depth } : {}),
      ...(opts.embeddingModel ? { model: opts.embeddingModel } : {}),
    });
    retrieval.push(record);
    log(`  ${indicator.id}: ${record.sections.length} of ${record.surfaced} surfaced provision(s)`);
    emit({
      stage: 'retrieve',
      kind: 'finished',
      economy,
      pillarId,
      indicatorId: indicator.id,
      done: retrieval.length,
      total: indicators.length,
      detail: `${record.sections.length} of ${record.surfaced} surfaced provision(s)`,
    });
  }

  stage('retrieve', retrieval.length);

  // 2. Read the union once. A provision retrieved for 6.2 may well carry a 6.1 measure, and
  //    reading it once against the whole pillar is how that is found rather than missed.
  const sectionIds = [...new Set(retrieval.flatMap((r) => r.sections.map((s) => s.sectionId)))];
  const rows = sectionRows(db, sectionIds);
  log(`  reading ${rows.length} distinct provision(s) against pillar ${pillarId}`);

  const inputs: SectionInput[] = rows.map((r) => ({
    sectionId: r.id,
    instrumentTitle: r.instrument_title,
    headingPath: r.heading_path,
    text: r.text,
  }));

  // What an earlier run already read against this pillar. Matched on the model, because a
  // different model is a different answer to the same question.
  const carried = opts.carryFrom
    ? carriedReadings(db, opts.carryFrom, pillarId, indicators.map((i) => i.id), opts.model ?? READING_MODEL)
    : new Map<number, SectionReading>();
  const toRead = inputs.filter((i) => !carried.has(i.sectionId));
  if (opts.carryFrom) {
    log(`  ${inputs.length - toRead.length} carried from ${opts.carryFrom.slice(0, 8)}, ${toRead.length} to read`);
  }

  emit({ stage: 'read', kind: 'started', economy, pillarId, total: toRead.length });

  let readsDone = 0;
  const fresh = await inPool(toRead, readWidth(), async (input) => {
    const reading = await readSection(input, pillarId, pillarName, indicators, {
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.contextTokens ? { contextTokens: opts.contextTokens } : {}),
    });
    readsDone += 1;
    emit({
      stage: 'read',
      kind: reading.failure ? 'refused' : 'finished',
      economy,
      pillarId,
      subject: `${input.instrumentTitle} :: ${input.headingPath}`,
      detail: reading.failure ?? `${reading.findings.length} finding(s), ${reading.rejected.length} refused`,
      done: readsDone,
      total: toRead.length,
      seconds: reading.durationMs / 1000,
      promptTokens: reading.promptTokens,
      outputTokens: reading.completionTokens,
    });
    return reading;
  });

  // In the order the provisions were retrieved, so nothing downstream can tell a carried reading
  // from a fresh one by where it sits.
  const freshById = new Map(fresh.map((r) => [r.sectionId, r]));
  const readings = inputs
    .map((i) => carried.get(i.sectionId) ?? freshById.get(i.sectionId))
    .filter((r): r is SectionReading => r !== undefined);

  // 3. Findings, carrying enough of their origin to be cited.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const evidence: Evidence[] = [];
  for (const reading of readings) {
    const row = byId.get(reading.sectionId);
    if (!row) continue;
    for (const finding of reading.findings) {
      // The same provision reported twice for the same measure is one measure. ESCAP asks for one
      // measure per row and marks up rows that carry several; two identical findings would become
      // two rows saying the same thing.
      if (
        evidence.some(
          (e) =>
            e.sectionId === row.id &&
            e.finding.indicatorId === finding.indicatorId &&
            e.finding.measure === finding.measure,
        )
      ) {
        continue;
      }
      evidence.push({
        finding,
        sectionId: row.id,
        instrumentId: row.instrument_id,
        instrumentTitle: row.instrument_title,
        headingPath: row.heading_path,
        citation: citationFor(row),
        amendsAnotherAct: amendsAnotherAct(row.text),
        definesATerm: citesADefinition(row.text, finding.definingWords ?? finding.quote),
        ...(bindingness.get(row.instrument_kind) ? { bindingness: bindingness.get(row.instrument_kind)! } : {}),
      });
    }
  }

  // A stalled engine looks exactly like a corpus with nothing in it, and the second is a claim we
  // would be publishing. If nothing at all was read, the run stops instead of reporting an empty
  // search -- the one failure mode a reviewer cannot detect from the output.
  // Judged on what the engine was asked, not on what was carried: a carried reading says nothing
  // about whether this run's engine is alive, and counting it would hide a dead one.
  const unread = fresh.filter((r) => r.failure !== null);
  if (unread.length > 0) {
    log(`  ${unread.length} of ${fresh.length} provision(s) went unread -- the engine did not answer`);
    if (unread.length === fresh.length && fresh.length > 0) {
      throw new Error(
        `The engine answered on none of ${fresh.length} provision(s) for pillar ${pillarId}. ` +
          `Stopping rather than reporting an empty search. First: ${unread[0]!.failure}`,
      );
    }
  }

  stage('read', rows.length);

  // 4. Framework indicators ask about instruments, not provisions, so they get their own reading.
  const frameworkReadings: FrameworkReading[] = [];
  const frameworkByIndicator = new Map<string, FrameworkEvidence[]>();
  for (const indicator of indicators.filter((i) => i.shape === 'framework')) {
    const subject = frameworkSubject(indicator);
    if (!subject) continue;
    const record = retrieval.find((r) => r.indicatorId === indicator.id);
    const candidates = (
      await frameworkCandidates(db, economy, subject, record, byId, opts.embeddingModel)
    ).slice(0, FRAMEWORK_CANDIDATES);
    log(`  ${indicator.id}: examining ${candidates.length} instrument(s) as a possible framework`);

    const readingsHere = await inPool(candidates, readWidth(), (c) =>
      readFramework(
        { instrumentId: c.instrumentId, title: c.title, openingText: openingOf(db, c.instrumentId) },
        subject,
        {
          ...(opts.model ? { model: opts.model } : {}),
          ...(opts.contextTokens ? { contextTokens: opts.contextTokens } : {}),
        },
      ),
    );
    frameworkReadings.push(...readingsHere);
    for (const r of readingsHere.filter((x) => x.failure !== null)) {
      emit({
        stage: 'framework',
        kind: 'refused',
        economy,
        pillarId,
        indicatorId: indicator.id,
        detail: r.failure ?? '',
        seconds: r.durationMs / 1000,
      });
    }
    emit({
      stage: 'framework',
      kind: 'finished',
      economy,
      pillarId,
      indicatorId: indicator.id,
      total: readingsHere.length,
      done: readingsHere.filter((x) => x.failure === null).length,
    });
    const examined = readingsHere
      .map((r, n) => ({ r, c: candidates[n]! }))
      .filter((x) => x.r.failure === null);
    if (examined.length < readingsHere.length) {
      log(`  ${indicator.id}: ${readingsHere.length - examined.length} instrument(s) went unexamined`);
    }
    frameworkByIndicator.set(
      indicator.id,
      examined.map(({ r, c }) => ({
        instrumentId: r.instrumentId,
        instrumentTitle: c.title,
        citation: c.url,
        establishesFramework: r.establishesFramework,
        horizontal: r.horizontal,
        dedicated: r.dedicated,
        dedicatedShown: r.dedicatedWordsVerified,
        sectoralShown: r.sectorWordsVerified,
        sector: r.sector,
        quote: r.quote,
      })),
    );
  }

  stage('framework', frameworkReadings.length);

  // 5. Decide. No model, no network, no ESCAP answers.
  const indexedSections = retrieval[0]?.indexedSections ?? 0;
  // A zero read out of a stale consolidation is a weaker claim than one read out of current law.
  const currentTo = new Map<number, string | null>(
    (db.prepare(`SELECT id, last_amended_on FROM instrument WHERE economy_code = ?`).all(economy) as
      { id: number; last_amended_on: string | null }[]).map((r) => [r.id, r.last_amended_on]),
  );
  const decisions = indicators.map((indicator) => {
    const isFramework = indicator.shape === 'framework';
    const frameworkEvidence = frameworkByIndicator.get(indicator.id) ?? [];

    // The instruments this indicator's own search returned, best rank first and one entry each.
    // A zero is reported against one of these, so a cell that scores nothing still cites the Act
    // it read -- which is the shape of every zero row in ESCAP's own database.
    const record = retrieval.find((r) => r.indicatorId === indicator.id);
    const surfaced: SurfacedInstrument[] = [];
    for (const section of record?.sections ?? []) {
      if (surfaced.some((s) => s.instrumentId === section.instrumentId)) continue;
      surfaced.push({
        instrumentId: section.instrumentId,
        instrumentTitle: section.instrumentTitle,
        rank: section.rank,
        currentTo: currentTo.get(section.instrumentId) ?? null,
      });
    }

    const coverage: Coverage = {
      sectionsRead: rows.length,
      sectionsIndexed: indexedSections,
      instrumentsConsidered: isFramework ? frameworkEvidence.length : new Set(rows.map((r) => r.instrument_id)).size,
    };
    // Which instruments the register said govern this question. Worked out in Zone 1 from their
    // titles, and needed in Zone 3 to tell the Act that governs the subject from the Act that is
    // merely large enough to answer any search.
    const governing = (record?.governing ?? []).map((g) => g.instrumentId);

    return decide({
      indicator, economy, evidence, frameworkEvidence, surfaced, governing, coverage,
      rates: opts.rates ?? null,
    });
  });

  for (const d of decisions) {
    emit({
      stage: 'decide',
      kind: 'finished',
      economy,
      pillarId,
      indicatorId: d.indicatorId,
      detail: `score ${d.score ?? 'unresolved'} [${d.state}]`,
    });
  }

  stage('decide', decisions.length);

  return {
    economy,
    pillarId,
    decisions,
    retrieval,
    readings,
    frameworkReadings,
    frameworkExamined: Object.fromEntries(frameworkByIndicator),
    rejectedFindings: readings.reduce((n, r) => n + r.rejected.length, 0),
    rejectedQuotes: readings.reduce(
      (n, r) => n + r.rejected.filter((x) => x.reason.includes('not in the provision')).length,
      0,
    ),
    model: readings[0]?.model ?? frameworkReadings[0]?.model ?? (opts.model ?? ''),
    durationMs: Date.now() - started,
    engineMs:
      readings.reduce((n, r) => n + r.durationMs, 0) +
      frameworkReadings.reduce((n, r) => n + r.durationMs, 0),
    cachedCalls:
      readings.filter((r) => r.fromCache).length + frameworkReadings.filter((r) => r.fromCache).length,
    resumedCalls:
      readings.filter((r) => r.fromResume).length + frameworkReadings.filter((r) => r.fromResume).length,
    carriedCalls: readings.filter((r) => r.carriedFrom).length,
    stages,
  };
}

/** Which subject a framework indicator is about, read off its own category text. */
const FRAMEWORK_OF: Record<string, FrameworkSubject> = {
  '7.1': 'data-protection',
  '7.2': 'cybersecurity',
  '8.1': 'intermediary-liability',
  '8.2': 'intermediary-liability',
  '12.9': 'consumer-protection',
};

/** By indicator, not by matching its category prose: which framework the rubric marked it for. */
function frameworkSubject(indicator: Indicator): FrameworkSubject | null {
  return FRAMEWORK_OF[indicator.id] ?? null;
}

/**
 * The instruments a framework indicator examines.
 *
 * The register is asked about the subject first, and what it returns leads. A framework question
 * is a question about an instrument -- is this Act the country's data protection law -- so the
 * thing to rank is instruments, by the subject, not provisions by the indicator's band prose.
 * Australia's first graded run examined five candidates for 7.1 and the Privacy Act 1988 was not
 * among them: it had contributed one provision to that indicator's search where the Data
 * Availability and Transparency Act contributed six, and candidacy was decided by that count. The
 * answer came out right and cited the wrong Act for it.
 *
 * The retrieval's own candidates follow rather than being replaced, so this can only add.
 */
async function frameworkCandidates(
  db: Db,
  economy: string,
  subject: FrameworkSubject,
  record: RetrievalRecord | undefined,
  rows: Map<number, SectionRow>,
  embeddingModel?: string,
): Promise<{ instrumentId: number; title: string; url: string }[]> {
  const out: { instrumentId: number; title: string; url: string }[] = [];
  const ranked = await shortlistInstruments(db, {
    economy,
    queries: subjectQueries(subject),
    limit: FRAMEWORK_CANDIDATES * 4,
    ...(embeddingModel ? { model: embeddingModel } : {}),
  });
  for (const c of ranked) {
    // Only what has actually been read. An unread instrument cannot be examined, and naming one
    // here would put a framework on the record that nothing in the corpus supports.
    if (!c.read) continue;
    out.push({ instrumentId: c.instrumentId, title: c.title, url: c.sourceUrl });
  }
  for (const c of candidateInstruments(record, rows)) {
    if (!out.some((o) => o.instrumentId === c.instrumentId)) out.push(c);
  }
  return out;
}

/**
 * The fallback ordering: instruments this indicator's own retrieval surfaced, most represented
 * first. An instrument that answered a search about cybersecurity with eight provisions is a
 * better candidate than one that answered with one, and that is a fact about the search.
 */
function candidateInstruments(
  record: RetrievalRecord | undefined,
  rows: Map<number, SectionRow>,
): { instrumentId: number; title: string; url: string }[] {
  if (!record) return [];
  const counts = new Map<number, number>();
  for (const s of record.sections) counts.set(s.instrumentId, (counts.get(s.instrumentId) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([instrumentId]) => {
      const row = [...rows.values()].find((r) => r.instrument_id === instrumentId);
      return row
        ? { instrumentId, title: row.instrument_title, url: row.source_url }
        : { instrumentId, title: `instrument ${instrumentId}`, url: '' };
    });
}

function sectionRows(db: Db, ids: number[]): SectionRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT s.id, s.heading_path, s.text, s.anchor,
              d.instrument_id, i.title AS instrument_title, i.kind AS instrument_kind, d.url AS source_url
         FROM section s
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE s.id IN (${placeholders})`,
    )
    .all(...ids) as SectionRow[];
}
