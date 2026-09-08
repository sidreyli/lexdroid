/**
 * The table of contents, as the unit discovery ranks on.
 *
 * Discovery ranked instrument titles, and on 7 September 2026 that was measured against ESCAP's
 * own citations for Singapore pillars 6 and 7: 23 cited instruments, 14 of them in our register,
 * 7 surfaced anywhere in the top 100. The Companies Act, Income Tax Act, Employment Act, Banking
 * Act and Criminal Procedure Code were all registered, all cited, and all below rank 200.
 *
 * The first instinct was that Acts were being drowned -- the register is 524 Acts against 5,841
 * pieces of subsidiary legislation, and regulations took 194 of the top 200. That is true and it
 * is not the cause. Restricted to Acts alone, the Companies Act was still below rank 100 for a
 * retention question, behind the Consumer Protection (Trade Descriptions and Safety Requirements)
 * Act and the Maintenance of Parents Act, which match on the word "Protection" and "Requirements"
 * and on nothing else. No weighting recovers it, because "Companies Act 1967" says nothing about
 * keeping records. The information is absent, not mis-scored.
 *
 * It is present one level down. Measured over the same corpus, ranking on headings instead:
 *
 *   a duty to keep data for at least some period   ->  Cybersecurity Act 29 Duty to keep records,
 *                                                      Income Tax Act 68A Duty to collect and
 *                                                      retain information, Companies Act 386AH
 *   a power for a public authority to obtain data  ->  Carbon Pricing Act 49 Power to require
 *                                                      persons to provide information,
 *                                                      Telecommunications Act 78, Companies Act 244
 *
 * Companies Act: rank 3 for retention, having been past 200. The heading is where a statute says
 * what a provision is about, and it is the cheapest place that says it.
 *
 * Why this is affordable: a table of contents is one request, and it is the *same* request that
 * reading the document starts with -- the landing page. Fetching contents pre-pays the first fetch
 * of every instrument later read, so nothing is spent twice.
 *
 * Why Acts and not everything: the generality that makes an Act's title uninformative is exactly
 * what makes its contents necessary. Subsidiary legislation is named after the narrow thing it
 * does -- "Personal Data Protection (Do Not Call Registry) Regulations 2013" -- so its title is
 * already a contents page. The rule is about generality, not about a portal.
 */
import * as cheerio from 'cheerio';
import type { Db } from '../db/index.js';
import { embed, EMBEDDING_MODEL } from '../engines/ollama.js';
import { CacheMiss, HostSuspended, RobotsDisallowed, SoftBlocked, TransportFault, type Fetcher } from '../fetch/index.js';

/** The words a drafter opens a container with, and how deep each one sits. */
const CONTAINER_LEVEL: Record<string, number> = {
  chapter: 1, part: 2, division: 3, subdivision: 4, schedule: 1,
};

/** Headings shorter than this say nothing a search can use. "(2)" is not a subject. */
const MIN_HEADING_CHARS = 4;

/**
 * The contents are not truncated.
 *
 * There was a cap of 400 here and it was wrong within a minute of being written. The Criminal
 * Procedure Code 2010 lists more than 400 provisions, and section 39 -- "Access to computer", the
 * provision indicator 7.5 turns on -- sits past that line. A cap on the contents is a cap on what
 * discovery can ever find, applied before anyone has asked a question, and it fails silently and
 * exactly where a long Act is involved. Long Acts are the general ones, which is why they are the
 * ones cited.
 *
 * The cost of not capping is embedding a few hundred more short strings per Act, locally, once.
 */

const EMBED_BATCH = 64;

export interface ExtractedContents {
  headings: string[];
  extractor: string;
}

/**
 * The contents of a Singapore Statutes Online document.
 *
 * SSO's landing page carries the full contents whether or not it serves the provisions, which is
 * why one request is enough. The markup interleaves Part headings with the provisions under them,
 * so a document-order walk of both reconstructs "Part VI > 199 Accounting records" -- and the Part
 * is worth keeping, because "PROTECTION OF PERSONAL DATA" over a section headed "Compliance" is
 * the only place the subject appears.
 */
function ssoContents(html: string): ExtractedContents {
  const $ = cheerio.load(html);
  const headings: string[] = [];
  let part = '';

  $('p.HeadingParagraph, input.childID[name="item"]').each((_i, el) => {
    const $el = $(el);
    if ($el.is('p')) {
      part = $el.text().replace(/\s+/g, ' ').trim();
      return;
    }
    const label = $el.closest('div').find('label').first().text().replace(/\s+/g, ' ').trim();
    if (label.length < MIN_HEADING_CHARS) return;
    headings.push(part ? `${part} > ${label}` : label);
  });

  return { headings, extractor: 'sso' };
}

/**
 * The contents of a Federal Register of Legislation document.
 *
 * The register's compilations are served as an EPUB, and the page at the title's own address is
 * the shell around it -- which carries the whole arrangement of the Act as links into the volumes.
 * So Australia costs one request per Act for its contents, the same as Singapore, and the request
 * is not wasted: it is the first request reading that Act would make anyway.
 */
function frlContents(html: string): ExtractedContents {
  const $ = cheerio.load(html);
  const headings: string[] = [];
  const containers: string[] = [];

  $('a[href*="OEBPS"]').each((_i, el) => {
    const t = $(el).text().replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < MIN_HEADING_CHARS || t.length > 200) return;
    const level = CONTAINER_LEVEL[/^([A-Za-z]+)/.exec(t)?.[1]?.toLowerCase() ?? ''];
    if (level !== undefined) {
      containers.length = Math.min(containers.length, level - 1);
      containers[level - 1] = t;
      return;
    }
    headings.push([...containers.filter(Boolean), t].join(' > '));
  });

  return { headings, extractor: 'frl' };
}

/**
 * Any other portal's contents, from the heading elements a document uses.
 *
 * Deliberately generic: the live-test economy is one nobody has looked at, and a portal-specific
 * reader that has not been written is worth less than a crude one that runs. A page with no
 * headings yields nothing and is recorded as yielding nothing.
 */
function genericContents(html: string): ExtractedContents {
  const $ = cheerio.load(html);
  const headings: string[] = [];
  $('h1, h2, h3, h4, h5, .heading, .Heading, [class*="Heading"]').each((_i, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (t.length >= MIN_HEADING_CHARS && t.length <= 200 && !headings.includes(t)) headings.push(t);
  });
  return { headings, extractor: 'generic-html' };
}

export function extractContents(html: string, url: string): ExtractedContents {
  const chosen = /sso\.agc\.gov\.sg/i.test(url)
    ? ssoContents(html)
    : /legislation\.gov\.au/i.test(url)
      ? frlContents(html)
      : genericContents(html);
  // A portal-specific reader that came back empty is a reader that did not fit this page, not a
  // document with no headings. Falling back beats recording a silence.
  if (chosen.headings.length === 0 && chosen.extractor !== 'generic-html') {
    const fallback = genericContents(html);
    if (fallback.headings.length > 0) return fallback;
  }
  return chosen;
}

/**
 * Contents an instrument we have already parsed can supply without a request.
 *
 * A parsed document's sections carry their own heading paths, which is the same artefact arrived
 * at by a longer road. Reading them out of the store costs nothing and is exactly as good.
 */
export function contentsFromParsedSections(db: Db, instrumentId: number): string[] {
  const rows = db
    .prepare(
      `SELECT s.heading_path FROM section s JOIN document d ON d.id = s.document_id
        WHERE d.instrument_id = ? ORDER BY s.ordinal`,
    )
    .all(instrumentId) as { heading_path: string }[];
  return rows.map((r) => r.heading_path);
}

export interface ContentsProgress {
  fetched: number;
  fromParsed: number;
  skipped: number;
  failed: number;
}

export interface BuildContentsOptions {
  economy: string;
  /** Which kinds to fetch contents for. Acts by default -- see the note at the top of this file. */
  kinds?: string[];
  /** A wall-clock ceiling. The live hour is an hour, and a crawl that overruns it answers nothing. */
  budgetMs?: number;
  /** Instrument ids to do first, in this order. Everything else follows in register order. */
  priority?: number[];
  log?: (line: string) => void;
}

/**
 * Fetch and store the contents of an economy's instruments.
 *
 * Budgeted rather than exhaustive, and the budget is a first-class argument. Singapore Statutes
 * Online asks for six seconds between requests and its 524 Acts are therefore about an hour of
 * polite crawling; an economy nobody has looked at gets whatever the budget allows, in the order
 * the register suggests, and the shortfall is reported rather than hidden. A partial contents index
 * is strictly better than none: the instruments it covers are ranked on what they contain and the
 * rest fall back to their titles.
 */
export async function buildContents(
  db: Db,
  fetcher: Fetcher,
  opts: BuildContentsOptions,
): Promise<ContentsProgress> {
  const log = opts.log ?? ((): void => {});
  const kinds = opts.kinds ?? ['act'];
  const started = Date.now();
  const progress: ContentsProgress = { fetched: 0, fromParsed: 0, skipped: 0, failed: 0 };

  const pending = db
    .prepare(
      `SELECT i.id, i.title, i.source_url FROM instrument i
        WHERE i.economy_code = ?
          AND i.kind IN (${kinds.map(() => '?').join(',')})
          AND NOT EXISTS (SELECT 1 FROM instrument_contents c WHERE c.instrument_id = i.id)
        ORDER BY i.id`,
    )
    .all(opts.economy, ...kinds) as { id: number; title: string; source_url: string }[];

  const order = opts.priority
    ? [
        ...opts.priority.map((id) => pending.find((p) => p.id === id)).filter((p) => p !== undefined),
        ...pending.filter((p) => !opts.priority!.includes(p.id)),
      ]
    : pending;

  const insert = db.prepare(
    `INSERT OR REPLACE INTO instrument_contents
       (instrument_id, headings, heading_count, source_url, extractor, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  log(`  ${order.length} instrument(s) without contents`);

  // Every free one first, in a sweep of its own, before a single request leaves the machine.
  //
  // A document we already parsed has told us its headings, so its contents cost nothing. Taking
  // them inside the fetch loop looked equivalent and was not: the loop walks the register in
  // order, so a free instrument sitting at position 350 waits behind 349 paid ones, and when the
  // host stops answering at position 90 it is never reached at all. That is how the Personal Data
  // Protection Act -- the most-cited instrument in two of the pillars, with 86 sections already
  // parsed and stored -- ended a full crawl with no contents and fell from rank 1 to rank 39 for
  // want of an artefact we were already holding.
  //
  // Free work must never be queued behind work that can be refused.
  const needsFetch: typeof order = [];
  for (const inst of order) {
    const parsed = contentsFromParsedSections(db, inst.id);
    if (parsed.length > 0) {
      insert.run(inst.id, JSON.stringify(parsed), parsed.length, inst.source_url, 'parsed-sections', new Date().toISOString());
      progress.fromParsed += 1;
    } else {
      needsFetch.push(inst);
    }
  }
  if (progress.fromParsed > 0) {
    log(`  ${progress.fromParsed} taken from documents already parsed, at no request`);
  }

  for (const inst of needsFetch) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) {
      progress.skipped = order.length - progress.fetched - progress.fromParsed - progress.failed;
      log(`  budget spent; ${progress.skipped} instrument(s) left without contents`);
      break;
    }

    try {
      const res = await fetcher.fetch(inst.source_url);
      const { headings, extractor } = extractContents(res.body.toString('utf8'), inst.source_url);
      insert.run(inst.id, JSON.stringify(headings), headings.length, inst.source_url, extractor, new Date().toISOString());
      progress.fetched += 1;
      if ((progress.fetched + progress.fromParsed) % 25 === 0) {
        log(`  ${progress.fetched}/${needsFetch.length} fetched (${progress.fetched + progress.fromParsed} of ${order.length} with contents)`);
      }
    } catch (err) {
      // A host that has stopped answering has stopped answering: the rest of its queue is not
      // attempted, and the shortfall is reported rather than retried into a longer refusal.
      if (err instanceof HostSuspended) {
        progress.skipped = order.length - progress.fetched - progress.fromParsed - progress.failed;
        log(`  ${err.message}`);
        break;
      }
      if (
        err instanceof RobotsDisallowed ||
        err instanceof CacheMiss ||
        err instanceof SoftBlocked ||
        err instanceof TransportFault
      ) {
        progress.failed += 1;
        continue;
      }
      throw err;
    }
  }

  return progress;
}

/**
 * Embed every stored heading that does not have a vector yet.
 *
 * The instrument's title is prefixed to each heading before embedding: the unit being indexed is
 * "this heading, in this Act", not a bare phrase with no owner. "Duty to keep records" appears in
 * five Singapore Acts and they are not interchangeable.
 */
export async function embedContents(
  db: Db,
  opts: { economy: string; model?: string; log?: (line: string) => void },
): Promise<{ embedded: number; instruments: number }> {
  const model = opts.model ?? EMBEDDING_MODEL;
  const log = opts.log ?? ((): void => {});

  const rows = db
    .prepare(
      `SELECT c.instrument_id, c.headings, i.title FROM instrument_contents c
         JOIN instrument i ON i.id = c.instrument_id
        WHERE i.economy_code = ?
          AND NOT EXISTS (
            SELECT 1 FROM heading_embedding h
             WHERE h.instrument_id = c.instrument_id AND h.model = ?
          )`,
    )
    .all(opts.economy, model) as { instrument_id: number; headings: string; title: string }[];

  if (rows.length === 0) return { embedded: 0, instruments: 0 };

  const units: { instrumentId: number; ordinal: number; heading: string; text: string }[] = [];
  for (const r of rows) {
    (JSON.parse(r.headings) as string[]).forEach((heading, ordinal) => {
      units.push({ instrumentId: r.instrument_id, ordinal, heading, text: `${r.title}: ${heading}` });
    });
  }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO heading_embedding (instrument_id, ordinal, heading, model, dims, vector)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  log(`  ${units.length} heading(s) across ${rows.length} instrument(s) to embed`);
  let done = 0;
  for (let i = 0; i < units.length; i += EMBED_BATCH) {
    const batch = units.slice(i, i + EMBED_BATCH);
    const vectors = await embed(batch.map((u) => u.text), model);
    db.transaction(() => {
      vectors.forEach((v, j) => {
        const unit = normalise(v);
        const u = batch[j]!;
        insert.run(u.instrumentId, u.ordinal, u.heading, model, unit.length, toBlob(unit));
      });
    })();
    done += batch.length;
    if (done % 2000 < EMBED_BATCH) log(`  ${done}/${units.length} headings embedded`);
  }

  return { embedded: done, instruments: rows.length };
}

function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

function normalise(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(v.length);
  let norm = 0;
  for (let i = 0; i < v.length; i += 1) norm += v[i]! * v[i]!;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i += 1) out[i] = v[i]! / norm;
  return out;
}
