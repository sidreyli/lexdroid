/**
 * Per cell, the sections worth reading — and the record of how they were chosen.
 *
 * This stage produces no findings. It produces a *search record*: the queries that were asked, the
 * channels that answered, and the rank each section came back at. That record is the evidence
 * behind every "no restriction" this system reports, and without it a zero is an assertion rather
 * than a finding. ESCAP's reviewers rejected assertions repeatedly across the graded submissions.
 *
 * The query set is derived from the rubric rather than written by hand, so it moves when the
 * methodology moves and so a stranger can see why a particular question was asked. For one
 * indicator it is the category -- what the indicator is about -- each scoring band's own wording
 * with that category attached, because the bands are the distinctions the score turns on and most
 * of them name no area of law on their own, and the description of every measure the indicator
 * recognises, which is the only part of the rubric written in the language provisions themselves
 * are written in.
 *
 * Retrieval depth is a declared number, recorded per cell. Lowering it is a legitimate choice and
 * an auditable one; lowering it silently is how a system quietly stops looking.
 */
import type { Db } from '../db/index.js';
import type { Indicator } from '../rubric/types.js';
import { MEASURES } from '../rubric/measures.js';
import { shortlistInstruments } from '../shortlist/index.js';
import {
  fuse,
  loadVectors,
  searchDense,
  searchLexical,
  type Channel,
  type LoadedVectors,
  type SearchHit,
} from '../index/index.js';

/** How many sections a cell reads, unless told otherwise. Recorded in every retrieval record. */
export const DEFAULT_DEPTH = 24;

/**
 * How much of that depth one instrument may occupy.
 *
 * Measured on Singapore's own corpus. Every query in pillar 7 is about data protection, and every
 * provision of the Personal Data Protection Act is about data protection, so the Act and its
 * regulations took 45 of the first 50 fused results for all five indicators -- including the ones
 * they do not answer. The provisions that do answer them sat far below: the Companies Act's
 * accounting-records section at rank 60, the Income Tax Act's at 87, the Criminal Procedure Code's
 * power to access a computer nowhere in the list at all.
 *
 * The cap removes nothing. A section over its instrument's share moves to the back of the queue
 * and is still taken if the depth is not filled otherwise, so a corpus with one relevant
 * instrument still reads it fully. What it prevents is one Act's internal ranking deciding what a
 * whole economy is asked.
 */
const PER_INSTRUMENT = 6;

/** How deep each individual query goes before fusion. Wider than the depth, on purpose. */
const PER_QUERY_DEPTH = 40;

/**
 * How many of its own best answers each query keeps, before consensus is allowed to decide.
 *
 * Reciprocal rank fusion rewards a section for coming back to many queries. That is the right
 * instinct when the queries are independent evidence, and these are not: three of the four asked
 * for indicator 6.2 are the same sentence with a band criterion appended, so anything broadly
 * about data protection appears in all of them and outranks anything that answers only one.
 *
 * Measured on Singapore. Section 199 of the Companies Act -- accounting records kept abroad must
 * have statements "sent to and kept at a place in Singapore", which is the local storage
 * requirement ESCAP cites for that cell -- came back second out of 6,143 sections on the query
 * that describes the measure, appeared in two of the eight runs, and fused to 37th. The depth is
 * 24. Sections seen in five of eight runs at middling ranks took every slot above it.
 *
 * So each run seats its own best answer first, in the order the queries were asked, and fusion
 * fills the rest. It removes nothing and costs nothing where a query's best answer is already the
 * consensus answer, which is the usual case; it bites only where one question found something the
 * others could not, which is the case worth protecting. The instrument cap below still applies.
 */
const PER_RUN_SEATS = 2;

/**
 * How many instruments are asked for by name, and how much of the depth each may claim.
 *
 * The depth was measured on Singapore's 6,143 provisions. Australia's corpus is 32,591, and at
 * that size a provision no longer has to be wrong to be missed -- it only has to be outranked by
 * five hundred others. The Telecommunications (Interception and Access) Act's own chapter headed
 * "Access to telecommunications data" ranked 50th, 74th and 106th for the indicator it answers,
 * and a depth of 24 never reached it, so Australia's government-access cell was decided by a
 * financial-reporting provision instead.
 *
 * So the register is asked which instruments govern the question, and the best provisions of the
 * first few are seated. This adds nothing to the corpus and removes nothing from the ranking; it
 * decides only what a fixed depth spends itself on. Where the register has no opinion the seats go
 * unused and the fused order stands.
 */
const GOVERNING_INSTRUMENTS = 3;
/** The same share PER_INSTRUMENT allows anyone else, added to the depth rather than taken from it. */
const SEATS_PER_GOVERNING = PER_INSTRUMENT;

/** One query, on one channel, that surfaced a section -- and where in that query it came back. */
export interface Surfacing {
  channel: Channel;
  query: string;
  rank: number;
  score: number;
}

export interface RetrievedSection {
  sectionId: number;
  documentId: number;
  instrumentId: number;
  instrumentTitle: string;
  headingPath: string;
  text: string;
  anchor: string | null;
  rank: number;
  channels: string[];
  /**
   * Which query found it, on which channel, at which rank.
   *
   * The fused rank says a provision came back; this says why. A reviewer asking "how did you find
   * section 199 of the Companies Act" gets the actual question that returned it rather than a
   * position in a list that has already had two channels and eight queries folded into it.
   */
  found: Surfacing[];
}

export interface RetrievalRecord {
  indicatorId: string;
  economy: string;
  /** Every query asked, verbatim, in the order asked. */
  queries: string[];
  depth: number;
  /** How many distinct sections the queries surfaced before the depth cut. */
  surfaced: number;
  /** How many sections the economy's index holds at all -- the denominator for "we looked". */
  indexedSections: number;
  /** How deep each individual query went before fusion. Wider than the depth, on purpose. */
  perQueryDepth: number;
  /** The instruments the register named as governing this question, and what each was given. */
  governing: { instrumentId: number; title: string; rank: number; seated: number }[];
  sections: RetrievedSection[];
}

/**
 * The rubric says "within the economy"; a statute says "in Malaysia". Retrieval is asked in the
 * words the law is written in, while the gloss the reader sees stays generic.
 */
function named(text: string, economyName?: string): string {
  if (!economyName) return text;
  return text.replace(/(the|this) economy/gi, economyName);
}

/**
 * The queries for one indicator, derived from its own rubric text.
 *
 * Deliberately several short queries rather than one long one. A single concatenated paragraph
 * embeds to the average of everything it mentions, which is close to nothing; the band wordings
 * are the distinctions that decide the score and each deserves its own retrieval.
 */
export function queriesFor(indicator: Indicator, economyName?: string): string[] {
  const out: string[] = [];
  const push = (s: string | null | undefined): void => {
    const t = named((s ?? '').replace(/\s+/g, ' ').trim(), economyName);
    if (t.length >= 12 && !out.includes(t)) out.push(t);
  };

  const subject = `${indicator.pillarName}: ${indicator.category}`;
  push(subject);

  // What the indicator is looking for, said the way a statute would say it. The rubric's own
  // wording names a policy issue; these name an obligation, and provisions are written as
  // obligations. Measured on Singapore, this is the difference between finding the Companies Act's
  // record-keeping duty and not finding it at all -- see rubric/measures.ts.
  for (const measure of MEASURES[indicator.id] ?? []) {
    push(measure.gloss);
    for (const extra of measure.alsoAsked ?? []) push(extra);
  }

  for (const band of indicator.bands) {
    // The "no requirement" band says nothing retrievable -- no provision reads "no requirement" --
    // so it is not asked. Its absence is what Zone 3 concludes from the others.
    if (band.score === 0 && /^no\b/i.test(band.criterion.trim())) continue;

    // Each band criterion is asked with its subject attached. On its own, 6.4's middle band reads
    // "Conditions for specific data or non-personal data", which names no area of law at all: the
    // dense channel scored it 0.62 against Health Information and 0.63 against Application of Act,
    // and the provision the indicator is actually about -- section 26, transfer of personal data
    // outside Singapore -- was pushed out of the fused results by that noise.
    push(`${indicator.category}. ${band.criterion}`);
  }
  return out;
}

/*  The exception is deliberately not a query.
 *
 *  "Not score data localization measure applied to government data" is an instruction to whoever
 *  scores, not a description of anything a legislature enacted, and no provision resembles it.
 *  Asked as a query it returned four unrelated sections and, because reciprocal rank fusion weights
 *  every run equally, those four displaced real hits from the answer. It belongs in Zone 3, where
 *  it decides whether a found measure counts, and it is carried through in the rubric for exactly
 *  that.
 */

export interface RetrieveOptions {
  economy: string;
  depth?: number;
  vectors?: LoadedVectors;
  model?: string;
}

export async function retrieveForIndicator(
  db: Db,
  indicator: Indicator,
  opts: RetrieveOptions,
): Promise<RetrievalRecord> {
  const depth = opts.depth ?? DEFAULT_DEPTH;
  const economyRow = db
    .prepare('SELECT name FROM economy WHERE code = ?')
    .get(opts.economy) as { name: string } | undefined;
  const queries = queriesFor(indicator, economyRow?.name);
  const vectors = opts.vectors ?? loadVectors(db, { economy: opts.economy, ...(opts.model ? { model: opts.model } : {}) });

  const runs: SearchHit[][] = [];
  for (const query of queries) {
    const lex = searchLexical(db, query, { limit: PER_QUERY_DEPTH, economy: opts.economy });
    if (lex.length) runs.push(lex);
    if (vectors.ids.length) {
      const dense = await searchDense(query, vectors, {
        limit: PER_QUERY_DEPTH,
        ...(opts.model ? { model: opts.model } : {}),
      });
      if (dense.length) runs.push(dense);
    }
  }

  const indexedSections = (
    db
      .prepare(
        `SELECT COUNT(*) c FROM section s JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`,
      )
      .get(opts.economy) as { c: number }
  ).c;

  const fused = runs.length ? fuse(runs) : [];
  const owner = instrumentOf(db, fused.map((h) => h.sectionId));

  // Keep the pre-fusion hits so a section can say which question found it. Fusion is lossy by
  // design -- it exists to collapse eight queries into one ordering -- and the thing it discards
  // is exactly what makes a retrieval auditable.
  const surfacings = new Map<number, Surfacing[]>();
  for (const run of runs) {
    for (const hit of run) {
      const list = surfacings.get(hit.sectionId) ?? [];
      list.push({ channel: hit.channel, query: hit.query, rank: hit.rank, score: hit.score });
      surfacings.set(hit.sectionId, list);
    }
  }

  // Every query's own best answers first, then the consensus. Ordered by seat round so that each
  // run's first choice is seated before any run's second, and by the order the queries were asked
  // within a round, which is the order the rubric puts them in.
  const afterQueries = seatQueryBests(runs, fused, PER_RUN_SEATS);

  // The instruments the register says govern the question, each read from what the search already
  // surfaced. Nothing new is searched for and nothing is dropped.
  const governors = await shortlistInstruments(db, {
    economy: opts.economy,
    queries,
    limit: GOVERNING_INSTRUMENTS * 5,
    ...(opts.model ? { model: opts.model } : {}),
  });
  // Read instruments only. An unread one has no provisions to seat, and letting it hold a place
  // is how Australia's government-access cell kept the interception Act out a second time: the
  // register put an unread bilateral agreement third and the Act that answers the question fifth.
  const chosen = governors.filter((c) => c.read).slice(0, GOVERNING_INSTRUMENTS);
  // The best rank any single query gave a section, which is what a governing instrument's seats
  // are filled from. Kept from the runs, because fusion is exactly what buried the answer.
  const bestRank = new Map<number, number>();
  for (const run of runs) {
    for (const hit of run) {
      const seen = bestRank.get(hit.sectionId);
      if (seen === undefined || hit.rank < seen) bestRank.set(hit.sectionId, hit.rank);
    }
  }

  // Diversify before cutting to depth, not after: cutting first is what buried the provisions.
  const withinShare: typeof fused = [];
  const overflow: typeof fused = [];
  const taken = new Map<number, number>();
  for (const hit of afterQueries) {
    const instrument = owner.get(hit.sectionId) ?? -1;
    const n = taken.get(instrument) ?? 0;
    if (n < PER_INSTRUMENT) {
      taken.set(instrument, n + 1);
      withinShare.push(hit);
    } else {
      overflow.push(hit);
    }
  }
  const ordered = [...withinShare, ...overflow];

  const seated = addGoverningSeats(
    ordered,
    (id) => owner.get(id) ?? -1,
    chosen.map((c) => c.instrumentId),
    SEATS_PER_GOVERNING,
    depth,
    (id) => bestRank.get(id) ?? Number.MAX_SAFE_INTEGER,
  );
  const governing: RetrievalRecord['governing'] = chosen.map((c) => ({
    instrumentId: c.instrumentId,
    title: c.title,
    rank: c.rank,
    seated: seated.counts.get(c.instrumentId) ?? 0,
  }));

  const byId = db.prepare(
    `SELECT s.id, s.document_id, s.heading_path, s.text, s.anchor,
            d.instrument_id, i.title AS instrument_title
       FROM section s
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE s.id = ?`,
  );

  const sections: RetrievedSection[] = [];
  for (const hit of seated.order) {
    const row = byId.get(hit.sectionId) as
      | {
          id: number;
          document_id: number;
          heading_path: string;
          text: string;
          anchor: string | null;
          instrument_id: number;
          instrument_title: string;
        }
      | undefined;
    if (!row) continue;
    sections.push({
      sectionId: row.id,
      documentId: row.document_id,
      instrumentId: row.instrument_id,
      instrumentTitle: row.instrument_title,
      headingPath: row.heading_path,
      text: row.text,
      anchor: row.anchor,
      rank: sections.length + 1,
      channels: hit.channels,
      found: (surfacings.get(hit.sectionId) ?? []).sort((a, b) => a.rank - b.rank),
    });
  }

  return {
    indicatorId: indicator.id,
    economy: opts.economy,
    queries,
    depth,
    surfaced: fused.length,
    indexedSections,
    perQueryDepth: PER_QUERY_DEPTH,
    governing,
    sections,
  };
}

/**
 * Each run's own best answers first, in the order the queries were asked, then the fused rest.
 *
 * Generic in the fused element so the pure ordering can be tested without a corpus behind it.
 */
export function seatQueryBests<T extends { sectionId: number }>(
  runs: readonly (readonly SearchHit[])[],
  fused: readonly T[],
  seats: number,
): T[] {
  const byId = new Map(fused.map((h) => [h.sectionId, h] as const));
  const taken = new Set<number>();
  const seated: T[] = [];
  for (let round = 0; round < seats; round++) {
    for (const run of runs) {
      // Its own answer at this rank, not the best thing it has left. Three near-duplicate queries
      // offering the same section claim one seat between them rather than three in a row, which
      // is the whole point -- otherwise the chorus that crowded the fused order crowds this one.
      const hit = run[round];
      if (!hit || !byId.has(hit.sectionId) || taken.has(hit.sectionId)) continue;
      taken.add(hit.sectionId);
      seated.push(byId.get(hit.sectionId)!);
    }
  }
  return [...seated, ...fused.filter((h) => !taken.has(h.sectionId))];
}

/**
 * The depth, plus each named instrument's own best provisions where the depth did not hold them.
 * "Own best" is the rank that instrument earned on a single query, not its place after fusion.
 */
export function addGoverningSeats<T extends { sectionId: number }>(
  ordered: readonly T[],
  instrumentOfSection: (sectionId: number) => number,
  instrumentIds: readonly number[],
  seats: number,
  depth: number,
  /** The best rank any single query gave a section. Absent, the fused order stands. */
  bestQueryRank?: (sectionId: number) => number,
): { order: T[]; counts: Map<number, number> } {
  // Added to the depth, never taken out of it. Malaysia's section 129 was missing because the
  // seats were too few; Singapore's Companies Act section 199 fell out when they grew.
  const order = ordered.slice(0, depth);
  const held = new Set(order.map((h) => h.sectionId));
  const counts = new Map<number, number>();
  const place = new Map(ordered.map((h, i) => [h.sectionId, i] as const));
  for (const instrumentId of instrumentIds) {
    const own = ordered.filter((h) => instrumentOfSection(h.sectionId) === instrumentId);
    if (bestQueryRank) {
      own.sort(
        (a, b) =>
          bestQueryRank(a.sectionId) - bestQueryRank(b.sectionId) ||
          place.get(a.sectionId)! - place.get(b.sectionId)!,
      );
    }
    for (const hit of own.slice(0, seats)) {
      counts.set(instrumentId, (counts.get(instrumentId) ?? 0) + 1);
      if (held.has(hit.sectionId)) continue;
      held.add(hit.sectionId);
      order.push(hit);
    }
  }
  return { order, counts };
}

/** section id -> the instrument it belongs to, for the diversity cap. */
function instrumentOf(db: Db, sectionIds: number[]): Map<number, number> {
  const out = new Map<number, number>();
  const CHUNK = 500;
  for (let i = 0; i < sectionIds.length; i += CHUNK) {
    const slice = sectionIds.slice(i, i + CHUNK);
    const rows = db
      .prepare(
        `SELECT s.id, d.instrument_id FROM section s JOIN document d ON d.id = s.document_id
          WHERE s.id IN (${slice.map(() => '?').join(',')})`,
      )
      .all(...slice) as { id: number; instrument_id: number }[];
    for (const r of rows) out.set(r.id, r.instrument_id);
  }
  return out;
}
