/**
 * Which instruments is this question about, decided before any of them are fetched.
 *
 * The register knows the title, kind, official number and portal of every instrument in an economy
 * without reading one of them -- 6,365 for Singapore, from fourteen requests. This stage ranks that
 * register against a cell's query set and says which documents are worth the cost of retrieving.
 *
 * Why this exists rather than "fetch everything, then search it":
 *
 *   - It is the same argument the architecture makes about the read stage, one stage earlier.
 *     Asking every section "are you about anything?" returns everything, forever; fetching every
 *     instrument in order to find the six a question turns on is that mistake applied to bandwidth.
 *     Singapore's Acts are 1,048 requests and its subsidiary legislation 11,682 more.
 *   - It is the only version that works in the live hour. An economy nobody has touched cannot have
 *     its statute book downloaded first, and Singapore Statutes Online will not serve one anyway:
 *     measured 6 September 2026, its firewall starts refusing sustained crawling well inside the
 *     six-second delay its own robots.txt invites.
 *   - It generalises. Nothing here knows anything about Singapore.
 *
 * What it is not: a filter on evidence. It decides fetch order and fetch scope, both of which are
 * recorded per cell with the ranks that produced them. A title-based shortlist can miss an
 * instrument whose title does not disclose its subject -- that is a real recall risk, it is stated
 * here rather than hidden, and it is mitigated three ways: the match is semantic rather than
 * keyword, the depth is generous, and an instrument that later proves relevant is fetched then. The
 * thing we must never do is drop a document quietly and let a cell report no restriction because of
 * it.
 */
import type { Db } from '../db/index.js';
import { embed, embedQueries, EMBEDDING_MODEL } from '../engines/ollama.js';
import { ftsQuery, fuse, type SearchHit } from '../index/index.js';

const EMBED_BATCH = 32;

/**
 * Titles are short, so batches can be large and the whole register embeds in one pass. Singapore's
 * 6,365 instruments cost one local model run and no network requests at all.
 */
export interface InstrumentCandidate {
  instrumentId: number;
  title: string;
  kind: string;
  officialNumber: string | null;
  sourceUrl: string;
  /** Whether the document behind it has already been fetched and parsed. */
  read: boolean;
  rank: number;
  channels: string[];
  /**
   * The headings that put it here, best first.
   *
   * A shortlist that says only "rank 3" cannot be argued with. One that says "rank 3, because its
   * section 199 is headed Accounting records" can be checked against the Act in a second, and
   * checked *before* anything is fetched -- which is the only point at which a wrong shortlist is
   * cheap to notice.
   */
  matchedHeadings: string[];
}

function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

/**
 * What a channel reads off the register, read once per process rather than once per question.
 *
 * A cell asks thirty-odd questions and a pillar sweep a thousand, and every channel used to fetch
 * and decode its whole slice of the register for each one: every title lower-cased, every table of
 * contents JSON-parsed, every vector copied out of its row. On Russia that was about 1.5 s a
 * question on the laptop while the rented GPU that answers the embedding sat at 0%, measured
 * 27 September. The scan over what is loaded still happens per question; only the loading is kept.
 *
 * Kept only while it is still true. The stamp is a count, a largest id and a size over the same
 * rows, so a title registered, renamed or re-kinded, a table of contents recorded, or a vector
 * embedded mid-process makes the next question load afresh.
 */
const loaded = new WeakMap<Db, Map<string, { stamp: string; value: unknown }>>();

function onceLoaded<T>(db: Db, key: string, stamp: string, load: () => T): T {
  let byKey = loaded.get(db);
  if (!byKey) loaded.set(db, (byKey = new Map()));
  const held = byKey.get(key);
  if (held && held.stamp === stamp) return held.value as T;
  const value = load();
  byKey.set(key, { stamp, value });
  return value;
}

function stampOf(db: Db, sql: string, params: unknown[]): string {
  return Object.values(db.prepare(sql).get(...params) as Record<string, unknown>).join(':');
}

function normalise(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(v.length);
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i += 1) out[i] = v[i]! / norm;
  return out;
}

/**
 * How much of an instrument's own table of contents is embedded beside its name.
 *
 * The shortlist already reads headings: two of its four channels are built on them, one lexical
 * over the stored contents list and one dense over their embeddings, and both are fused with the
 * two title channels. This does not add headings to a ranking that had none. What it adds is the
 * headings to the *instrument's own vector*, which carries the title, the kind and the number and
 * nothing else.
 *
 * The difference is what each channel is a claim about. A heading channel scores an instrument by
 * its single best-matching heading, deliberately and for the reason given where it is written: an
 * Act is relevant because one Part is on point, not because most of it is. But a best-of score
 * rises with how many headings there are to take a best of, and the instruments these queries
 * reach are long. Meanwhile the title channels, which do rank the instrument as a whole, see only
 * the drafter's shorthand -- and where every candidate Act opens with the same sector word, a
 * title is the one thing that cannot tell them apart.
 *
 * Measured on one economy's telecommunications shortlist, where all fifteen contenders begin
 * with the sector's name: the Act whose second Part is headed for the authority's
 * establishment, functions and powers came sixth, below an Act with barely half as many headings
 * as its own eighty-seven. It took none of the three governing seats, so the seats that exist to
 * rescue a provision one query found and the others did not were never offered to it, and the
 * section reading "the Authority is established by this section" was surfaced by no cell in any
 * run -- though it outscored the section of the same Act that was surfaced. Length is part of
 * that and not the whole of it; a shorter Act outranked it too.
 *
 * A capped list of top-level headings folded into the vector gives the instrument a
 * whole-instrument representation that does not grow with its length, which is the one thing the
 * other three channels do not have. The cap is what makes it a description rather than a
 * concatenation. The title still leads, an instrument with no parsed sections is embedded exactly
 * as before, and the heading channels are untouched: this adds a signal and removes none.
 *
 * Validated on the cell it was found in, with the governing seats widened to six because the Act
 * arrives sixth: the cell went from abstaining to answering, the answer is the right one, no other cell in the pillar moved, and the sections surfaced were identical run to run.
 * The cost is in sections read, which rose by a quarter.
 */
const HEADINGS_EMBEDDED = 24;

/** What an instrument is called, and -- where we have read it -- what it contains. */
function instrumentText(
  r: { title: string; kind: string; official_number: string | null },
  parts: readonly string[] | undefined,
): string {
  const named = `${r.title} (${r.kind}${r.official_number ? `, ${r.official_number}` : ''})`;
  return parts && parts.length ? `${named}. ${parts.join('. ')}` : named;
}

/** Each instrument's own top-level headings, in the order it set them out. */
function topLevelHeadings(db: Db, instrumentIds: readonly number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const CHUNK = 500;
  for (let i = 0; i < instrumentIds.length; i += CHUNK) {
    const slice = instrumentIds.slice(i, i + CHUNK);
    if (slice.length === 0) continue;
    const rows = db
      .prepare(
        `SELECT d.instrument_id id, s.heading_path path, MIN(s.ordinal) ord
           FROM section s JOIN document d ON d.id = s.document_id
          WHERE d.instrument_id IN (${slice.map(() => '?').join(',')})
            AND s.heading_path IS NOT NULL AND s.heading_path <> ''
          GROUP BY d.instrument_id, s.heading_path
          ORDER BY d.instrument_id, ord`,
      )
      .all(...slice) as { id: number; path: string; ord: number }[];
    for (const row of rows) {
      const top = (row.path.split(' > ')[0] ?? '').trim();
      if (!top) continue;
      const seen = out.get(row.id) ?? [];
      if (seen.length >= HEADINGS_EMBEDDED || seen.includes(top)) continue;
      seen.push(top);
      out.set(row.id, seen);
    }
  }
  return out;
}


/**
 * Embed the title of every registered instrument that does not have one yet.
 *
 * The kind is included in the embedded text because "Act" and "Regulations" carry real meaning in
 * this rubric: an obligation in an Act binds everyone, the same words in a regulator's guideline
 * bind licensees only, and the score bands turn on that difference.
 */
export async function buildInstrumentIndex(
  db: Db,
  opts: { economy?: string; model?: string; log?: (line: string) => void } = {},
): Promise<{ embedded: number; alreadyPresent: number; model: string }> {
  const model = opts.model ?? EMBEDDING_MODEL;
  const log = opts.log ?? (() => {});

  const params: unknown[] = [model];
  let economyClause = '';
  if (opts.economy) {
    economyClause = 'AND i.economy_code = ?';
    params.push(opts.economy);
  }

  const pending = db
    .prepare(
      `SELECT i.id, i.title, i.kind, i.official_number FROM instrument i
        WHERE NOT EXISTS (
          SELECT 1 FROM instrument_embedding e WHERE e.instrument_id = i.id AND e.model = ?
        )
        ${economyClause}
        ORDER BY i.id`,
    )
    .all(...params) as { id: number; title: string; kind: string; official_number: string | null }[];

  const already = (
    db.prepare('SELECT COUNT(*) c FROM instrument_embedding WHERE model = ?').get(model) as { c: number }
  ).c;

  if (pending.length === 0) return { embedded: 0, alreadyPresent: already, model };

  const insert = db.prepare(
    `INSERT INTO instrument_embedding (instrument_id, model, dims, vector) VALUES (?, ?, ?, ?)
     ON CONFLICT(instrument_id) DO UPDATE SET model = excluded.model, dims = excluded.dims,
                                              vector = excluded.vector`,
  );

  const headings = topLevelHeadings(
    db,
    pending.map((r) => r.id),
  );

  let done = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const inputs = batch.map((r) => instrumentText(r, headings.get(r.id)));
    const vectors = await embed(inputs, model);
    db.transaction(() => {
      vectors.forEach((v, j) => {
        const unit = normalise(v);
        insert.run(batch[j]!.id, model, unit.length, toBlob(unit));
      });
    })();
    done += batch.length;
    if (done % 1000 < EMBED_BATCH) log(`  ${done}/${pending.length} titles embedded`);
  }

  return { embedded: done, alreadyPresent: already, model };
}

// ------------------------------------------------------------------------------------------
// Ranking the register against a question
// ------------------------------------------------------------------------------------------

/**
 * Term matching over titles, weighted by how rare each term is.
 *
 * Without the weighting this channel is worse than useless: "law" appears in a large fraction of
 * Singapore's titles, so a query about cybersecurity frameworks returned the Application of English
 * Law Act 1993 and the Civil Law Act 1909 ahead of the Cybersecurity Act 2018. Inverse document
 * frequency fixes that without a hand-tuned stopword list -- a term that matches half the register
 * carries almost no information and is scored accordingly, in any language.
 */
function titleLexical(
  db: Db,
  query: string,
  economy: string,
  limit: number,
  kind?: string,
): SearchHit[] {
  const q = ftsQuery(query);
  if (!q) return [];
  const terms = [
    ...new Set(
      q
        .split(/\s+/)
        .map((t) => t.replace(/^"|"$/g, '').toLowerCase())
        .filter((t) => t.length >= 3),
    ),
  ];
  if (!terms.length) return [];

  // The register is thousands of rows, not millions, so a scan costs nothing and avoids a second
  // index that could drift out of step with the section index.
  const params = kind ? [economy, kind] : [economy];
  const where = `economy_code = ?${kind ? ' AND kind = ?' : ''}`;
  const lower = onceLoaded(
    db,
    `title-lexical/${economy}/${kind ?? ''}`,
    stampOf(db, `SELECT COUNT(*) n, MAX(id) top, SUM(LENGTH(title)) size FROM instrument WHERE ${where}`, params),
    () =>
      (db.prepare(`SELECT id, title FROM instrument WHERE ${where} ORDER BY id`).all(...params) as { id: number; title: string }[])
        .map((r) => ({ id: r.id, t: r.title.toLowerCase() })),
  );
  if (!lower.length) return [];
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = lower.reduce((n, r) => n + (r.t.includes(term) ? 1 : 0), 0);
    idf.set(term, df === 0 ? 0 : Math.log(1 + lower.length / df));
  }

  const scored = lower
    .map((r) => ({
      id: r.id,
      score: terms.reduce((a, term) => a + (r.t.includes(term) ? idf.get(term)! : 0), 0),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((r, i) => ({
    sectionId: r.id, // the fuser is rank-based and id-agnostic; here the id is an instrument
    score: r.score,
    rank: i + 1,
    channel: 'title-lexical' as const,
    query,
  }));
}

/**
 * The register ranked on what its instruments contain, not on what they are called.
 *
 * This exists because titles were measured and found empty. On Singapore pillars 6 and 7, title
 * ranking surfaced only half of the relevant instruments in a list of 100;
 * the Companies Act, Income Tax Act, Employment Act, Banking Act and Criminal Procedure Code sat
 * past rank 200, and restricting the search to Acts alone did not move them. "Companies Act 1967"
 * contains no word about keeping records. Its section 199 is headed "Accounting records".
 *
 * An instrument's place is its single best heading's place. Not an average: an Act is relevant
 * because of the two provisions that answer the question, and averaging them against four hundred
 * that do not is how the Companies Act came to rank below the Maintenance of Parents Act.
 */
async function headingDense(
  db: Db,
  query: string,
  economy: string,
  limit: number,
  model: string,
  kind?: string,
): Promise<SearchHit[]> {
  const params = kind ? [economy, model, kind] : [economy, model];
  const from = `FROM heading_embedding h JOIN instrument i ON i.id = h.instrument_id
        WHERE i.economy_code = ? AND h.model = ?${kind ? ' AND i.kind = ?' : ''}`;
  const rows = onceLoaded(
    db,
    `heading-dense/${economy}/${model}/${kind ?? ''}`,
    stampOf(db, `SELECT COUNT(*) n, MAX(h.id) top ${from}`, params),
    () =>
      (db.prepare(`SELECT h.instrument_id id, h.heading, h.vector ${from}`).all(...params) as {
        id: number;
        heading: string;
        vector: Buffer;
      }[]).map((r) => ({
        id: r.id,
        heading: r.heading,
        v: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4),
      })),
  );
  if (!rows.length) return [];

  const [qv] = await embedQueries([query], model);
  if (!qv) return [];
  const q = normalise(qv);

  const best = new Map<number, { score: number; heading: string }>();
  for (const r of rows) {
    const v = r.v;
    let dot = 0;
    for (let i = 0; i < q.length && i < v.length; i += 1) dot += q[i]! * v[i]!;
    const cur = best.get(r.id);
    if (!cur || dot > cur.score) best.set(r.id, { score: dot, heading: r.heading });
  }

  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([id, v], i) => ({
      sectionId: id,
      score: v.score,
      rank: i + 1,
      channel: 'heading-dense' as const,
      query,
      matched: v.heading,
    }));
}

/** The same over headings by term, weighted the same way titles are, for the same reason. */
function headingLexical(
  db: Db,
  query: string,
  economy: string,
  limit: number,
  kind?: string,
): SearchHit[] {
  const q = ftsQuery(query);
  if (!q) return [];
  const terms = [
    ...new Set(
      q
        .split(/\s+/)
        .map((t) => t.replace(/^"|"$/g, '').toLowerCase())
        .filter((t) => t.length >= 3),
    ),
  ];
  if (!terms.length) return [];

  const params = kind ? [economy, kind] : [economy];
  const from = `FROM instrument_contents c JOIN instrument i ON i.id = c.instrument_id
        WHERE i.economy_code = ?${kind ? ' AND i.kind = ?' : ''}`;
  // Document frequency over instruments, not over headings: a term appearing in forty headings of
  // one Act says that Act is about it, and should not be discounted as if it were everywhere.
  const parsed = onceLoaded(
    db,
    `heading-lexical/${economy}/${kind ?? ''}`,
    stampOf(db, `SELECT COUNT(*) n, MAX(c.instrument_id) top, SUM(c.heading_count) size, MAX(c.fetched_at) at ${from}`, params),
    () =>
      (db.prepare(`SELECT c.instrument_id id, c.headings ${from}`).all(...params) as { id: number; headings: string }[])
        .map((r) => ({ id: r.id, hs: (JSON.parse(r.headings) as string[]).map((h) => h.toLowerCase()) })),
  );
  if (!parsed.length) return [];
  const idf = new Map<string, number>();
  for (const term of terms) {
    const df = parsed.reduce((n, r) => n + (r.hs.some((h) => h.includes(term)) ? 1 : 0), 0);
    idf.set(term, df === 0 ? 0 : Math.log(1 + parsed.length / df));
  }

  const scored: { id: number; score: number; matched: string }[] = [];
  for (const r of parsed) {
    let best = 0;
    let heading = '';
    for (const h of r.hs) {
      const s = terms.reduce((a, t) => a + (h.includes(t) ? idf.get(t)! : 0), 0);
      if (s > best) {
        best = s;
        heading = h;
      }
    }
    if (best > 0) scored.push({ id: r.id, score: best, matched: heading });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r, i) => ({
      sectionId: r.id,
      score: r.score,
      rank: i + 1,
      channel: 'heading-lexical' as const,
      query,
      matched: r.matched,
    }));
}

async function titleDense(
  db: Db,
  query: string,
  economy: string,
  limit: number,
  model: string,
  kind?: string,
): Promise<SearchHit[]> {
  // The kind filter belongs in the query, not after it. Applied afterwards it spends the whole
  // retrieval depth on subsidiary legislation -- 5,841 of Singapore's 6,365 instruments -- and then
  // discards nearly all of it, so a search restricted to Acts came back with two candidates.
  const params = kind ? [economy, model, kind] : [economy, model];
  const from = `FROM instrument_embedding e JOIN instrument i ON i.id = e.instrument_id
       WHERE i.economy_code = ? AND e.model = ?${kind ? ' AND i.kind = ?' : ''}`;
  const rows = onceLoaded(
    db,
    `title-dense/${economy}/${model}/${kind ?? ''}`,
    stampOf(db, `SELECT COUNT(*) n, MAX(e.instrument_id) top ${from}`, params),
    () =>
      (db.prepare(`SELECT e.instrument_id id, e.vector ${from}`).all(...params) as { id: number; vector: Buffer }[])
        .map((r) => ({ id: r.id, v: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4) })),
  );
  if (!rows.length) return [];

  const [qv] = await embedQueries([query], model);
  if (!qv) return [];
  const q = normalise(qv);

  const scored = rows.map((r) => {
    const v = r.v;
    let dot = 0;
    for (let i = 0; i < q.length && i < v.length; i += 1) dot += q[i]! * v[i]!;
    return { id: r.id, score: dot };
  });
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((r, i) => ({
    sectionId: r.id,
    score: r.score,
    rank: i + 1,
    channel: 'title-dense' as const,
    query,
  }));
}

/**
 * Rank an economy's registered instruments against one or more queries.
 *
 * Both channels for the same reason they are both used over sections: a title search for "cross
 * border data transfer" will not match "Personal Data Protection Act" on words, and a title search
 * for "Banking Act" should not be beaten by something merely about finance.
 */
export async function shortlistInstruments(
  db: Db,
  opts: {
    economy: string;
    queries: string[];
    limit?: number;
    depthPerQuery?: number;
    kind?: string;
    model?: string;
    /** Set false to rank on titles alone. Used to measure what the contents index is worth. */
    contents?: boolean;
    /** Share of the list held for Acts. Measured at 0.5; set 0 to rank the register as one pool. */
    primaryShare?: number;
  },
): Promise<InstrumentCandidate[]> {
  const model = opts.model ?? EMBEDDING_MODEL;
  const limit = opts.limit ?? 25;
  const depth = opts.depthPerQuery ?? 40;
  const primaryShare = opts.primaryShare ?? 0.5;

  // Each query in each channel is its own run. Reciprocal rank fusion combines ranks, so a run
  // must keep its own ranking -- flattening them first would make rank 1 of a weak query
  // indistinguishable from rank 1 of a strong one.
  const runs: SearchHit[][] = [];
  // Every question embedded in one request, so the loop below reads each vector locally -- where
  // there is anything to compare them with. A register with no vectors for this model never asked
  // the model anything, and must not start now.
  const hasVectors = db
    .prepare(
      `SELECT 1 FROM instrument i WHERE i.economy_code = ? AND (
         EXISTS (SELECT 1 FROM instrument_embedding e WHERE e.instrument_id = i.id AND e.model = ?)
         OR EXISTS (SELECT 1 FROM heading_embedding h WHERE h.instrument_id = i.id AND h.model = ?)) LIMIT 1`,
    )
    .get(opts.economy, model, model);
  if (hasVectors) await embedQueries(opts.queries, model);
  for (const query of opts.queries) {
    const lex = titleLexical(db, query, opts.economy, depth, opts.kind);
    if (lex.length) runs.push(lex);
    const dense = await titleDense(db, query, opts.economy, depth, model, opts.kind);
    if (dense.length) runs.push(dense);

    // The contents channels, where an instrument has contents. Scores are averaged over the
    // channels that could have found an instrument, not summed -- see normalising below.
    if (opts.contents !== false) {
      const hLex = headingLexical(db, query, opts.economy, depth, opts.kind);
      if (hLex.length) runs.push(hLex);
      const hDense = await headingDense(db, query, opts.economy, depth, model, opts.kind);
      if (hDense.length) runs.push(hDense);
    }
  }
  if (!runs.length) return [];

  // The heading that put each instrument on the list, kept from before fusion. Fusion is
  // rank-based and drops the reason, and the reason is the part a reviewer can check.
  const reasons = new Map<number, { rank: number; heading: string }[]>();
  for (const run of runs) {
    for (const hit of run) {
      if (!hit.matched) continue;
      const list = reasons.get(hit.sectionId) ?? [];
      list.push({ rank: hit.rank, heading: hit.matched });
      reasons.set(hit.sectionId, list);
    }
  }

  // Reciprocal rank fusion adds a vote per run, so an instrument carrying contents can score in
  // twice as many runs as one without. Contents exist almost only for instruments already read, so
  // summing hands "already read" a two-to-one advantage unrelated to relevance -- measured at nought
  // unread instruments in the shortlist for all three economies. Averaging over the runs that could
  // have found it lets a title compete at full strength.
  const hasContents = new Set(
    (
      db
        .prepare(
          `SELECT c.instrument_id id FROM instrument_contents c
             JOIN instrument i ON i.id = c.instrument_id
            WHERE i.economy_code = ?`,
        )
        .all(opts.economy) as { id: number }[]
    ).map((r) => r.id),
  );
  const titleRuns = runs.filter((r) => r[0] && !r[0].channel.startsWith('heading')).length;
  const headingRuns = runs.length - titleRuns;

  const fused = fuse(runs)
    .map((h) => {
      const eligible = hasContents.has(h.sectionId) ? titleRuns + headingRuns : titleRuns;
      return { ...h, score: eligible > 0 ? h.score / eligible : h.score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);

  const byId = db.prepare(
    `SELECT i.id, i.title, i.kind, i.official_number, i.source_url,
            -- Read means there is text to examine. A document stored as unread -- an empty scan, a
            -- landing page, a consultation -- is a document, and counting it made 142 instruments
            -- with nothing in them eligible to be examined as a framework.
            EXISTS (SELECT 1 FROM document d JOIN section s ON s.document_id = d.id
                     WHERE d.instrument_id = i.id) AS read
       FROM instrument i WHERE i.id = ?`,
  );

  const pool: InstrumentCandidate[] = [];
  for (const hit of fused) {
    const row = byId.get(hit.sectionId) as
      | { id: number; title: string; kind: string; official_number: string | null; source_url: string; read: number }
      | undefined;
    if (!row) continue;
    if (opts.kind && row.kind !== opts.kind) continue;
    pool.push({
      instrumentId: row.id,
      title: row.title,
      kind: row.kind,
      officialNumber: row.official_number,
      sourceUrl: row.source_url,
      read: row.read === 1,
      rank: 0,
      channels: hit.channels ?? [],
      matchedHeadings: [
        ...new Set(
          (reasons.get(row.id) ?? [])
            .sort((a, b) => a.rank - b.rank)
            .map((r) => r.heading),
        ),
      ].slice(0, 3),
    });
    if (pool.length >= limit) break;
  }

  // A share of the list held for primary legislation. An Act and a notification made under it are
  // not interchangeable candidates, and a register of 23,693 regulations buries 1,264 Acts.
  //
  // Filled by ranking the Acts on their own rather than by picking them out of the open list: the
  // channels are depth-limited, so an Act that 5,841 subsidiary instruments push past the depth is
  // not there to be picked. Holding half the list this way raised recall at depth 40 for Australia,
  // Singapore and Malaysia alike.
  const wanted = Math.floor(limit * primaryShare);
  const primary =
    wanted > 0 && !opts.kind
      ? await shortlistInstruments(db, { ...opts, limit: wanted, kind: 'act', primaryShare: 0 })
      : [];

  const out: InstrumentCandidate[] = [];
  const taken = new Set(primary.map((c) => c.instrumentId));
  for (const c of [...primary, ...pool.filter((c) => !taken.has(c.instrumentId))]) {
    if (out.length >= limit) break;
    out.push({ ...c, rank: out.length + 1 });
  }
  return out;
}
