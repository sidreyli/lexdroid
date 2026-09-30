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
 * checked on the day, whose document list has to be empty.
 */
import type { Db } from '../db/index.js';
import { Fetcher, type SourceMode } from '../fetch/index.js';
import { loadProfile, applyProfile } from '../profile/index.js';
import { register, materialise } from '../discover/index.js';
import { buildDenseIndex } from '../index/index.js';
import { buildInstrumentIndex, shortlistInstruments } from '../shortlist/index.js';
import { followCitations, followDown } from '../discover/follow.js';
import { embedContents, recordParsedContents } from '../contents/index.js';
import { chosenIndicators, loadRubric } from '../rubric/index.js';
import { queriesFor } from '../retrieve/index.js';
import { hasTranslationTable } from '../retrieve/translations.js';
import { EMBEDDING_MODEL, haveModel, OllamaUnavailable } from '../engines/ollama.js';
import type { Emit } from './events.js';

export interface PrepareOptions {
  economy: string;
  pillars: number[];
  sourceMode: SourceMode;
  /**
   * The run these fetches belong to.
   *
   * Not bookkeeping: the Run Record sheet asks for every document downloaded during the hour
   * and checks the second engine's count is zero. A fetch recorded against no run cannot answer
   * that question, so the claim would rest on our word rather than on the log.
   */
  runId?: string;
  /** Only these indicators of the pillars. Absent or empty is all of them. */
  indicators?: readonly string[];
  /** How many instruments each question may pull into the corpus. */
  top?: number;
  /**
   * How many more the ones read may pull in by naming them: the Act a rule is made under, the Act
   * a provision cites. Zero turns the hop off.
   */
  follow?: number;
  /** Rules fetched from under the Acts read, one per indicator at most. 0 turns the round off. */
  down?: number;
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
  /** Instruments read because what was shortlisted names them, not because a title matched. */
  followed: number;
  followedDown: number;
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
  followed: 0,
  followedDown: 0,
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
    // Named ("in Mongolia") only where one of our translation tables covers the economy's language:
    // those tables are keyed on the named question. Unnamed elsewhere, exactly as before.
    const named = profile.officialLanguages.some((l) => hasTranslationTable(l)) ? profile.name : undefined;
    for (const ind of chosenIndicators(p, opts.indicators, rubric)) asked.push(queriesFor(ind, named, profile.officialLanguages));
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

  // 3b. One hop from what was read. A title shortlist cannot see the Act whose name shares no word
  // with the question, but the rules made under it and the provisions citing it name it outright.
  const followLimit = opts.follow ?? 10;
  if (followLimit > 0) {
    const read = results.filter((r) => r.outcome === 'parsed').map((r) => r.instrumentId);
    const leads = followCitations(db, { economy, from: read, exclude: wanted, limit: followLimit });
    out.followed = leads.length;
    if (leads.length > 0) {
      emit({
        stage: 'fetch',
        kind: 'started',
        economy,
        detail: `${leads.length} instrument(s) named by what was read`,
        total: leads.length,
      });
      for (const l of leads) {
        log?.(`  follow: ${l.title} (parent of ${l.children}, cited by ${l.citedBy})`);
        wanted.add(l.instrumentId);
      }
      results.push(
        ...(await materialise(db, profile, fetcher, { instrumentIds: leads.map((l) => l.instrumentId), log })),
      );
    }
  }
  // 3c. And one hop down, from the provisions that answer each indicator to the rules made under
  // their Acts. The Act holds the power, the rules hold the duty.
  const downLimit = opts.down ?? 20;
  if (downLimit > 0) {
    const leads = await followDown(db, { economy, asked, exclude: wanted, limit: downLimit });
    out.followedDown = leads.length;
    if (leads.length > 0) {
      emit({
        stage: 'fetch',
        kind: 'started',
        economy,
        detail: `${leads.length} instrument(s) made under what was read`,
        total: leads.length,
      });
      for (const l of leads) {
        log?.(`  down: ${l.title} (from ${l.because.join('; ')})`);
        wanted.add(l.instrumentId);
        let got = await materialise(db, profile, fetcher, { instrumentIds: [l.instrumentId], log });
        // A consolidated version the portal lists but will not serve; an earlier one says the same.
        for (const alt of l.alternates) {
          if (got.some((r) => r.outcome === 'parsed')) break;
          wanted.add(alt);
          got = await materialise(db, profile, fetcher, { instrumentIds: [alt], log });
        }
        results.push(...got);
      }
    }
  }

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
      // What was read, as contents: the framework indicators rank Acts by their headings, and an
      // Act read in this run has no contents unless they are taken from its own sections here.
      const withContents = recordParsedContents(db, { economy });
      if (withContents.size > 0) {
        const headings = await embedContents(db, { economy, log });
        log(`  contents for ${withContents.size} instrument(s) read, ${headings.embedded} heading(s) embedded`);
      }
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
    `${r.followed} followed up, ${r.followedDown} down, ${r.parsed} parsed, ${r.embedded} embedded, ${r.fetched} fetched over the network`
  );
}
