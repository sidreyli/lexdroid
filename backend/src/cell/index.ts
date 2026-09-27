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
import { tariffCodesOf } from '../rubric/ict-goods.js';
import { TITLE_CARRIES_DOMAIN } from '../rubric/measures.js';
import type { Db } from '../db/index.js';
import type { Emit } from '../run/events.js';
import { citationUrl } from '../export/index.js';
import { enginePool } from '../engines/pool.js';
import { amendsAnotherAct, citesADefinition, definitionIn, figureReplaceable, inheritsAPower, insertsTheQuotedWords } from '../parse/identity.js';
import { loadProfile } from '../profile/index.js';
import type { InstrumentType } from '../profile/types.js';
import type { Indicator } from '../rubric/types.js';
import { chosenIndicators, loadRubric } from '../rubric/index.js';
import { fuse, loadVectors, searchLexical, type LoadedVectors } from '../index/index.js';
import { prescribedAmount, retrieveForIndicator, type RetrievalRecord } from '../retrieve/index.js';
import { storedFrameworkCandidates, storedRetrieval } from '../retrieve/replay.js';
import { shortlistInstruments } from '../shortlist/index.js';
import {
  openingOf,
  readFramework,
  readSection,
  readInFull,
  subjectQueriesIn,
  READING_MODEL,
  type FrameworkReading,
  type FrameworkSubject,
  type SectionInput,
  type SectionReading,
} from '../read/index.js';
import { carriedReadings } from '../read/carry.js';
import { loadConfirmations, confirmedFlag, tallyConfirmations, type ConfirmationSet } from '../read/confirmations.js';
import type { FxRates } from '../decide/currency.js';
import {
  decide,
  sameFinding,
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
 * An instrument a framework indicator will look at, and the sections that put it on the list.
 *
 * `sectionIds` is empty for the two channels that rank instruments rather than provisions; it
 * carries the hits for the one that searches sections, so the reader is shown the provision that
 * made the instrument a candidate in the first place.
 */
interface FrameworkCandidate {
  instrumentId: number;
  title: string;
  url: string;
  sectionIds: number[];
}

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
  /** Framework candidates the engine failed to read, by indicator. They leave no reading behind. */
  frameworkUnread?: Record<string, number>;
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
  /**
   * Provisions read afresh although the earlier run read them. For a change to the checks a reading
   * passes on its way in: a finding refused there is gone from the stored reading, and carrying it
   * would carry the refusal.
   */
  reread?: ReadonlySet<number>;
  /**
   * The banked second-reading verdicts to score against. Loaded from the store when not given;
   * a caller passes one to hold the set steady across a pillar, or an empty one to score without.
   */
  confirmations?: ConfirmationSet;
  /**
   * Only these indicators of the pillar, by id. Absent or empty is the whole pillar. What is read,
   * examined as a framework and scored is then only what these ask.
   */
  indicators?: readonly string[];
  /**
   * A run whose recorded retrieval this pillar reads instead of searching again. For measuring a
   * reader change on a database that holds a run's provisions but not the indexes that found them
   * (a benchmark pack); see retrieve/replay.ts.
   */
  retrievalFrom?: string;
}

interface SectionRow {
  id: number;
  instrument_id: number;
  instrument_title: string;
  /** The Act this instrument amends, where the register knows it. */
  principal_title?: string | null;
  instrument_kind: InstrumentType['kind'];
  instrument_status: Evidence['instrumentStatus'];
  language: string | null;
  repealed: number;
  source_url: string;
  media_type: string | null;
  heading_path: string;
  text: string;
  anchor: string | null;
  page: number | null;
}

/**
 * The link a reviewer follows. One official URL, and the provision's own anchor on it -- or, in a
 * PDF, the page it is on, so the workbench and the workbook send a reviewer to the same place.
 */
/**
 * What a finding built on these words must be cited as, and whether the words are inserted ones.
 *
 * Words an amendment sets out for insertion are the principal Act's words. Cited under the
 * amending instrument they would name the vehicle instead of the statute that carries the duty,
 * which is the citation defect ESCAP marks directly. Where the register knows the principal, the
 * citation names it and says which instrument put the words there; where it does not, the finding
 * still stands on the words and is cited where they were actually read.
 */
function citedUnder(
  row: { instrument_title: string; principal_title?: string | null },
  inserted: boolean,
): { insertsTheQuotedWords: boolean; citedAs?: string } {
  if (!inserted) return { insertsTheQuotedWords: false };
  if (!row.principal_title) return { insertsTheQuotedWords: true };
  return {
    insertsTheQuotedWords: true,
    citedAs: `${row.principal_title}, as amended by ${row.instrument_title}`,
  };
}

/**
 * Where a scored figure the provision leaves to be prescribed is prescribed, for the one indicator
 * that scores a figure. Shared with the rebuild in ../decide/record.ts, so the two cannot differ.
 */
export function prescribedFor(
  db: Db,
  economy: string,
  finding: { indicatorId: string },
  pointer: { sectionId: number; instrumentId: number; instrumentTitle: string; text: string },
): Pick<Evidence, 'prescribed'> {
  if (finding.indicatorId !== '12.5') return {};
  const p = prescribedAmount(db, economy, pointer);
  if (!p) return {};
  const { docUrl, anchor, page, mediaType, ...rest } = p;
  return { prescribed: { ...rest, citation: citationUrl(docUrl, anchor, { page, mediaType }) } };
}

/**
 * What the instrument itself says the party bound or the subject is, where it defines either and
 * the measure's domain may be carried by the document. See TITLE_CARRIES_DOMAIN: a title names the
 * topic once and so does a definition, and the provisions in between say "the service provider".
 * Shared with the rebuild in ../decide/record.ts, so the two cannot differ.
 */
export function definedFor(
  db: Db,
  finding: { measure?: string | null; dutyBearer?: string | null; subjectWords?: string | null },
  instrumentId: number,
): Pick<Evidence, 'definedAs'> {
  if (!finding.measure || !TITLE_CARRIES_DOMAIN.has(finding.measure)) return {};
  const terms = [finding.dutyBearer, finding.subjectWords].filter((t): t is string => !!t && t.trim().length > 1);
  if (terms.length === 0) return {};
  const texts = (
    db
      .prepare(
        `SELECT s.text FROM section s JOIN document d ON d.id = s.document_id
          WHERE d.instrument_id = ? AND (s.text LIKE '%หมายความ%' OR s.text LIKE '%means%' OR s.text LIKE '%includes%')
          ORDER BY s.id`,
      )
      .all(instrumentId) as { text: string }[]
  ).map((r) => r.text);
  const found = new Set<string>();
  for (const term of terms) {
    for (const text of texts) {
      const words = definitionIn(text, term);
      if (words) {
        found.add(words);
        break;
      }
    }
  }
  return found.size ? { definedAs: [...found].join(' ') } : {};
}

function citationFor(row: {
  source_url: string;
  anchor: string | null;
  page?: number | null;
  media_type?: string | null;
}): string {
  return citationUrl(row.source_url, row.anchor, { page: row.page, mediaType: row.media_type });
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
  // The same question asked of a whole instrument rather than a retrieved row. A framework
  // candidate arrives from three channels and only one of them carries the register's columns, so
  // the kind is read here once for the economy rather than threaded through all three.
  const frameworkKind = new Map(
    (
      db.prepare('SELECT id, kind FROM instrument WHERE economy_code = ?').all(economy) as {
        id: number;
        kind: InstrumentType['kind'] | null;
      }[]
    ).map((r) => [r.id, r.kind]),
  );
  /** Null for an instrument whose kind the profile does not declare, which is not "advisory". */
  const bindingnessOf = (instrumentId: number) => {
    const kind = frameworkKind.get(instrumentId);
    return kind ? bindingness.get(kind) ?? null : null;
  };
  // The second question's banked answers, read once for the pillar. A provision the pass read and
  // found not to carry the measure is evidence for a zero, and the live run has to see that at the
  // moment it scores -- otherwise the stored score and every later re-derivation of it disagree.
  const confirmations = opts.confirmations ?? loadConfirmations(db, { model: opts.model ?? READING_MODEL });
  const indicators = chosenIndicators(pillarId, opts.indicators, rubric);
  if (indicators.length === 0) {
    throw new Error(
      opts.indicators?.length
        ? `None of ${opts.indicators.join(', ')} is in pillar ${pillarId}`
        : `No indicators in pillar ${pillarId}`,
    );
  }
  const pillarName = indicators[0]!.pillarName;

  const replayFrom = opts.retrievalFrom;
  const vectors = replayFrom
    ? null
    : (opts.vectors ??
      loadVectors(db, { economy, ...(opts.embeddingModel ? { model: opts.embeddingModel } : {}) }));

  const stages: StageTiming[] = [];
  let mark = Date.now();
  const stage = (name: StageTiming['stage'], items: number): void => {
    stages.push({ stage: name, seconds: (Date.now() - mark) / 1000, items });
    mark = Date.now();
  };

  // 1. Retrieve, per indicator, and keep each record: it is the evidence behind a zero.
  const retrieval: RetrievalRecord[] = [];
  for (const indicator of indicators) {
    const record = replayFrom
      ? storedRetrieval(db, replayFrom, economy, indicator.id)
      : await retrieveForIndicator(db, indicator, {
          economy,
          vectors: vectors!,
          languages: loadProfile(economy).officialLanguages,
          ...(opts.depth ? { depth: opts.depth } : {}),
          ...(opts.embeddingModel ? { model: opts.embeddingModel } : {}),
        });
    if (!record) {
      log(`  ${indicator.id}: run ${replayFrom!.slice(0, 8)} recorded no cell for it, so nothing is replayed`);
      continue;
    }
    retrieval.push(record);
    log(`  ${indicator.id}: ${record.sections.length} of ${record.surfaced} surfaced provision(s)${replayFrom ? ' (replayed)' : ''}`);
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
  for (const id of opts.reread ?? []) carried.delete(id);
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
      // The same claim reported twice is one claim. Two different clauses of one provision filed
      // under one measure are two, and the second may be the one that decides the cell.
      if (evidence.some((e) => sameFinding(e, { sectionId: row.id, finding }))) continue;
      evidence.push({
        finding,
        sectionId: row.id,
        instrumentId: row.instrument_id,
        instrumentTitle: row.instrument_title,
        headingPath: row.heading_path,
        citation: citationFor(row),
        amendsAnotherAct: amendsAnotherAct(row.text),
        figureReplaceable: figureReplaceable(row.text, finding.definingWords ?? finding.quote),
        ...prescribedFor(db, economy, finding, { sectionId: row.id, instrumentId: row.instrument_id, instrumentTitle: row.instrument_title, text: row.text }),
        ...citedUnder(row, insertsTheQuotedWords(row.text, finding.quote)),
        definesATerm: citesADefinition(row.text, finding.definingWords ?? finding.quote),
        inheritsAPower: inheritsAPower(row.text, finding.quote),
        sectionLanguage: row.language,
        ...tariffCodesOf(row.text),
        ...definedFor(db, finding, row.instrument_id),
        instrumentKind: row.instrument_kind,
        ...(row.repealed ? { sectionRepealed: true } : {}),
        ...(row.instrument_status ? { instrumentStatus: row.instrument_status } : {}),
        ...(bindingness.get(row.instrument_kind) ? { bindingness: bindingness.get(row.instrument_kind)! } : {}),
        ...confirmedFlag(confirmations.verdict(row.id, finding.indicatorId, finding.measure)),
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
  const frameworkUnread = new Map<string, number>();
  for (const indicator of indicators.filter((i) => i.shape === 'framework')) {
    const subject = frameworkSubject(indicator);
    if (!subject) continue;
    const record = retrieval.find((r) => r.indicatorId === indicator.id);
    const candidates = (
      replayFrom
        ? storedFrameworkCandidates(db, replayFrom, economy, indicator.id)
        : await frameworkCandidates(db, economy, subject, record, byId, opts.embeddingModel)
    ).slice(0, FRAMEWORK_CANDIDATES);
    log(`  ${indicator.id}: examining ${candidates.length} instrument(s) as a possible framework`);

    const readingsHere = await inPool(candidates, readWidth(), (c) =>
      readFramework(
        {
          instrumentId: c.instrumentId,
          title: c.title,
          openingText: openingOf(db, c.instrumentId),
          provisionsText: provisionsOf(record, c.instrumentId, sectionsById(db, c.sectionIds)),
        },
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
    frameworkUnread.set(indicator.id, readingsHere.length - examined.length);
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
        frameworkShown: r.frameworkWordsVerified,
        horizontal: r.horizontal,
        dedicated: r.dedicated,
        dedicatedShown: r.dedicatedWordsVerified,
        sectoralShown: r.sectorWordsVerified,
        sector: r.sector,
        bindingness: bindingnessOf(r.instrumentId),
        quote: r.quote,
      })),
    );
  }

  stage('framework', frameworkReadings.length);

  // 5. Decide. No model, no network, no ESCAP answers.
  const indexedSections = retrieval[0]?.indexedSections ?? 0;
  // A zero read out of a stale consolidation is a weaker claim than one read out of current law.
  // The consolidation's own currency date answers this; the last amendment is the fallback for a
  // register that publishes one and not the other. Reading the amendment date alone said a
  // Malaysian Act was current to its last amendment, which is a different and stronger claim.
  const registered = db.prepare(
    `SELECT id, COALESCE(current_to, last_amended_on) AS current_to, kind FROM instrument
      WHERE economy_code = ?`,
  ).all(economy) as { id: number; current_to: string | null; kind: string | null }[];
  const currentTo = new Map<number, string | null>(registered.map((r) => [r.id, r.current_to]));
  // Carried for the same reason as the date beside it: the decision reports a zero against one of
  // these, and what the register says the document is decides whether it may be reported at all.
  const kindOfInstrument = new Map<number, string | null>(registered.map((r) => [r.id, r.kind]));
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
        kind: kindOfInstrument.get(section.instrumentId) ?? null,
      });
    }

    const coverage: Coverage = {
      // Answered, not sent: a provision the engine failed on was not read, and counting it made a
      // zero say it rested on more reading than it did. Nor one whose answer was partly unreadable:
      // its findings stand, but it was not read in full.
      sectionsRead: readings.filter(readInFull).length,
      sectionsIndexed: indexedSections,
      instrumentsConsidered: isFramework ? frameworkEvidence.length : new Set(rows.map((r) => r.instrument_id)).size,
      ...(isFramework ? { frameworkUnread: frameworkUnread.get(indicator.id) ?? 0 } : {}),
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
    frameworkUnread: Object.fromEntries(frameworkUnread),
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
export const FRAMEWORK_OF: Record<string, FrameworkSubject> = {
  '7.1': 'data-protection',
  '7.2': 'cybersecurity',
  // 8.1 is "Lack of safe harbour for copyright infringements" and 8.2 is "...for other illegal
  // activities". Asked as one subject they returned one candidate list and one answer per economy.
  '8.1': 'copyright-safe-harbour',
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
): Promise<FrameworkCandidate[]> {
  // Without this the register answers a framework question with the pages of the site it was
  // harvested from: all five instruments examined for Singapore's 8.1 and 8.2 were Monetary
  // Authority press releases -- "Person charged for false trading under the Securities and Futures
  // Act" -- registered as Acts with status unknown, and all five for its 7.1 were PDPC
  // advisory-guideline pages sitting in front of the Personal Data Protection Act itself. The
  // reader was right about every one of them and the cell was wrong anyway.
  //
  // The reason first written here was the wrong one. It said 'in-force' is the only status a row
  // may cite, and `currentLaw` in decide/ says the opposite in as many words: unknown "means the
  // register did not tell us, not that it told us no", and evidence under it is kept. Ordinary
  // retrieval filters on no status at all. So this gate is stricter than citation is, and it needs
  // a reason of its own.
  //
  // It has one, and it is in the band text. All five framework indicators ask for a *legal*
  // framework -- 7.1 "comprehensive data protection framework", 7.2 "dedicated cybersecurity legal
  // framework", 8.1 and 8.2 "framework in place that limits liability", 12.9 "consumer protection
  // law applicable to online commerce". A status is what a legislative register records; a
  // regulator's website publishes no legislation and so carries none. Gating on status is
  // therefore gating on provenance, which is what the question is actually about.
  //
  // Measured, because that argument would be worth nothing if it cost a statute. Of the
  // instruments that are read, named like an Act and left at unknown -- 38 Malaysian, 36
  // Singaporean, 20 Australian -- most are the Act the legislative register already holds in
  // force, filed again under a regulator's page title. The rest are documents about an Act: FAQs,
  // guidelines on applying one, charge and penalty announcements, consultations, commencement
  // notices. Exactly two are Acts, both amending ones, which `currentLaw` excludes from citation
  // whatever their status. So no principal statute is reachable only at unknown, and the cost of
  // the gate is that a regulator's policy document can never be named as a framework -- correct
  // for these five, and wrong for any indicator that asks what an economy does rather than what
  // its law says.
  const inForce = new Set(
    (
      db
        .prepare(`SELECT id FROM instrument WHERE economy_code = ? AND status = 'in-force'`)
        .all(economy) as { id: number }[]
    ).map((r) => r.id),
  );

  const queries = subjectQueriesIn(subject, loadProfile(economy).officialLanguages);
  const ranked = await shortlistInstruments(db, {
    economy,
    queries,
    limit: FRAMEWORK_CANDIDATES * 4,
    ...(embeddingModel ? { model: embeddingModel } : {}),
  });
  const fromRegister = ranked
    // Only what has actually been read. An unread instrument cannot be examined, and naming one
    // here would put a framework on the record that nothing in the corpus supports.
    .filter((c) => c.read && inForce.has(c.instrumentId))
    .map((c) => ({ instrumentId: c.instrumentId, title: c.title, url: c.sourceUrl, sectionIds: [] }));
  const fromRetrieval = candidateInstruments(record, rows)
    .filter((c) => inForce.has(c.instrumentId))
    .map((c) => ({ ...c, sectionIds: [] }));

  // The third channel, and the one that finds the rule: sections asked the subject directly.
  //
  // A framework indicator searched instruments by its subject and sections by its band prose, and
  // never searched sections for its subject. So Singapore's Electronic Transactions Act 2010 --
  // whose section 26 reads "a network service provider shall not be subject to any civil or
  // criminal liability", which is the provision ESCAP cites for 8.2 -- was unreachable from both.
  // Not ranked low: absent, under every wording tried, because its title says "Electronic
  // Transactions" and 8.2's band prose is about unlawful content. Asked of sections, the subject
  // puts it fourth. The comment this replaces asserted the band prose found it sixth; that was
  // true of the pillar before 8.1 and 8.2 were given separate subjects, and is no longer.
  const fromSections = subjectSections(db, economy, queries, inForce);

  // Taken alternately rather than in series. The three lists know different things and the caller
  // keeps five: appended, the later channels were never reached at all. A register knows what an
  // Act is called, a retrieval knows what answered this indicator's question, and a section search
  // on the subject knows which Act contains the rule.
  return withParentActs(db, economy, queries, inForce, interleave(fromRegister, fromSections, fromRetrieval));
}

/**
 * Each candidate made under an Act brings that Act in, just ahead of it.
 *
 * A framework is established by an Act; the rules made under it set conditions on it. Rules name
 * the subject in every provision and the Act names it in one, so once the rules were read they
 * took the section search's places and pushed out the Act they are made under: India's IT Act,
 * whose s.79 is the intermediary safe harbour, left all five candidates for 8.1 and 8.2 the run its
 * intermediary and blocking rules were fetched, and 8.1 read "no framework". The Act is examined
 * with its own provisions on the subject, the way the section channel hands over the rules'.
 */
export function withParentActs(
  db: Db,
  economy: string,
  queries: string[],
  inForce: Set<number>,
  list: FrameworkCandidate[],
): FrameworkCandidate[] {
  const parentOf = db.prepare(
    `SELECT p.id, p.title, p.source_url FROM instrument c JOIN instrument p ON p.id = c.made_under_instrument_id
      WHERE c.id = ? AND p.kind = 'act'
        AND EXISTS (SELECT 1 FROM document d JOIN section s ON s.document_id = d.id WHERE d.instrument_id = p.id)`,
  );
  const owner = db.prepare(`SELECT d.instrument_id id FROM section s JOIN document d ON d.id = s.document_id WHERE s.id = ?`);
  // An Act already further down the list is moved up, not left where it is: the caller keeps the
  // first five, and India's IT Act was on the list at twelfth and so was never examined.
  const later = new Map(list.map((c) => [c.instrumentId, c]));
  const placed = new Set<number>();
  const out: FrameworkCandidate[] = [];
  let hits: { sectionId: number }[] | undefined;
  for (const c of list) {
    if (placed.has(c.instrumentId)) continue;
    const parent = parentOf.get(c.instrumentId) as { id: number; title: string; source_url: string } | undefined;
    if (parent && !placed.has(parent.id) && inForce.has(parent.id)) {
      // Deeper than the subject channel's own search: the Act's provision is the one that search
      // ranked below its rules.
      hits ??= fuse(queries.map((q) => searchLexical(db, q, { economy, limit: PARENT_SECTION_DEPTH })));
      const found = hits
        .filter((h) => (owner.get(h.sectionId) as { id: number } | undefined)?.id === parent.id)
        .map((h) => h.sectionId);
      const own = later.get(parent.id);
      const sectionIds = [...new Set([...(own?.sectionIds ?? []), ...found])].slice(0, PARENT_SECTIONS);
      placed.add(parent.id);
      out.push(own ? { ...own, sectionIds } : { instrumentId: parent.id, title: parent.title, url: parent.source_url, sectionIds });
    }
    placed.add(c.instrumentId);
    out.push(c);
  }
  return out;
}

const PARENT_SECTION_DEPTH = 60;
const PARENT_SECTIONS = 4;

/**
 * Two ranked lists taken alternately, each instrument once, the first list leading.
 *
 * Exported because the defect it fixes was invisible: appending the second list to the first is
 * correct in isolation and useless in place, because the caller keeps five and the first list
 * seldom runs short of five.
 */
export function interleave<T extends { instrumentId: number }>(...lists: T[][]): T[] {
  const out: T[] = [];
  const seen = new Set<number>();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i += 1) {
    for (const list of lists) {
      const c = list[i];
      if (!c || seen.has(c.instrumentId)) continue;
      seen.add(c.instrumentId);
      out.push(c);
    }
  }
  return out;
}

/**
 * Instruments holding a section that answers the subject itself, best first.
 *
 * Lexical only, and deliberately. The subject's own names are terms of art -- "network service
 * provider", "safe harbour" -- and a provision that grants the immunity uses them; this is the one
 * place in the pipeline where matching the words is the point rather than a weakness. The dense
 * channel is what the indicator's own retrieval already contributes through the third list.
 */
function subjectSections(
  db: Db,
  economy: string,
  queries: string[],
  inForce: Set<number>,
): FrameworkCandidate[] {
  const out: FrameworkCandidate[] = [];
  const byInstrument = new Map<number, FrameworkCandidate>();
  const owner = db.prepare(
    `SELECT i.id, i.title, i.source_url FROM section s
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE s.id = ?`,
  );
  // Fused, not taken in turn. Round-robin across the queries gives a section that matched one
  // generic name the same standing as one that matched the subject sentence and three of its
  // terms, and the generic names are generic: "safe harbour" put Malaysia's Safeguards Act 2006
  // and Finance (No. 2) Act 2023 among the five instruments examined for its copyright safe
  // harbour, displacing the Communications and Multimedia Act. Fusion is what the rest of Zone 1
  // uses for the same reason, and it puts that Act first and the Copyright Act 1987 second.
  const runs = queries.map((q) => searchLexical(db, q, { economy, limit: SUBJECT_SECTION_DEPTH }));
  for (const hit of fuse(runs)) {
    const row = owner.get(hit.sectionId) as { id: number; title: string; source_url: string } | undefined;
    if (!row || !inForce.has(row.id)) continue;
    // The sections are kept, not only the instruments they belong to. An instrument reached by
    // this channel is one the indicator's own retrieval did not return, so provisionsOf has
    // nothing of it to show and the reader would be handed a long title and asked for a rule.
    // Singapore's Electronic Transactions Act was examined that way and said, correctly for the
    // six sections it was given, that it established nothing.
    const already = byInstrument.get(row.id);
    if (already) {
      if (!already.sectionIds.includes(hit.sectionId)) already.sectionIds.push(hit.sectionId);
      continue;
    }
    const candidate = {
      instrumentId: row.id,
      title: row.title,
      url: row.source_url,
      sectionIds: [hit.sectionId],
    };
    byInstrument.set(row.id, candidate);
    out.push(candidate);
  }
  return out;
}

/** How deep each subject query goes when looking for the instrument that holds the rule. */
const SUBJECT_SECTION_DEPTH = 12;

/**
 * What this indicator's own search returned of one instrument, as text for the framework reader.
 *
 * The register ranks instruments by what they are called and the opening says what they are for;
 * neither reaches the provision that does the governing. This is the third thing: the sections a
 * search for the subject actually returned out of this instrument, which is where the rule is if
 * the instrument has one.
 */
export function provisionsOf(
  record: RetrievalRecord | undefined,
  instrumentId: number,
  extra: { headingPath: string; text: string }[] = [],
): string {
  const fromRecord = (record?.sections ?? []).filter((s) => s.instrumentId === instrumentId);
  const seen = new Set(fromRecord.map((s) => s.headingPath));
  return [...fromRecord, ...extra.filter((s) => !seen.has(s.headingPath))]
    .map((s) => `${s.headingPath}\n${s.text}`)
    .join('\n\n');
}

/** The text of the sections a subject search found, for an instrument the retrieval did not. */
function sectionsById(db: Db, ids: number[]): { headingPath: string; text: string }[] {
  if (ids.length === 0) return [];
  const rows = db
    .prepare(`SELECT heading_path, text FROM section WHERE id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids) as { heading_path: string; text: string }[];
  return rows.map((r) => ({ headingPath: r.heading_path, text: r.text }));
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
      `SELECT s.id, s.heading_path, s.text, s.anchor, s.page, s.language, s.repealed,
              d.instrument_id, i.title AS instrument_title, i.kind AS instrument_kind, i.status AS instrument_status,
              d.url AS source_url,
              d.media_type,
              p.title AS principal_title
         FROM section s
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
         LEFT JOIN instrument p ON p.id = i.amends_instrument_id
        WHERE s.id IN (${placeholders})`,
    )
    .all(...ids) as SectionRow[];
}
