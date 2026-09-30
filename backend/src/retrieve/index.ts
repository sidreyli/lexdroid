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
import { embedQueries, EMBEDDING_MODEL } from '../engines/ollama.js';
import type { Indicator } from '../rubric/types.js';
import { MEASURES, TARIFF_CODED_MEASURE } from '../rubric/measures.js';
import { ictTariffCodes } from '../rubric/ict-goods.js';
import { THAI } from './queries-th.js';
import { shortlistInstruments } from '../shortlist/index.js';
import { hasTranslationTable, translatedQueriesIn } from './translations.js';
import { determinesAParticularCase } from '../discover/titles.js';
import { REPLACEABLE_FIGURE } from '../parse/identity.js';
import {
  fuse,
  loadVectors,
  searchDense,
  searchLexical,
  type Channel,
  type LoadedVectors,
  type SearchHit,
} from '../index/index.js';

/** How many sections a cell reads in the corpus the depth was measured on, unless told otherwise. */
export const DEFAULT_DEPTH = 24;

/**
 * The corpus the depth and the per-query width were measured on.
 *
 * Singapore holds 19,064 provisions. Malaysia holds 37,144 and Australia 55,902 -- a Singaporean
 * provision has a fifth of the competition an Australian one has, and both were being asked for
 * the same twenty-four places. Australia is the economy the run scored worst on.
 */
const MEASURED_ON = 19_000;

/**
 * How much further to look in a corpus larger than the one the numbers were measured on.
 *
 * Sub-linear on purpose. Retrieval is cheap and reading is not -- every extra place is another
 * call to the model -- so the depth grows with the square root of the corpus rather than with the
 * corpus. Australia's 55,902 provisions buy 1.7 times the depth, not three times it. Capped at
 * double, because past that the cost is real and the answer is better retrieval, not more reading.
 *
 * A corpus smaller than the measured one is not read more thinly: the scale never falls below one.
 * The number it produces is recorded on every cell, so a run says how deep it looked.
 */
export function scaleFor(indexedSections: number): number {
  if (!Number.isFinite(indexedSections) || indexedSections <= MEASURED_ON) return 1;
  return Math.min(2, Math.sqrt(indexedSections / MEASURED_ON));
}

/** The depth for a corpus of this size, rounded to a whole number of provisions. */
export function depthFor(indexedSections: number): number {
  return Math.round(DEFAULT_DEPTH * scaleFor(indexedSections));
}

/** And how deep each individual query goes before fusion, which is wider than the depth on purpose. */
export function perQueryDepthFor(indexedSections: number): number {
  return Math.round(PER_QUERY_DEPTH * scaleFor(indexedSections));
}

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
 *
 * Six seats rather than three. Three was chosen against the depth alone, on the assumption that
 * naming more instruments would start pushing better-ranked ones out. Measured across all 61
 * Australian indicators it does not: widening to six seats seated 193 instruments that had not
 * been seated before and displaced 10, and surfaced 22% more provisions -- more in every one of
 * the 61, fewer in none. The register adds where it has an opinion and stands aside where it has
 * none, so the cost of a seat is bounded by what that seat surfaces.
 */
const GOVERNING_INSTRUMENTS = 6;
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
export function queriesFor(indicator: Indicator, economyName?: string, languages: readonly string[] = []): string[] {
  const out: string[] = [];
  const push = (s: string | null): void => {
    if (s === null) return;
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length >= 12 && !out.includes(t)) out.push(t);
  };
  for (const q of asked(indicator, (s) => s)) push(q === null ? null : named(q.replace(/\s+/g, ' ').trim(), economyName));

  // The same questions in the language the economy legislates in, after the English, so that
  // every English run keeps the seat it had. A wording with no rendering is not asked in that
  // language rather than asked half in English.
  const english = [...out];
  for (const language of languages) {
    const words = QUERY_WORDS[language];
    if (words) {
      for (const q of asked(indicator, (s) => words[s.replace(/\s+/g, ' ').trim()] ?? null)) push(q);
      continue;
    }
    // Mongolian, Russian and Lao are rendered whole-question by table (data/query-translations),
    // each in two phrasings: plain, and as the operative provision would say it.
    for (const q of translatedQueriesIn(language, english)) push(q);
  }
  return out;
}

/** The questions in English alone: what a translation table is keyed on. */
export function englishQueriesFor(indicator: Indicator, economyName?: string): string[] {
  return queriesFor(indicator, economyName);
}

/** The rubric's retrieval words in each language they have been rendered into, beyond English. */
const QUERY_WORDS: Record<string, Readonly<Record<string, string>>> = { th: THAI };

/** The questions for one indicator, each wording passed through `say`; null where it has none. */
function asked(indicator: Indicator, say: (english: string) => string | null): (string | null)[] {
  const both = (a: string, sep: string, b: string): string | null => {
    const x = say(a);
    const y = say(b);
    return x === null || y === null ? null : `${x}${sep}${y}`;
  };
  const out: (string | null)[] = [];

  out.push(both(indicator.pillarName, ': ', indicator.category));

  // What the indicator is looking for, said the way a statute would say it. The rubric's own
  // wording names a policy issue; these name an obligation, and provisions are written as
  // obligations. Measured on Singapore, this is the difference between finding the Companies Act's
  // record-keeping duty and not finding it at all -- see rubric/measures.ts.
  for (const measure of MEASURES[indicator.id] ?? []) {
    out.push(say(measure.gloss));
    for (const extra of measure.alsoAsked ?? []) out.push(say(extra));
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
    out.push(both(indicator.category, '. ', band.criterion));
  }
  return out;
}

/** Every English wording `queriesFor` renders, for holding a translation table to the rubric. */
export function queryWordings(indicator: Indicator): string[] {
  const seen: string[] = [];
  asked(indicator, (s) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (!seen.includes(t)) seen.push(t);
    return t;
  });
  return seen;
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
  /** The languages the economy legislates in; each rendered one asks the questions again. */
  languages?: readonly string[];
}

/** Whether a shortlisted instrument may be named as governing a question. See the call site. */
export function mayGovern(candidate: { read: boolean; kind: string }): boolean {
  return candidate.read && candidate.kind !== 'publication';
}

export async function retrieveForIndicator(
  db: Db,
  indicator: Indicator,
  opts: RetrieveOptions,
): Promise<RetrievalRecord> {
  const indexedSections = (
    db
      .prepare(
        `SELECT COUNT(*) c FROM section s JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`,
      )
      .get(opts.economy) as { c: number }
  ).c;

  // How far this economy's corpus is asked to be looked into. Declared, recorded, and larger for
  // a larger statute book -- an asked-for depth still wins, because lowering it has to stay a
  // choice someone made rather than something that happened.
  const depth = opts.depth ?? depthFor(indexedSections);
  const perQueryDepth = perQueryDepthFor(indexedSections);

  const economyRow = db
    .prepare('SELECT name FROM economy WHERE code = ?')
    .get(opts.economy) as { name: string } | undefined;
  // Asked in English, and then asked again in each language the economy legislates in -- as a
  // second search, not as more of the first. Folded into one fusion, Thailand's Thai questions took
  // seats the English ones had held, and a correct cell lost the provision it stood on: 4.1 the
  // Trade Secrets Act's section 35, 5.7 the Frequency Allocation Act's sections 6 and 81. Searched
  // apart, what the English asks is found exactly as before, and what only Thai reaches is added.
  const english = queriesFor(indicator, economyRow?.name);
  const rendered = queriesFor(indicator, economyRow?.name, opts.languages ?? []).slice(english.length);
  const queries = [...english, ...rendered];
  const vectors = opts.vectors ?? loadVectors(db, { economy: opts.economy, ...(opts.model ? { model: opts.model } : {}) });

  const second = otherLanguageCopies(db, opts.economy);
  const outlines = outlineSections(db, opts.economy);
  const copies = duplicateRegistrations(db, opts.economy);
  const decided = caseSections(db, opts.economy);
  // Last, and told what the others took: a provision is a second copy only where the copy it
  // repeats is still readable after they have had their say.
  const suppressed = new Set<number>([...second, ...outlines, ...copies, ...decided]);
  const repeats = duplicateProvisions(db, opts.economy, suppressed);
  const skip = (id: number): boolean => suppressed.has(id) || repeats.has(id);
  const ask = { depth, perQueryDepth, vectors, skip };

  // Where the economy legislates in a language one of our translation tables covers (Mongolian,
  // Russian, Lao), the English questions are not asked of the words. A Cyrillic or Lao statute book
  // matches English only on stray Latin -- product codes, a URL -- and each such run weighs as much
  // in the fusion as a real one: Russia's 6.1 was decided on a sweets-labelling rule while every
  // translated query ranked 152-ФЗ first. The dense channel still asks them, since the embedding
  // model reads across languages. English economies and Thai have no table: unchanged.
  const englishLexical = !(opts.languages ?? []).some((l) => hasTranslationTable(l));
  const first = await seatFor(db, english, opts, { ...ask, lexical: englishLexical });
  const again = rendered.length ? await seatFor(db, rendered, opts, ask) : null;
  const order = [...first.order];
  const seen = new Set(order.map((h) => h.sectionId));
  for (const hit of again?.order ?? []) {
    if (seen.has(hit.sectionId)) continue;
    seen.add(hit.sectionId);
    order.push(hit);
  }
  const surfacings = new Map(first.surfacings);
  for (const [id, list] of again?.surfacings ?? []) surfacings.set(id, [...(surfacings.get(id) ?? []), ...list]);
  const governing = [...first.governing];
  for (const g of again?.governing ?? []) if (!governing.some((x) => x.instrumentId === g.instrumentId)) governing.push(g);
  const surfaced = new Set([...first.fused, ...(again?.fused ?? [])]).size;

  const byId = db.prepare(
    `SELECT s.id, s.document_id, s.heading_path, s.text, s.anchor,
            d.instrument_id, i.title AS instrument_title
       FROM section s
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE s.id = ?`,
  );

  const sections: RetrievedSection[] = [];
  for (const hit of order) {
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

  // Last, and only adding: a provision that leaves its amount to be prescribed brings in the
  // provision that prescribes it, seated just behind it. See prescribingSections.
  const byPointer = prescribingSections(db, opts.economy, sections);
  if (byPointer.size) {
    const have = new Set(sections.map((s) => s.sectionId));
    const withFollowed: RetrievedSection[] = [];
    for (const s of sections) {
      withFollowed.push(s);
      for (const id of byPointer.get(s.sectionId) ?? []) {
        if (have.has(id)) continue;
        const row = byId.get(id) as
          | { id: number; document_id: number; heading_path: string; text: string; anchor: string | null; instrument_id: number; instrument_title: string }
          | undefined;
        if (!row) continue;
        have.add(id);
        withFollowed.push({
          sectionId: row.id,
          documentId: row.document_id,
          instrumentId: row.instrument_id,
          instrumentTitle: row.instrument_title,
          headingPath: row.heading_path,
          text: row.text,
          anchor: row.anchor,
          rank: 0,
          channels: ['prescribed-by'],
          found: [],
        });
      }
    }
    sections.splice(0, sections.length, ...withFollowed.map((s, i) => ({ ...s, rank: i + 1 })));
  }

  // And, only adding, the provisions that charge goods by an ICT tariff code. See codedSections.
  const measureWords = TARIFF_CODED_MEASURE[indicator.id];
  if (measureWords) {
    const have = new Set(sections.map((s) => s.sectionId));
    // Every suppression but one: a notice deciding a named case is kept out because it applies a
    // rule rather than states one, and a duty imposed on named goods is exactly what 1.4 counts.
    const notDecided = new Set<number>([...second, ...outlines, ...copies]);
    const codedSkip = (id: number): boolean => notDecided.has(id) || repeats.has(id) || have.has(id);
    for (const id of codedSections(db, opts.economy, queries, measureWords, codedSkip)) {
      const row = byId.get(id) as
        | { id: number; document_id: number; heading_path: string; text: string; anchor: string | null; instrument_id: number; instrument_title: string }
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
        channels: ['tariff-code'],
        found: [],
      });
    }
  }

  return {
    indicatorId: indicator.id,
    economy: opts.economy,
    queries,
    depth,
    surfaced,
    indexedSections,
    perQueryDepth,
    governing,
    sections,
  };
}

/**
 * One search: every query on both channels, fused, each run's best seated, diversified across
 * instruments, and the governing instruments' seats added, cut to depth.
 */
async function seatFor(
  db: Db,
  queries: string[],
  opts: RetrieveOptions,
  {
    depth,
    perQueryDepth,
    vectors,
    skip,
    lexical = true,
  }: { depth: number; perQueryDepth: number; vectors: LoadedVectors; skip: (id: number) => boolean; lexical?: boolean },
): Promise<{
  order: { sectionId: number; channels: string[] }[];
  surfacings: Map<number, Surfacing[]>;
  governing: RetrievalRecord['governing'];
  fused: number[];
}> {
  const runs: SearchHit[][] = [];
  // Every question embedded in one request, so the loop below reads each vector locally.
  if (vectors.ids.length) await embedQueries(queries, opts.model ?? EMBEDDING_MODEL);
  for (const query of queries) {
    const lex = lexical
      ? searchLexical(db, query, { limit: perQueryDepth, economy: opts.economy }).filter((h) => !skip(h.sectionId))
      : [];
    if (lex.length) runs.push(lex);
    if (vectors.ids.length) {
      const dense = (await searchDense(query, vectors, {
        limit: perQueryDepth,
        ...(opts.model ? { model: opts.model } : {}),
      })).filter((h) => !skip(h.sectionId));
      if (dense.length) runs.push(dense);
    }
  }

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
  // Read instruments only, and instruments only. An unread one has no provisions to seat, and
  // letting it hold a place is how Australia's government-access cell kept the interception Act
  // out a second time: the register put an unread bilateral agreement third and the Act that
  // answers the question fifth.
  //
  // A publication is a document *about* the law and cannot govern a question about the law, which
  // is the line `absenceFor` already draws in Zone 3 and the same line, one stage earlier. It is
  // drawn here rather than left to the register because a register is a guess about titles and
  // will be wrong again on the next economy: in the run of 20 September 2026 the register still
  // called 132 regulator pages Acts, and they took 70 of the 150 governing seats across 50 cells.
  // Australia's copyright-framework cell was governed by three IP Australia consultation pages of
  // three sections each; its fair-dealing cell by two, beside the Copyright Act itself.
  const chosen = governors.filter(mayGovern).slice(0, GOVERNING_INSTRUMENTS);
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
    afterQueries,
  );
  const governing: RetrievalRecord['governing'] = chosen.map((c) => ({
    instrumentId: c.instrumentId,
    title: c.title,
    rank: c.rank,
    seated: seated.counts.get(c.instrumentId) ?? 0,
  }));

  return { order: seated.order, surfacings, governing, fused: fused.map((h) => h.sectionId) };
}

/** The language the rubric is written in, and so the one a provision is read in where there is a choice. */
export const RUBRIC_LANGUAGE = 'en';

/**
 * The sections that are a second copy of a provision the corpus already holds in the rubric's
 * language.
 *
 * A bilingual instrument states every provision twice, once per official language, and reading
 * both retrieves, reads and counts one provision twice. But "the instrument holds some English" is
 * not "this provision is held in English": Malaysia's banking code of practice has one English
 * section beside 128 Malay ones, and dropping every Malay section of an instrument with any English
 * in it lost the other 127. So a provision is a second copy only where its own counterpart is
 * there.
 *
 * And a counterpart is not the next section with the same number. One registered instrument can
 * hold several documents that each number from 1.1 -- a data protection officer guideline and a
 * breach notification guideline filed together -- and pairing by the label alone suppressed a
 * provision against a different provision that happened to share it, so the one that mattered was
 * never read. A translation keeps what language cannot change: the section numbers, years, act
 * numbers and sums it cites, and roughly its length. A section is paired with a same-labelled one
 * in the rubric's language only where those agree, one to one; where nothing tells the candidates
 * apart, it is kept. Reading a provision twice costs time. Never reading it costs the answer.
 */
/**
 * The provisions of an instrument that say of themselves that they summarise its other
 * provisions.
 *
 * They are written in the operative voice, because that is what makes a summary readable: "
 * Carriers must provide other carriers with access to telecommunications transmission towers" is
 * a section called "Simplified outline", and the Part it introduces is where the duty is imposed.
 * So they match the queries that look for the duty, they rank above the provisions that impose it
 * -- a summary says the whole thing in one sentence, and the real duty is spread over a Part --
 * and they take the reading seat. 534 of one run's 2,468 went this way.
 *
 * Read off the heading rather than the text, for the same reason: the text is the duty restated.
 */
const OUTLINE_HEADING =
  /\b(simplified outline|outline of this (?:part|division|chapter|act|schedule)|guide to this (?:part|division|chapter|act)|overview of this (?:part|division|chapter|act))/i;

export function outlineSections(db: Db, economy: string): Set<number> {
  const rows = db
    .prepare(
      `SELECT s.id, s.label, s.heading_path
         FROM section s
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE i.economy_code = ?`,
    )
    .all(economy) as { id: number; label: string | null; heading_path: string | null }[];
  const out = new Set<number>();
  for (const r of rows) {
    if (OUTLINE_HEADING.test(r.label ?? '') || OUTLINE_HEADING.test(r.heading_path ?? '')) out.add(r.id);
  }
  return out;
}

/**
 * Sections of a registration that is a second copy of one already in the corpus.
 *
 * Twenty-eight Malaysian documents are registered under two and three instrument ids each --
 * byte-identical, same content hash -- for 3,896 sections, 3.2% of that register. They arise where
 * the statute book and a regulator both publish the same gazette PDF, and where one portal serves
 * the same file from two paths. `otherLanguageCopies` cannot see them: it keys on instrument and
 * label, so two copies under two instrument ids are two different keys and never pair.
 *
 * What it costs is not wasted reading but wrong counting. Several bands turn on how many measures
 * an economy has, and a cell handed the same provision twice under two names can make two of one.
 *
 * Which copy survives follows the rule the register already uses for what a source will support: a
 * source that states an identifier or a standing said something about what it published, and one
 * that states neither did not. Where neither copy states anything the first registered is kept,
 * which is arbitrary between equals and is the only part of this that is.
 */
export function duplicateRegistrations(db: Db, economy: string): Set<number> {
  const rows = db
    .prepare(
      `SELECT d.content_hash AS hash, i.id AS instrument,
              i.official_number AS number, i.status AS status
         FROM document d
         JOIN instrument i ON i.id = d.instrument_id
        WHERE i.economy_code = ?
        GROUP BY d.content_hash, i.id
        ORDER BY d.content_hash, i.id`,
    )
    .all(economy) as { hash: string; instrument: number; number: string | null; status: string }[];

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = groups.get(r.hash) ?? [];
    list.push(r);
    groups.set(r.hash, list);
  }

  const stands = (r: { number: string | null; status: string }): boolean =>
    (r.number ?? '').trim() !== '' || (r.status !== 'unknown' && (r.status ?? '').trim() !== '');

  const retired: number[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keep = list.find(stands) ?? list[0]!;
    for (const r of list) if (r.instrument !== keep.instrument) retired.push(r.instrument);
  }
  if (!retired.length) return new Set();

  const out = new Set<number>();
  // Chunked, because a register can retire more copies than SQLite will bind in one statement.
  for (let i = 0; i < retired.length; i += 500) {
    const chunk = retired.slice(i, i + 500);
    const sections = db
      .prepare(
        `SELECT s.id FROM section s JOIN document d ON d.id = s.document_id
          WHERE d.instrument_id IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as { id: number }[];
    for (const r of sections) out.add(r.id);
  }
  return out;
}

/**
 * Provisions a bare registration repeats from one the register can actually identify.
 *
 * `duplicateRegistrations` pairs on the content hash, so it sees a second copy only where the two
 * files are byte-identical. The same law reaches the register twice more often than that: the
 * gazette walk takes the numbered PDF, a regulator's portal serves its own rendering of the same
 * order, and the two differ in a timestamp or a font and hash apart. Malaysia's customs import
 * prohibition is registered as "P.U. (A) 117/2023" and again as "Perintah Kastam (Larangan
 * Mengenai Import) 2023" with no number at all; the Currency Act 2020 is there as "Act 827" and
 * as a portal page; one entry is the caption of a link. Their provisions are the same words, and
 * a cell retrieving them is handed the same provision twice under two names.
 *
 * What that costs is counting. Several bands turn on how many measures an economy has, and two
 * names for one order can make two of one -- the reason this is worth suppressing at all, ahead of
 * the reading it also wastes.
 *
 * The test is the one the register already applies to a second copy: a source that states an
 * identifier or a standing said something about what it published, and one that states neither did
 * not. Where both state one they are two instruments that happen to share words, not one
 * instrument twice -- the sales tax exemption orders of 2018, 2022 and 2025 repeat whole
 * schedules, and the Islamic and conventional electronic money exemptions are drafted in parallel.
 * Suppressing either of those would lose a measure that is really there, so neither is touched.
 *
 * A copy is only ever suppressed where the provision it copies is still going to be read. The
 * other suppressions compose with this one, and 180 Malaysian provisions had the identified copy
 * retired by one of them -- as a heading, as a second-language copy -- so suppressing the bare one
 * as well would have left the words in the corpus and out of every cell's reach. `alreadySkipped`
 * is what those rules have taken already, and a group all of whose identified copies are in it
 * keeps its bare copy, which is then the only place the provision is still readable.
 *
 * Suppression is per provision rather than per instrument, because a bare registration is not
 * always only a copy. Matching one boilerplate commencement line against a numbered order should
 * retire that line and nothing else; a provision the numbered copy does not hold matches nothing
 * and survives. An instrument can lose every provision this way, but only by holding none of its
 * own.
 */
export function duplicateProvisions(db: Db, economy: string, alreadySkipped?: ReadonlySet<number>): Set<number> {
  const rows = db
    .prepare(
      `SELECT s.id, d.instrument_id AS instrument, LENGTH(s.text) AS len,
              SUBSTR(s.text, 1, 180) AS head,
              (CASE WHEN IFNULL(TRIM(i.official_number), '') <> ''
                      OR (i.status IS NOT NULL AND i.status <> 'unknown' AND TRIM(i.status) <> '')
                    THEN 1 ELSE 0 END) AS stands
         FROM section s
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE i.economy_code = ? AND s.text IS NOT NULL AND LENGTH(s.text) > 0
        ORDER BY s.id`,
    )
    .all(economy) as { id: number; instrument: number; len: number; head: string; stands: number }[];

  // Grouped on the length and opening of the text rather than the whole of it, so a register the
  // size of Malaysia's fits in memory. It decides only which provisions are worth comparing; every
  // group that survives is read in full and compared exactly before anything is suppressed.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.len}|${r.head}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const suspect: (typeof rows)[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    if (new Set(list.map((r) => r.instrument)).size < 2) continue;
    if (!list.some((r) => r.stands === 1) || !list.some((r) => r.stands === 0)) continue;
    suspect.push(list);
  }
  if (!suspect.length) return new Set();

  const wanted = suspect.flat().map((r) => r.id);
  const text = new Map<number, string>();
  for (let i = 0; i < wanted.length; i += 500) {
    const chunk = wanted.slice(i, i + 500);
    const got = db
      .prepare(`SELECT id, text FROM section WHERE id IN (${chunk.map(() => '?').join(',')})`)
      .all(...chunk) as { id: number; text: string }[];
    for (const r of got) text.set(r.id, r.text);
  }

  const out = new Set<number>();
  for (const list of suspect) {
    const exact = new Map<string, typeof list>();
    for (const r of list) {
      const t = text.get(r.id);
      if (t === undefined) continue;
      const same = exact.get(t) ?? [];
      same.push(r);
      exact.set(t, same);
    }
    for (const same of exact.values()) {
      const kept = same.filter((r) => r.stands === 1 && !alreadySkipped?.has(r.id));
      if (!kept.length) continue;
      for (const r of same) if (r.stands === 0) out.add(r.id);
    }
  }
  return out;
}

export function otherLanguageCopies(db: Db, economy: string): Set<number> {
  const rows = db
    .prepare(
      `SELECT s.id, d.instrument_id AS instrument, s.label, s.language, s.heading_path
         FROM section s
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE i.economy_code = ? AND s.label IS NOT NULL AND s.language IS NOT NULL
        ORDER BY d.id, s.ordinal`,
    )
    .all(economy) as { id: number; instrument: number; label: string; language: string; heading_path: string }[];
  const pathOf = new Map(rows.map((r) => [r.id, r.heading_path]));

  // Only a label held in both the rubric's language and another can pair, so only those sections'
  // text is fetched.
  const keyOf = (r: { instrument: number; label: string }): string => `${r.instrument}|${r.label}`;
  const inRubric = new Set(rows.filter((r) => r.language === RUBRIC_LANGUAGE).map(keyOf));
  const inOther = new Set(rows.filter((r) => r.language !== RUBRIC_LANGUAGE).map(keyOf));
  const pairable = rows.filter((r) => inRubric.has(keyOf(r)) && inOther.has(keyOf(r)));
  if (pairable.length === 0) return new Set();

  const textOf = new Map<number, string>();
  const byId = db.prepare('SELECT text FROM section WHERE id = ?');
  for (const r of pairable) textOf.set(r.id, (byId.get(r.id) as { text: string } | undefined)?.text ?? '');

  const groups = new Map<string, { label: string; rubric: number[]; other: number[] }>();
  for (const r of pairable) {
    const g = groups.get(keyOf(r)) ?? { label: r.label, rubric: [], other: [] };
    (r.language === RUBRIC_LANGUAGE ? g.rubric : g.other).push(r.id);
    groups.set(keyOf(r), g);
  }

  const second = new Set<number>();
  for (const g of groups.values()) {
    const taken = new Set<number>();
    for (const other of g.other) {
      const candidates = g.rubric.filter((id) => !taken.has(id));
      const match = counterpartOf(
        textOf.get(other)!,
        candidates.map((id) => ({ id, text: textOf.get(id)!, headingPath: pathOf.get(id) })),
        g.label,
        pathOf.get(other),
      );
      if (match === null) continue;
      taken.add(match);
      second.add(other);
    }
  }
  return second;
}

/**
 * The figures a provision cites -- "12A", "709", "2010", "4.2" -- which a translation keeps. Not
 * its own number, which every candidate shares by construction and so tells none of them apart.
 */
export function figuresOf(text: string, label = ''): Set<string> {
  const own = label.replace(/[.\s]+$/, '').toUpperCase();
  return new Set(
    (text.match(/\d+(?:\.\d+)*[A-Z]{0,2}\b/g) ?? []).map((f) => f.toUpperCase()).filter((f) => f !== own),
  );
}

/**
 * The numbers of the parts a provision is filed under -- "2" for "Schedule 2 > 1 Fees", "I" for
 * "Part I > 1 Duties" -- which a translation of the path keeps even where its words change.
 */
function placeOf(headingPath: string | undefined): Set<string> {
  if (!headingPath) return new Set();
  const parents = headingPath.split(' > ').slice(0, -1).join(' ');
  return new Set((parents.match(/\b(?:\d+[A-Z]?|[IVXLC]+)\b/g) ?? []).map((t) => t.toUpperCase()));
}

/**
 * Which of the candidates in the rubric's language is this provision in another, or null.
 *
 * A candidate qualifies where the two are of a length a translation could be and cite the same
 * figures, at least half of them in common. Where neither cites any figure, only a lone candidate
 * qualifies, because nothing else could tell two of them apart. The best qualifying one wins, and a
 * tie between two is no answer.
 */
export function counterpartOf(
  text: string,
  candidates: { id: number; text: string; headingPath?: string | undefined }[],
  label = '',
  headingPath?: string,
): number | null {
  const mine = figuresOf(text, label);
  const where = placeOf(headingPath);
  const scored: { id: number; score: number }[] = [];
  for (const c of candidates) {
    // Filed under differently numbered parts, they are different provisions, whatever they cite.
    // Only where both say where they are filed: a translation's parse often drops the parent.
    const there = placeOf(c.headingPath);
    if (where.size > 0 && there.size > 0 && ![...where].some((p) => there.has(p))) continue;
    const ratio = text.length / Math.max(1, c.text.length);
    if (ratio < 0.5 || ratio > 2.2) continue;
    const theirs = figuresOf(c.text, label);
    if (mine.size === 0 && theirs.size === 0) {
      if (candidates.length === 1) scored.push({ id: c.id, score: 0 });
      continue;
    }
    if (mine.size === 0 || theirs.size === 0) continue;
    const shared = [...mine].filter((f) => theirs.has(f)).length;
    const jaccard = shared / (mine.size + theirs.size - shared);
    if (jaccard >= 0.5) scored.push({ id: c.id, score: jaccard });
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;
  if (scored.length > 1 && scored[0]!.score === scored[1]!.score) return null;
  return scored[0]!.id;
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
 *
 * A seat is spent on a provision the depth does not already have. That is what "where the depth
 * did not hold them" says, and until it was measured the code did not do it: the seats were filled
 * from the instrument's best provisions outright, and a governing instrument's best provisions are
 * very often the ones the fused order already picked, so the seat went to a section that was
 * already going to be read and bought nothing.
 *
 * Measured on the run of 20 September 2026: 150 governing instruments across 50 cells, 900 seats
 * offered, and 27 provisions added between them -- 132 of the 150 added not one. Australia's
 * copyright cell is the shape of it. The Copyright Act 1968 was named as governing and given six
 * seats; its six best provisions by single-query rank were sections 200AB, 103B, 202, 36, 118 and
 * 113E, and the depth already held all six. The Act has 670 sections and was read six provisions
 * deep, while ten accounting standards took a slot each for the copyright notice on their cover.
 *
 * The seats then spent themselves badly, for a second and separate reason. `bestQueryRank` is a
 * coarse key -- on that same cell 184 of the Act's sections were candidates and they piled onto a
 * handful of small integers, six tied at rank 1 and eight at rank 2 -- so the tie-break decided
 * nearly every seat, and the tie-break was the candidate's position in the capped order, where
 * everything the cap displaced sits at the back in the order it was displaced. Sorting the
 * overflow by how far the cap threw it is the cap again under another name. On merit order the
 * same six seats bought the research, criticism and parody exceptions in place of a part heading,
 * a rule on wills and a rule on foreign nationals. Measured across 50 cells and 697 seats: one
 * cell changes, and the median merit rank of a seated provision moves 115 to 114 -- it buys
 * nothing anywhere else and costs nothing anywhere, which is what a tie-break should do.
 */
export function addGoverningSeats<T extends { sectionId: number }>(
  ordered: readonly T[],
  instrumentOfSection: (sectionId: number) => number,
  instrumentIds: readonly number[],
  seats: number,
  depth: number,
  /** The best rank any single query gave a section. Absent, the fused order stands. */
  bestQueryRank?: (sectionId: number) => number,
  /**
   * The order the candidates were in on merit, before any diversity cap rearranged them. Absent,
   * `ordered` stands in for it. Ties on the primary key are settled here, and settling them on a
   * position that the cap assigned would re-impose the cap these seats exist to overcome.
   */
  meritOrder?: readonly { sectionId: number }[],
): { order: T[]; counts: Map<number, number> } {
  // Added to the depth, never taken out of it. Malaysia's section 129 was missing because the
  // seats were too few; Singapore's Companies Act section 199 fell out when they grew.
  const order = ordered.slice(0, depth);
  const held = new Set(order.map((h) => h.sectionId));
  const counts = new Map<number, number>();
  const place = new Map((meritOrder ?? ordered).map((h, i) => [h.sectionId, i] as const));
  for (const instrumentId of instrumentIds) {
    const own = ordered.filter((h) => instrumentOfSection(h.sectionId) === instrumentId);
    if (bestQueryRank) {
      own.sort(
        (a, b) =>
          bestQueryRank(a.sectionId) - bestQueryRank(b.sectionId) ||
          (place.get(a.sectionId) ?? ordered.length) - (place.get(b.sectionId) ?? ordered.length),
      );
    }
    for (const hit of own.filter((h) => !held.has(h.sectionId)).slice(0, seats)) {
      counts.set(instrumentId, (counts.get(instrumentId) ?? 0) + 1);
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

/**
 * Sections of a document that decides a case rather than states a rule.
 *
 * A determination made in a named proceeding is written in the statute's own words -- it is
 * applying the statute -- so it answers the same queries the statute does and, being short and
 * dense where an Act is long and general, it outranks it. In the run of 19 September 2026 these
 * took 248 of Malaysia's 3,356 reading seats and none of Australia's 12,865, and the cell on
 * trade remedies read twenty-eight of them and never the Act they are made under.
 *
 * Read off the title, because the title is the only place the document says which it is: its
 * text is the statute's language and its sections are tariff codes and margins found against
 * named exporters. See `determinesAParticularCase` for the three things a title has to say
 * before this fires, and why none of them is about any particular subject matter.
 */
export function caseSections(db: Db, economy: string): Set<number> {
  // Asked of the register first and the sections second: it is a fact about the document, so it
  // is decided once per instrument rather than once per provision.
  const decided = (
    db.prepare('SELECT id, title FROM instrument WHERE economy_code = ?').all(economy) as {
      id: number;
      title: string | null;
    }[]
  )
    .filter((i) => determinesAParticularCase(i.title ?? ''))
    .map((i) => i.id);
  if (!decided.length) return new Set();

  const out = new Set<number>();
  // Chunked, because a register can hold more decisions than SQLite will bind in one statement.
  for (let i = 0; i < decided.length; i += 500) {
    const chunk = decided.slice(i, i + 500);
    const sections = db
      .prepare(
        `SELECT s.id FROM section s JOIN document d ON d.id = s.document_id
          WHERE d.instrument_id IN (${chunk.map(() => '?').join(',')})`,
      )
      .all(...chunk) as { id: number }[];
    for (const r of sections) out.add(r.id);
  }
  return out;
}

/**
 * Words that leave an amount to another instrument: "$250 or such other amount as is prescribed",
 * "sold at a price not more than a prescribed amount".
 */
export const LEAVES_AMOUNT =
  /\b(?:such\s+other\s+(?:amount|sum|value)\s+as\s+(?:is|may\s+be)\s+(?:prescribed|specified|determined)|(?:a|the)\s+prescribed\s+(?:amount|sum|value|price))\b/i;

/**
 * An amount stated outright: a currency against digits, or a figure in words against a currency.
 * "Five hundred ringgit" is how Malaysia's low-value-goods order states its line.
 */
export const STATES_AMOUNT =
  /(?:US\s?\$|A\s?\$|S\s?\$|\bRM|₹|\$)\s?\d|\d[\d,. ]*\s?(?:dollars?|ringgit|rupees?|baht)\b|\b(?:hundred|thousand|million)\s+(?:\w+\s+){0,3}?(?:dollars?|ringgit|rupees?|baht)\b/i;

/** How many prescribing provisions one pointer may bring in, and how many a cell may take in all. */
const PRESCRIBING_PER_POINTER = 2;
const PRESCRIBING_PER_CELL = 6;
/**
 * How many instruments charging goods by an ICT tariff code are read beyond the depth. The band tops
 * out at four measures, and three times that leaves room for the notices that only amend, extend or
 * correct one.
 */
const CODED_SEATS = 12;

/** How far down each question's lexical results the coded provisions are looked for. */
const CODED_SCAN = 3000;

/**
 * The provisions that charge goods named by an ICT tariff code, one per instrument, best first.
 *
 * ESCAP defines 1.4's goods by tariff code (ict-goods.ts), and a duty notice names them by code
 * and by a trade name no question can anticipate. The questions ask for "ICT or electronic goods",
 * which India's duty on printed circuit boards never says, so among 173 duty notices that all use
 * the same words the four ESCAP counted ranked 135th to 250th and none was read. The code is the
 * one thing every such notice states and no other kind of notice does, so it is looked for here
 * rather than asked for: among the provisions the questions reach lexically, those that state an
 * ICT code and the measure's own words, in the order the questions ranked them.
 */
export function codedSections(
  db: Db,
  economy: string,
  queries: readonly string[],
  measureWords: RegExp,
  skip: (id: number) => boolean,
): number[] {
  const row = db.prepare('SELECT s.text, d.instrument_id FROM section s JOIN document d ON d.id = s.document_id WHERE s.id = ?');
  const best = new Map<number, number>();
  for (const query of queries) {
    for (const hit of searchLexical(db, query, { limit: CODED_SCAN, economy })) {
      const seen = best.get(hit.sectionId);
      if (seen === undefined || hit.rank < seen) best.set(hit.sectionId, hit.rank);
    }
  }
  const out: number[] = [];
  const instruments = new Set<number>();
  for (const [id] of [...best.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    if (skip(id)) continue;
    const r = row.get(id) as { text: string; instrument_id: number } | undefined;
    if (!r || instruments.has(r.instrument_id)) continue;
    if (!measureWords.test(r.text) || ictTariffCodes(r.text).length === 0) continue;
    instruments.add(r.instrument_id);
    out.push(id);
    if (out.length >= CODED_SEATS) break;
  }
  return out;
}

/** Words a pointing clause and a prescribing provision must share before one is taken for the other. */
const PRESCRIBING_MIN_OVERLAP = 3;

const NAMING = new WeakMap<Db, Map<number, number[]>>();

const OVERLAP_STOP = new Set(
  ['that', 'this', 'which', 'with', 'from', 'have', 'been', 'shall', 'must', 'under', 'other', 'such', 'than', 'into', 'upon', 'where', 'there', 'their', 'these', 'those', 'within', 'made', 'being', 'does', 'section', 'paragraph', 'subsection', 'prescribed', 'amount'],
);
function contentWords(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !OVERLAP_STOP.has(w)));
}

/**
 * The provisions that prescribe an amount a retrieved provision leaves to be prescribed, keyed by
 * the provision that points.
 *
 * A threshold is often stated in two places and read in one. Australia's Customs Act exempts from
 * entry goods "that have a value not exceeding $250 or such other amount as is prescribed", and the
 * Customs Regulation says, in full, "For subparagraph 68(1)(f)(iii) of the Act, the amount is
 * $1 000" -- which shares no word with any question a de minimis indicator can ask, and was not
 * surfaced at any depth tried. Malaysia's Sales Tax Act defines low value goods by "a prescribed
 * amount" and an order made under it says "five hundred ringgit". The pointer is found; what it
 * points at is only reachable by following it.
 *
 * Followed within the pointing instrument and to instruments made under it or naming it by title,
 * to their provisions that state an amount outright rather than as another default, ranked first
 * by whether they cite the pointing provision by its number and then by the words they share with
 * the pointing clause -- as a share of their own length, or a definitions section sharing twenty
 * words out of two thousand outranks a one-line regulation sharing eight out of twelve.
 */
export function prescribingSections(
  db: Db,
  economy: string,
  sections: readonly Pick<RetrievedSection, 'sectionId' | 'instrumentId' | 'instrumentTitle' | 'text'>[],
): Map<number, number[]> {
  const labelOf = db.prepare(`SELECT label FROM section WHERE id = ?`);
  const out = new Map<number, number[]>();
  const pointers = sections.filter((s) => LEAVES_AMOUNT.test(s.text));
  if (!pointers.length) return out;

  // Kept for the database's lifetime: the title search scans the economy's text, and every
  // indicator whose retrieval reaches the same Act would otherwise scan it again.
  let naming = NAMING.get(db);
  if (!naming) NAMING.set(db, (naming = new Map()));
  const instrumentsUnder = (instrumentId: number, title: string): number[] => {
    const known = naming!.get(instrumentId);
    if (known) return known;
    const ids = (
      db
        .prepare(
          `SELECT DISTINCT i.id FROM instrument i
            WHERE i.economy_code = ?
              AND (i.id = ? OR i.made_under_instrument_id = ?
                   OR EXISTS (SELECT 1 FROM document d JOIN section s ON s.document_id = d.id
                               WHERE d.instrument_id = i.id AND s.text LIKE ?))`,
        )
        .all(economy, instrumentId, instrumentId, `%${title.trim()}%`) as { id: number }[]
    ).map((r) => r.id);
    naming!.set(instrumentId, ids);
    return ids;
  };
  const sectionsOf = db.prepare(
    `SELECT s.id, s.text FROM section s JOIN document d ON d.id = s.document_id
      WHERE d.instrument_id = ? AND COALESCE(s.repealed, 0) = 0`,
  );

  const taken = new Set(sections.map((s) => s.sectionId));
  let total = 0;
  for (const p of pointers) {
    if (total >= PRESCRIBING_PER_CELL) break;
    // A title too short to name one instrument would name every instrument.
    if (p.instrumentTitle.trim().length < 12) continue;
    const at = p.text.search(LEAVES_AMOUNT);
    const clause = p.text.slice(Math.max(0, at - 400), at + 200);
    const words = contentWords(clause);
    // The pointing clause's own reference, where its instruments cite it by one: "68(1)(f)(iii)".
    const refs = new Set(clause.match(/\b\d+[A-Z]?(?:\(\w+\))+/g) ?? []);
    // And the pointing provision's own number, as another instrument cites it: "68(1)(f)(iii) of the Act".
    const label = ((labelOf.get(p.sectionId) as { label: string | null } | undefined)?.label ?? '').replace(/[.\s]+$/, '');
    if (/^\d+[A-Z]?$/.test(label)) refs.add(`${label}(`);

    const scored: { id: number; share: number; cites: boolean }[] = [];
    for (const instrument of instrumentsUnder(p.instrumentId, p.instrumentTitle)) {
      for (const row of sectionsOf.all(instrument) as { id: number; text: string }[]) {
        if (taken.has(row.id)) continue;
        if (!STATES_AMOUNT.test(row.text) || REPLACEABLE_FIGURE.test(row.text) || LEAVES_AMOUNT.test(row.text)) continue;
        const theirs = contentWords(row.text);
        let overlap = 0;
        for (const w of words) if (theirs.has(w)) overlap += 1;
        const cites = [...refs].some((r) => row.text.includes(r));
        if (overlap >= PRESCRIBING_MIN_OVERLAP || cites) scored.push({ id: row.id, share: overlap / Math.sqrt(theirs.size || 1), cites });
      }
    }
    scored.sort((a, b) => Number(b.cites) - Number(a.cites) || b.share - a.share);
    const chosen = scored.slice(0, Math.min(PRESCRIBING_PER_POINTER, PRESCRIBING_PER_CELL - total)).map((c) => c.id);
    for (const id of chosen) taken.add(id);
    total += chosen.length;
    if (chosen.length) out.set(p.sectionId, chosen);
  }
  return out;
}

/** The provision that prescribes an amount another leaves to be prescribed, and its own words. */
export interface PrescribedAmount {
  sectionId: number;
  instrumentId: number;
  instrumentTitle: string;
  headingPath: string;
  docUrl: string;
  anchor: string | null;
  page: number | null;
  mediaType: string | null;
  /** The words around the amount, copied out of the prescribing provision. */
  words: string;
}

/**
 * Where the amount a provision leaves to be prescribed is prescribed, or null.
 *
 * The follow at retrieval puts the prescribing provision in front of the reader, but the reader
 * reads one provision at a time, and "For subparagraph 68(1)(f)(iii) of the Act, the amount is
 * $1 000" says nothing about goods or duty on its own -- it was read, and found to apply to
 * nothing. The join is between two provisions, so it is made here, where both are in hand.
 */
export function prescribedAmount(
  db: Db,
  economy: string,
  pointer: { sectionId: number; instrumentId: number; instrumentTitle: string; text: string },
): PrescribedAmount | null {
  if (!LEAVES_AMOUNT.test(pointer.text)) return null;
  const [first] = prescribingSections(db, economy, [pointer]).get(pointer.sectionId) ?? [];
  if (first === undefined) return null;
  const row = db
    .prepare(
      `SELECT s.id, s.heading_path, s.text, s.anchor, s.page, d.url AS doc_url, d.media_type,
              i.id AS instrument_id, i.title
         FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
        WHERE s.id = ?`,
    )
    .get(first) as
    | { id: number; heading_path: string; text: string; anchor: string | null; page: number | null;
        doc_url: string; media_type: string | null; instrument_id: number; title: string }
    | undefined;
  if (!row) return null;
  const at = row.text.search(STATES_AMOUNT);
  if (at < 0) return null;
  // The sentence the amount sits in, so the words cited are the words that state it.
  const start = Math.max(row.text.lastIndexOf('.', at - 2) + 1, at - 200, 0);
  const end = row.text.slice(at).search(/[.;](?:\s|$)/);
  const words = row.text.slice(start, end < 0 ? Math.min(row.text.length, at + 120) : at + end + 1).trim();
  return {
    sectionId: row.id,
    instrumentId: row.instrument_id,
    instrumentTitle: row.title,
    headingPath: row.heading_path,
    docUrl: row.doc_url,
    anchor: row.anchor,
    page: row.page,
    mediaType: row.media_type,
    words,
  };
}
