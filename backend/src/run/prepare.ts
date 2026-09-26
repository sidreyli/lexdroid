/**
 * Zone 0 and Zone 1, inside the run rather than beside it.
 *
 * The interface could start a run, and the run read whatever happened to be on disk. Discovery,
 * fetching, parsing and indexing lived in scripts/zone1.ts and were nobody's job to call, so a
 * "Fetch new documents" switch fetched nothing and a cold machine answered every cell out of an
 * empty corpus. The same stages are done here, driven by the run and reporting into its ledger.
 *
 * What it does, per economy, in order:
 *
 *   register     walk the portals the profile names and record what is in them
 *   shortlist    rank that register against the questions this run is actually asking
 *   materialise  fetch and parse the instruments the shortlist named, and only those
 *   index        embed the new sections so retrieval can reach them
 *
 * The shortlist is the reason this is affordable. Singapore's register is thousands of instruments
 * and any one cell turns on a handful; reading in registration order is a corpus build, which is a
 * different job with a different budget.
 *
 * A cache-only run does none of it. That is not an optimisation -- it is the second-engine pass
 * ESCAP checks on the day, whose document list has to be empty.
 */
import type { Db } from '../db/index.js';
import { Fetcher, type SourceMode } from '../fetch/index.js';
import { loadProfile, applyProfile } from '../profile/index.js';
import { register, materialise } from '../discover/index.js';
import { buildDenseIndex } from '../index/index.js';
import { buildInstrumentIndex, shortlistInstruments } from '../shortlist/index.js';
import { indicatorsOfPillar, loadRubric } from '../rubric/index.js';
import { queriesFor } from '../retrieve/index.js';
import { loadTranslations } from '../retrieve/translations.js';
import { EMBEDDING_MODEL, haveModel, OllamaUnavailable } from '../engines/ollama.js';
import type { Emit } from './events.js';

export interface PrepareOptions {
  economy: string;
  pillars: number[];
  sourceMode: SourceMode;
  /**
   * The run these fetches belong to.
   *
   * Not bookkeeping: ESCAP's Run Record sheet asks for every document downloaded during the hour
   * and checks the second engine's count is zero. A fetch recorded against no run cannot answer
   * that question, so the claim would rest on our word rather than on the log.
   */
  runId?: string;
  /** How many instruments each question may pull into the corpus. */
  top?: number;
  minDelayMs?: number;
  emit?: Emit;
  log?: (line: string) => void;
}

export interface PrepareResult {
  economy: string;
  /** Instruments in the register after walking the portals. */
  registered: number;
  /** Instruments the run's own questions asked for. */
  shortlisted: number;
  parsed: number;
  unread: number;
  failed: number;
  /** Asked for and never attempted, because the host stopped serving us. Not a hole in the law. */
  notAttempted: number;
  embedded: number;
  /** Documents taken over the network. Zero is the claim a cache-only pass has to be able to make. */
  fetched: number;
  fromCache: number;
  /** Why the stage did less than it should have, where it did. Never silent. */
  notes: string[];
}

const EMPTY = (economy: string): PrepareResult => ({
  economy,
  registered: 0,
  shortlisted: 0,
  parsed: 0,
  unread: 0,
  failed: 0,
  notAttempted: 0,
  embedded: 0,
  fetched: 0,
  fromCache: 0,
  notes: [],
});

/**
 * Bring one economy's corpus up to what this run is about to ask of it.
 *
 * Every stage is resumable and none of them delete: an instrument already read is not read again,
 * a section already embedded is not embedded again, and an interrupted prepare continues where it
 * stopped. So calling this on a warm corpus is cheap, and calling it on an empty one is the cold
 * run the live test asks for.
 */
export async function prepareCorpus(db: Db, opts: PrepareOptions): Promise<PrepareResult> {
  const log = opts.log ?? ((): void => {});
  const emit = opts.emit ?? ((): void => {});
  const economy = opts.economy.toUpperCase();
  const out = EMPTY(economy);

  if (opts.sourceMode === 'cache-only') {
    // Said out loud rather than skipped quietly. A pass that fetched nothing because it was told
    // not to and a pass that fetched nothing because discovery is broken look identical otherwise.
    out.notes.push('cache-only: the corpus was not touched and nothing was fetched');
    emit({ stage: 'discover', kind: 'finished', economy, detail: 'cache-only, nothing fetched' });
    log(`  ${economy}: cache-only, so no portal was walked and no document was fetched`);
    return out;
  }

  const profile = loadProfile(economy);
  applyProfile(db, profile);

  const fetcher = new Fetcher({
    db,
    sourceMode: opts.sourceMode,
    ...(opts.runId ? { runId: opts.runId } : {}),
    ...(opts.minDelayMs ? { minDelayMs: opts.minDelayMs } : {}),
    onLog: log,
  });

  // 1. The register.
  emit({ stage: 'discover', kind: 'started', economy, detail: `walking ${profile.portals.length} portal(s)` });
  const registered = await register(db, profile, fetcher, log);
  for (const r of registered) {
    if (r.error) {
      out.notes.push(`${r.portal}: ${r.error}`);
      emit({ stage: 'discover', kind: 'refused', economy, subject: r.portal, detail: r.error });
    }
  }
  out.registered = (
    db.prepare('SELECT COUNT(*) AS n FROM instrument WHERE economy_code = ?').get(economy) as { n: number }
  ).n;
  emit({
    stage: 'discover',
    kind: 'finished',
    economy,
    detail: `${out.registered} instrument(s) in the register`,
    total: out.registered,
  });

  // 2. What this run's own questions ask of it. Per indicator, not per pillar: a shortlist shared
  // across a pillar's five indicators gives each of them a fifth of it, and 7.3's retention Act is
  // nothing like 7.5's access powers.
  const rubric = loadRubric();
  const asked: string[][] = [];
  for (const p of opts.pillars) {
    // In the economy's own language as well: this ranks the register's titles, and an English
    // question ranks Cyrillic or Lao titles on nothing.
    // Named as retrieval names it ("in Mongolia", not "in the economy") where the economy has a
    // translation table: the table is keyed on the named query, and an unnamed one never found its
    // translation. Elsewhere unnamed, exactly as before, so no English economy's shortlist moves.
    const named = loadTranslations(economy) ? profile.name : undefined;
    for (const ind of indicatorsOfPillar(p, rubric)) asked.push(queriesFor(ind, named, economy));
  }

  const top = opts.top ?? 15;
  emit({ stage: 'discover', kind: 'started', economy, detail: `ranking the register against ${asked.length} question(s)` });
  await buildInstrumentIndex(db, { economy, log });

  const wanted = new Set<number>();
  for (const queries of asked) {
    const candidates = await shortlistInstruments(db, { economy, queries, limit: top });
    for (const c of candidates) wanted.add(c.instrumentId);
  }
  out.shortlisted = wanted.size;
  emit({
    stage: 'discover',
    kind: 'finished',
    economy,
    detail: `${wanted.size} instrument(s) worth reading`,
    total: wanted.size,
  });

  if (wanted.size === 0) {
    // A real finding about the register, not an error. It means the portals were walked and
    // nothing in them answers the questions asked, which a reviewer should be told.
    out.notes.push('nothing in the register matched the questions this run asks');
    return out;
  }

  // 3. Fetch and parse exactly those.
  emit({ stage: 'fetch', kind: 'started', economy, detail: `${wanted.size} instrument(s)`, total: wanted.size });
  const results = await materialise(db, profile, fetcher, { instrumentIds: [...wanted], log });
  const by = (outcome: string) => results.filter((r) => r.outcome === outcome).length;
  out.parsed = by('parsed');
  out.unread = by('unread');
  out.failed = by('error');
  out.notAttempted = by('not-attempted');
  if (out.notAttempted > 0) {
    out.notes.push(`${out.notAttempted} instrument(s) not attempted -- the host stopped serving us`);
  }
  emit({
    stage: 'fetch',
    kind: 'finished',
    economy,
    detail: `${out.parsed} parsed, ${out.unread} unread, ${out.failed} failed`,
    done: out.parsed,
    total: wanted.size,
  });

  // 4. Index what is new, so retrieval can reach it. Without this the documents are on disk and
  // invisible to every search the run is about to run.
  emit({ stage: 'index', kind: 'started', economy });
  try {
    if (!(await haveModel(EMBEDDING_MODEL))) {
      out.notes.push(`${EMBEDDING_MODEL} is not installed, so nothing new was indexed`);
      emit({ stage: 'index', kind: 'refused', economy, detail: `${EMBEDDING_MODEL} is not installed` });
    } else {
      const built = await buildDenseIndex(db, { economy, log });
      out.embedded = built.embedded;
      emit({
        stage: 'index',
        kind: 'finished',
        economy,
        detail: `${built.embedded} newly embedded, ${built.alreadyPresent} already indexed`,
        total: built.embedded,
      });
    }
  } catch (err) {
    if (!(err instanceof OllamaUnavailable)) throw err;
    out.notes.push(err.message);
    emit({ stage: 'index', kind: 'failed', economy, detail: err.message });
  }

  out.fetched = fetcher.stats.network;
  out.fromCache = fetcher.stats.cached;
  return out;
}

/** One line per economy, for a terminal and for the run's notes. */
export function describePrepare(r: PrepareResult): string {
  if (r.notes.some((n) => n.startsWith('cache-only'))) return `  ${r.economy}: cache-only, 0 fetched`;
  return (
    `  ${r.economy}: ${r.registered} registered, ${r.shortlisted} shortlisted, ` +
    `${r.parsed} parsed, ${r.embedded} embedded, ${r.fetched} fetched over the network`
  );
}
