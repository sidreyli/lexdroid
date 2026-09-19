/**
 * The corpus-wide index, and the two channels that search it.
 *
 * Corpus-wide is the load-bearing word. v1 built a semantic index per document, so answering
 * "which provisions in Singapore require local storage?" meant asking all 536 documents in turn --
 * 33,000 model calls to answer 61 questions. One index over every section of the economy answers
 * the same question with one query.
 *
 * Two channels, because they fail in opposite directions. Lexical search finds the exact phrase a
 * drafter used and misses every synonym; dense search finds the meaning and misses the term of art.
 * Their ranks are fused rather than their scores: the scores are not on the same scale and never
 * will be.
 */
import type { Db } from '../db/index.js';
import { MIN_TRIGRAM_TERM } from '../db/index.js';
import { embed, EMBEDDING_MODEL } from '../engines/ollama.js';
import { canonicalizeThai } from '../util/thai.js';

/**
 * How much of a section is embedded. Long sections exist -- a definitions section runs to
 * thousands of characters -- and embedding the whole of one dilutes it into an average of
 * everything it mentions. The cap is recorded here rather than buried, because it is a real limit
 * on recall for very long provisions.
 */
const EMBED_CHARS = 2000;
const EMBED_BATCH = 16;

/**
 * Where a hit came from.
 *
 * The two section channels are the corpus-wide index. The two instrument channels rank the
 * register before anything is fetched, and they are named separately because they answer a
 * different question over a different artefact -- a shortlist that says "found on its title"
 * against one that says "found on the heading of its section 199" are not equally good evidence,
 * and a reviewer is entitled to see which it was.
 */
export type Channel = 'lexical' | 'dense' | 'title-lexical' | 'title-dense' | 'heading-lexical' | 'heading-dense';

export interface SearchHit {
  /** A section id in the corpus index; an instrument id in the register channels. Fusion is
   *  rank-based and id-agnostic, so the same fuser serves both. */
  sectionId: number;
  score: number;
  rank: number;
  channel: Channel;
  query: string;
  /** For a heading channel, the heading that matched -- the reason, not just the rank. */
  matched?: string;
}

// ------------------------------------------------------------------------------------------
// Building the dense index
// ------------------------------------------------------------------------------------------

function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

function fromBlob(b: Buffer): Float32Array {
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
}

/** Cosine on unit vectors is a dot product; bge-m3 returns unit vectors, so normalise once here. */
function normalise(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i += 1) out[i] = v[i]! / n;
  return out;
}

export interface BuildResult {
  embedded: number;
  alreadyPresent: number;
  model: string;
  dims: number;
}

/**
 * Embed every section that does not yet have a vector from this model. Resumable by construction:
 * a build that stops halfway continues from where it left off.
 */
export async function buildDenseIndex(
  db: Db,
  opts: { model?: string; economy?: string; log?: (line: string) => void } = {},
): Promise<BuildResult> {
  const model = opts.model ?? EMBEDDING_MODEL;
  const log = opts.log ?? (() => {});

  const economyFilter = opts.economy
    ? `AND s.document_id IN (SELECT d.id FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = '${opts.economy.replace(/'/g, "''")}')`
    : '';

  const pending = db
    .prepare(
      `SELECT s.id, s.heading_path, s.text FROM section s
       WHERE NOT EXISTS (SELECT 1 FROM section_embedding e WHERE e.section_id = s.id AND e.model = ?)
       ${economyFilter}
       ORDER BY s.id`,
    )
    .all(model) as { id: number; heading_path: string; text: string }[];

  const already = (db.prepare('SELECT COUNT(*) c FROM section_embedding WHERE model = ?').get(model) as { c: number }).c;

  if (pending.length === 0) return { embedded: 0, alreadyPresent: already, model, dims: 0 };

  const insert = db.prepare(
    `INSERT INTO section_embedding (section_id, model, dims, vector) VALUES (?, ?, ?, ?)
     ON CONFLICT(section_id) DO UPDATE SET model = excluded.model, dims = excluded.dims, vector = excluded.vector`,
  );

  let dims = 0;
  let done = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    // The heading path is prefixed because a subsection reads as nonsense without it: "(2) The
    // Commission may, on the application of any organisation, exempt..." exempt from what?
    const inputs = batch.map((s) => `${s.heading_path}\n${s.text}`.slice(0, EMBED_CHARS));
    const vectors = await embed(inputs, model);
    db.transaction(() => {
      vectors.forEach((v, j) => {
        const unit = normalise(v);
        dims = unit.length;
        insert.run(batch[j]!.id, model, unit.length, toBlob(unit));
      });
    })();
    done += batch.length;
    if (done % 200 < EMBED_BATCH) log(`  ${done}/${pending.length} sections embedded`);
  }

  return { embedded: done, alreadyPresent: already, model, dims };
}

// ------------------------------------------------------------------------------------------
// Searching
// ------------------------------------------------------------------------------------------

/**
 * Scripts written without spaces between words.
 *
 * Cyrillic and Malay are deliberately absent: they space their words, so the ordinary path already
 * serves them. Chinese, Japanese and Thai do not, and that is a fact about search rather than about
 * language -- a whole Thai (or Chinese) sentence arrives as one token however long it is.
 */
const SPACELESS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;
const SPACELESS_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]+/gu;

/** Enough for any real query set, and a bound on a pathologically long one. */
const MAX_QUERY_TERMS = 96;

/**
 * One whitespace-delimited token, as terms the trigram index can actually match.
 *
 * A run of spaceless script becomes its overlapping character trigrams, which is the same unit the
 * index is built from -- so no word segmenter, no dictionary and no per-language model is involved.
 * "个人信息保护" searches as 个人信 OR 人信息 OR 信息保 OR 息保护, and a document sharing more of
 * those ranks above one sharing fewer, which is exactly how a Latin query's terms already behave.
 * Anything not in a spaceless script is returned untouched.
 */
function expand(token: string): string[] {
  if (!SPACELESS.test(token)) return [token];
  const out: string[] = [];
  let last = 0;
  for (const m of token.matchAll(SPACELESS_RUN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(token.slice(last, at));
    const run = m[0];
    if (run.length <= MIN_TRIGRAM_TERM) out.push(run);
    else for (let i = 0; i + MIN_TRIGRAM_TERM <= run.length; i += 1) out.push(run.slice(i, i + MIN_TRIGRAM_TERM));
    last = at + run.length;
  }
  if (last < token.length) out.push(token.slice(last));
  return out;
}

/**
 * Turn a phrase into an FTS5 query the trigram tokenizer can actually match.
 *
 * Five rules, all learned the hard way. Everything is a quoted phrase, because unquoted text is
 * FTS5 query syntax and a legal phrase containing OR, NOT or a hyphen is a syntax error or, worse,
 * a query that quietly means something else. Terms shorter than three characters are dropped,
 * because a trigram index cannot match them -- a two-character query returns nothing and says
 * nothing about why. A run of spaceless script is expanded into trigrams rather than left whole.
 * The phrase is NFC-normalised before any of that, because Thai (and other scripts with combining
 * marks) can represent the same visible text as different byte sequences -- a differing CMS, PDF
 * extractor or OCR engine routinely produces one form or the other, and an index built from one form
 * silently fails to match a query typed in the other unless both sides are canonicalised the same
 * way. And the split that turns the phrase into candidate terms keeps combining marks (`\p{M}`)
 * attached to the letter before them, not just letters and numbers (`\p{L}`/`\p{N}`) -- a Thai tone
 * mark or vowel sign, or a Devanagari matra, is Unicode category Mark, not Letter, and splitting on
 * "everything that is not a letter or number" tears every Thai word apart at its own diacritics
 * before `expand()` ever sees it. Verified directly: splitting "ข้อมูลส่วนบุคคล" (personal data, one
 * word with three internal tone/vowel marks) on `[^\p{L}\p{N}]+` produces five fragments, three of
 * them one or two characters and dropped by the length filter -- only 5 of the word's 15 code points
 * survive. Splitting on `[^\p{L}\p{N}\p{M}]+` instead keeps the whole word intact.
 *
 * The spaceless-script rule is the query-side half of a bug whose index-side half was already fixed.
 * The trigram tokenizer means Thai and Chinese are stored and searchable; splitting a query on
 * whitespace means a Thai question still arrived as one enormous term, which FTS5 can satisfy only
 * by finding that entire string contiguously. The index worked and the search returned nothing --
 * the same silent failure as v1's Latin-only tokenizer, one stage later in the pipeline.
 */
export function ftsQuery(phrase: string): string | null {
  const terms = [
    ...new Set(
      canonicalizeThai(phrase.normalize('NFC'))
        .toLowerCase()
        .split(/[^\p{L}\p{N}\p{M}]+/u)
        .flatMap(expand)
        .filter((t) => t.length >= MIN_TRIGRAM_TERM),
    ),
  ].slice(0, MAX_QUERY_TERMS);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
}

/** As a phrase rather than as loose terms: for a term of art like "personal data". */
export function ftsPhrase(phrase: string): string | null {
  const cleaned = canonicalizeThai(phrase.normalize('NFC'))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.replace(/\s/g, '').length < MIN_TRIGRAM_TERM) return null;
  return `"${cleaned}"`;
}

export function searchLexical(
  db: Db,
  query: string,
  opts: { limit?: number; economy?: string; phrase?: boolean } = {},
): SearchHit[] {
  const q = opts.phrase ? ftsPhrase(query) : ftsQuery(query);
  if (!q) return [];
  const limit = opts.limit ?? 50;

  // The economy filter is a WHERE clause and not a JOIN condition on purpose: a placeholder in a
  // JOIN binds before the one in WHERE, which silently swapped the query with the economy code and
  // made every lexical search return nothing. Keeping every placeholder in one clause, in order,
  // is what stops that from being possible.
  const economyClause = opts.economy
    ? `AND s.document_id IN (SELECT d.id FROM document d JOIN instrument i ON i.id = d.instrument_id
         WHERE i.economy_code = ?)`
    : '';
  const params: unknown[] = [q];
  if (opts.economy) params.push(opts.economy);
  params.push(limit);

  const rows = db
    .prepare(
      `SELECT f.rowid AS section_id, bm25(section_fts, 1.0, 0.5) AS score
       FROM section_fts f
       JOIN section s ON s.id = f.rowid
       WHERE section_fts MATCH ?
       ${economyClause}
       ORDER BY score
       LIMIT ?`,
    )
    .all(...params) as { section_id: number; score: number }[];

  // bm25() is negative and better when more negative; flip it so every channel scores upward.
  return rows.map((r, i) => ({ sectionId: r.section_id, score: -r.score, rank: i + 1, channel: 'lexical' as const, query }));
}

export interface LoadedVectors {
  ids: Int32Array;
  matrix: Float32Array;
  dims: number;
}

/** The dense index in memory. 25,000 sections at 1024 dims is 100 MB and one pass is milliseconds. */
export function loadVectors(db: Db, opts: { model?: string; economy?: string } = {}): LoadedVectors {
  const model = opts.model ?? EMBEDDING_MODEL;
  const economyFilter = opts.economy
    ? `AND e.section_id IN (SELECT s.id FROM section s JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?)`
    : '';
  const params: unknown[] = [model];
  if (opts.economy) params.push(opts.economy);

  const rows = db
    .prepare(`SELECT section_id, dims, vector FROM section_embedding e WHERE e.model = ? ${economyFilter} ORDER BY section_id`)
    .all(...params) as { section_id: number; dims: number; vector: Buffer }[];

  if (rows.length === 0) return { ids: new Int32Array(0), matrix: new Float32Array(0), dims: 0 };
  const dims = rows[0]!.dims;
  const matrix = new Float32Array(rows.length * dims);
  const ids = new Int32Array(rows.length);
  // Every vector is checked, not only the first. The matrix is sized from the first row, so a
  // shorter blob used to leave zeros that score as a match to nothing, a longer one to spill into
  // its neighbour's row, and a NaN to poison every similarity it touched -- silently, in the
  // ranking a zero is later reported against. A corrupt index is a failure to say out loud.
  rows.forEach((r, i) => {
    if (r.dims !== dims || r.vector.length !== dims * 4) {
      throw new Error(
        `section ${r.section_id}'s ${model} vector is ${r.dims} dims in ${r.vector.length} bytes, where the index is ${dims} dims; re-embed before searching`,
      );
    }
    const v = fromBlob(r.vector);
    for (let k = 0; k < v.length; k++) {
      if (!Number.isFinite(v[k]!)) throw new Error(`section ${r.section_id}'s ${model} vector holds a non-finite value; re-embed before searching`);
    }
    ids[i] = r.section_id;
    matrix.set(v, i * dims);
  });
  return { ids, matrix, dims };
}

export async function searchDense(
  query: string,
  vectors: LoadedVectors,
  opts: { limit?: number; model?: string } = {},
): Promise<SearchHit[]> {
  if (vectors.ids.length === 0) return [];
  const limit = opts.limit ?? 50;
  const [raw] = await embed([query], opts.model ?? EMBEDDING_MODEL);
  const q = normalise(raw!);
  if (q.length !== vectors.dims) {
    throw new Error(`the query embedded to ${q.length} dimensions but the index holds ${vectors.dims}. Rebuild the index after changing model.`);
  }

  const scored: { sectionId: number; score: number }[] = [];
  for (let i = 0; i < vectors.ids.length; i += 1) {
    let dot = 0;
    const base = i * vectors.dims;
    for (let d = 0; d < vectors.dims; d += 1) dot += q[d]! * vectors.matrix[base + d]!;
    scored.push({ sectionId: vectors.ids[i]!, score: dot });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s, i) => ({ ...s, rank: i + 1, channel: 'dense' as const, query }));
}

/**
 * Reciprocal rank fusion. Ranks, not scores: bm25 and cosine are not comparable and any weighting
 * of them is a number somebody made up. A section both channels rank highly beats one that either
 * ranks first alone, which is the behaviour we want -- agreement between a phrase match and a
 * meaning match is the strongest signal Zone 1 has.
 */
export function fuse(runs: SearchHit[][], k = 60): { sectionId: number; score: number; channels: string[] }[] {
  const acc = new Map<number, { score: number; channels: Set<string> }>();
  for (const run of runs) {
    for (const hit of run) {
      const cur = acc.get(hit.sectionId) ?? { score: 0, channels: new Set<string>() };
      cur.score += 1 / (k + hit.rank);
      cur.channels.add(hit.channel);
      acc.set(hit.sectionId, cur);
    }
  }
  return [...acc.entries()]
    .map(([sectionId, v]) => ({ sectionId, score: v.score, channels: [...v.channels].sort() }))
    .sort((a, b) => b.score - a.score);
}
