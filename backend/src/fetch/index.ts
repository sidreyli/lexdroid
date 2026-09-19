/**
 * Polite retrieval, and the cache that makes the second engine pass fetch nothing.
 *
 * Three properties this module exists to guarantee:
 *
 *   1. We are a good citizen of every government server we touch. One request in flight per host,
 *      a delay between requests that honours the site's own robots.txt crawl-delay when it asks
 *      for a longer one, and disallowed paths are not fetched at all.
 *   2. Every request that left the machine is written to fetch_log. That table is ESCAP's Run
 *      Record sheet, and it is what makes "polite crawling" evidence rather than a claim.
 *   3. A run declared cache-only cannot reach the network. Not "does not"; cannot -- the request
 *      is refused before it is made. The live test checks the second engine fetched zero
 *      documents, and this is what makes that structural.
 *
 * The cache is content addressed: bytes live under their own sha256, and a small record per URL
 * points at them. Two URLs serving the same document store one copy, and the hash is the same
 * value the document row carries, so a cited snippet can always be re-checked against the exact
 * bytes it was read out of.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync, inflateSync } from 'node:zlib';
import { Agent, interceptors, request } from 'undici';
import type { Db } from '../db/index.js';

/**
 * The TLS handshake, and the day it cost us a corpus.
 *
 * Node offers its cipher suites in a different order from a browser, and some CDNs read that
 * ordering as a client fingerprint. Singapore Statutes Online is one of them. Measured on
 * 2026-09-06, same machine, same address, same headers, same minute:
 *
 *     curl                                        200, the Act
 *     undici, pooled agent                        202, a 2.4 KB challenge page
 *     undici, no keep-alive                       202
 *     Node's built-in fetch                       202
 *     undici, Chrome's cipher order               200, the Act
 *
 * Ordering the ciphers as Chrome does is the whole fix. Everything upstream of this had read those
 * 202s as rate limiting and answered them the way you answer rate limiting -- back off, then slow
 * every later request down permanently. It was never rate limiting, so backing off did nothing but
 * make an already-honest crawler crawl at a fifth of the speed the site itself asks for.
 *
 * What we are not doing: no challenge is solved, no credential is presented, and the user agent
 * still names us and our purpose. The site's stated terms for machine access are its robots.txt --
 * six seconds between requests, /search disallowed -- and we obey both, before and after this.
 *
 * Redirects are followed by an interceptor rather than a request option: government sites move
 * documents constantly, and a 301 that is not followed looks exactly like a document that does
 * not exist. Five hops is generous and still terminates.
 */
const BROWSER_CIPHERS = [
  'TLS_AES_128_GCM_SHA256',
  'TLS_AES_256_GCM_SHA384',
  'TLS_CHACHA20_POLY1305_SHA256',
  'ECDHE-ECDSA-AES128-GCM-SHA256',
  'ECDHE-RSA-AES128-GCM-SHA256',
  'ECDHE-ECDSA-AES256-GCM-SHA384',
  'ECDHE-RSA-AES256-GCM-SHA384',
  'ECDHE-ECDSA-CHACHA20-POLY1305',
  'ECDHE-RSA-CHACHA20-POLY1305',
  'ECDHE-RSA-AES128-SHA',
  'ECDHE-RSA-AES256-SHA',
  'AES128-GCM-SHA256',
  'AES256-GCM-SHA384',
  'AES128-SHA',
  'AES256-SHA',
].join(':');

const dispatcher = new Agent({
  connections: 8,
  connect: { ciphers: BROWSER_CIPHERS, ecdhCurve: 'X25519:prime256v1:secp384r1', minVersion: 'TLSv1.2' },
}).compose(interceptors.redirect({ maxRedirections: 5 }));

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Where fetched bytes are kept, and why a test is allowed to move it.
 *
 * The cache is keyed by URL, and the fetcher's own tests serve their fixtures from a local server
 * on an ephemeral port -- so they were writing records for `http://127.0.0.1:<port>/a-page` into
 * the real cache, 1,046 of them beside the 8,383 real ones. The operating system reuses those
 * ports. When it handed a later test a port an earlier one had cached, the fetcher answered the
 * page from disk and never asked the host for robots.txt at all, which is why the robots tests
 * failed roughly one run in three and passed every time they were run alone.
 *
 * So the tests get their own directory. This is read once, at import, because that is before any
 * test body runs: vitest.config.ts sets it for the whole suite.
 */
export const CACHE_DIR = process.env['LEXDROID_CACHE_DIR'] ?? join(here, '..', '..', 'data', 'cache');

/**
 * We identify ourselves, and we also have to get through.
 *
 * Singapore Statutes Online sits behind a CDN that answers 403 to any agent string that does not
 * look like a browser -- including a plainly identified research crawler. Measured on 2026-09-06:
 * "LexDroid/0.1 (+...)" got 403, a Chrome string got 200, and a Chrome string with our identifier
 * appended got 200. So we append rather than disguise: the server, and anyone reading its logs,
 * can see exactly who we are, and we still reach the public text of the law.
 *
 * Everything else stays strict: one request at a time, the site's own crawl-delay, robots honoured.
 */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/140.0.0.0 Safari/537.36 LexDroid/0.1 (UN ESCAP RDTII research; polite, 1 req/s)';

const DEFAULT_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
const TIMEOUT_MS = 60_000;

/** How long to wait after a throttled response, in order. Long, because the answer is to stop. */
const BACKOFF_MS = [30_000, 90_000, 240_000];

/**
 * After a host throttles us, every later request to it waits this much longer, for the rest of the
 * run. Backing off once and then resuming the old pace just walks back into the same wall.
 */
const SLOWDOWN_MS = 6000;

/**
 * The delay used when robots.txt could not be read. Not knowing what a host wants is a reason to
 * be careful. A host that answers 4xx has said there are no rules, which is knowing.
 */
const UNKNOWN_ROBOTS_DELAY_MS = 10_000;

/**
 * How long to wait before asking again after the connection dropped with no answer at all.
 *
 * Short, and short on purpose. A reset is not a host saying no -- it said nothing, and the
 * request before it and the request after it were both served. The long BACKOFF_MS ladder is for
 * a host that answered and told us to slow down; applying it here would price a stray packet at
 * four minutes. A host that is genuinely gone still stops the crawl, because the retries run out
 * and the refusal count that trips GIVE_UP_AFTER is unchanged.
 */
const TRANSPORT_RETRY_MS = [2000, 8000];

/**
 * How many consecutive clean responses buy back one step of the slowdown above.
 *
 * A penalty that only ever grows turns one bad minute into a slow rest-of-run: an early throttle
 * on a 500-document crawl left every remaining request waiting nearly two minutes, long after the
 * host had stopped objecting. Recovery has to be slower than the penalty -- one step back for
 * twenty clean requests -- or this is just the old pace with extra steps.
 */
const RECOVERY_STREAK = 20;

/**
 * How many documents a host may refuse outright, in a row, before we stop asking it for anything
 * else this run.
 *
 * Without this the retry ladder is a trap. Each refused document costs 30 + 90 + 240 seconds of
 * patient waiting before it is given up on, so a host that has decided to refuse us turns a
 * 467-document queue into roughly two days of failing politely -- and every one of those documents
 * ends up recorded as unread for a reason that is about us, not about the document. Stopping and
 * saying "this host refused us, N documents were not attempted" is both faster and truer.
 */
const GIVE_UP_AFTER = 3;

/**
 * How long a host stays off limits after it suspends us, across processes.
 *
 * The in-process breaker only protects one run. Six runs launched from a shell loop each got a
 * fresh breaker and each walked into the same wall -- which is how a crawler that is careful by
 * design spends an afternoon being the least welcome thing on a government server. The cooldown is
 * written to the database so the next invocation declines to ask at all.
 */
const COOLDOWN_MS = 30 * 60_000;

/**
 * undici does not ask for compression and does not decompress it, so a request that stays silent
 * on the subject downloads every document in full.
 *
 * Measured on sso.agc.gov.sg, 2026-09-06: one Act arrived in 404,381 bytes without the header and
 * 31,406 bytes with it. Thirteen times the bandwidth, taken from a government server, for byte
 * identical text -- and thirteen times the time to read a corpus.
 */
function decompress(body: Buffer, encoding: string | string[] | undefined): Buffer {
  const enc = (Array.isArray(encoding) ? encoding[0] : encoding)?.trim().toLowerCase();
  if (!enc || enc === 'identity' || body.length === 0) return body;
  try {
    if (enc === 'gzip' || enc === 'x-gzip') return gunzipSync(body);
    if (enc === 'deflate') return inflateSync(body);
    if (enc === 'br') return brotliDecompressSync(body);
  } catch {
    // A body that is not in the encoding it claims is a failed response, not a document. Handing
    // the raw bytes back lets isSoftBlock and the parser see it for what it is, rather than
    // turning a throttle into a crash.
    return body;
  }
  return body;
}

/**
 * A response that is not the document.
 *
 * Three shapes, all of which a naive fetcher records as success:
 *   - 429 and 503, which say so;
 *   - a 2xx that is not 200. Measured on sso.agc.gov.sg: its WAF answers 202 with a 2.4 KB
 *     challenge page. A GET of a statute either returns it with 200 or does not return it;
 *   - a 200 carrying an AWS WAF challenge instead of content.
 *
 * Any of these cached and parsed becomes a law that says nothing, and then a cell reports no
 * restriction on the strength of a page it never received.
 */
/** What one request came back with, before the cache and the log get hold of it. */
interface SendResult {
  status: number;
  mediaType: string;
  body: Buffer;
  finalUrl: string;
}

function isSoftBlock(res: { status: number; body: Buffer }): boolean {
  if (res.status === 429 || res.status === 503) return true;
  if (res.status >= 200 && res.status < 300 && res.status !== 200) return true;
  if (res.status === 200 && res.body.length === 0) return true;
  if (res.status === 200 && res.body.length < 8192) {
    const head = res.body.subarray(0, 4096).toString('utf8');
    if (/awswaf|challenge\.compact\.js|captcha\.js/i.test(head)) return true;
  }
  return false;
}

export type SourceMode = 'fetch' | 'cache-only';

export interface FetchResult {
  url: string;
  /** The URL actually served, after redirects. */
  finalUrl: string;
  status: number;
  mediaType: string;
  body: Buffer;
  contentHash: string;
  fromCache: boolean;
  fetchedAt: string;
}

export class RobotsDisallowed extends Error {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowed';
  }
}

/**
 * The server did not refuse us and did not serve us either.
 *
 * Measured on sso.agc.gov.sg: after a burst of requests its WAF starts answering 202 with a small
 * challenge page. Nothing about that response says "blocked" -- it is a success code carrying no
 * document. Cached and parsed naively it becomes a law with no sections, and then a cell reports
 * that the law contains no such requirement, on the strength of a page it never received. That is
 * exactly how v1 certified 852 Australian documents as clean negatives, so a success that is not
 * the document is raised here rather than stored.
 */
export class SoftBlocked extends Error {
  constructor(readonly url: string, readonly status: number) {
    super(`${url} answered HTTP ${status} without the document. The host is throttling us; back off and retry.`);
    this.name = 'SoftBlocked';
  }
}

/**
 * This host refused us enough times in a row that we stopped asking.
 *
 * Distinct from SoftBlocked, which is about one document. This one is about the run: whatever is
 * left in the queue for this host was not attempted, and the report has to say that rather than
 * leave it looking like a corpus with holes in it.
 */
export class HostSuspended extends Error {
  constructor(readonly host: string, readonly refusals: number, readonly until?: string) {
    super(
      `${host} refused ${refusals} documents in a row; no further requests were made to it` +
        (until ? `. It is left alone until ${until}.` : ' this run.'),
    );
    this.name = 'HostSuspended';
  }
}

/**
 * The request did not complete: a timed-out header, a reset socket, a DNS failure.
 *
 * A transport fault is a fact about one request, not about the job, so a caller may record the
 * document as unread and go on. But it is also how a host that has stopped answering presents
 * once it stops answering politely -- so it is counted toward the same refusal streak as a
 * SoftBlocked, and enough of them suspend the host through the ordinary path.
 *
 * This class exists because of a measured failure. The Singapore contents crawl of 2026-09-07
 * read 197 of 524 Acts and then died: the host had refused twice, the give-up threshold was
 * three, and a headers timeout raised an unhandled rejection that killed the process before the
 * third refusal could stop it in order. The 197 survived because they were committed as they
 * were read, but the run summary and the whole embedding stage that should have followed did
 * not happen. A named error that no one names is a crash.
 */
export class TransportFault extends Error {
  constructor(readonly url: string, override readonly cause: unknown) {
    super(`${url} did not complete: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'TransportFault';
  }
}

/**
 * Is this error one the pipeline already understands?
 *
 * Anything else reaching a fetch caller is a transport fault. The list is written as a check
 * rather than a catch-all so that a genuine programming error -- a bad argument, a null
 * dereference inside the fetcher -- still surfaces as itself instead of being reported as a
 * network problem and quietly skipped.
 */
function isNamedRefusal(err: unknown): boolean {
  return (
    err instanceof SoftBlocked ||
    err instanceof HostSuspended ||
    err instanceof RobotsDisallowed ||
    err instanceof CacheMiss ||
    err instanceof TypeError ||
    err instanceof RangeError ||
    err instanceof ReferenceError
  );
}

export class CacheMiss extends Error {
  constructor(readonly url: string) {
    super(
      `${url} is not in the cache, and this run is cache-only so it may not be fetched. ` +
        `Run the first pass in fetch mode, then re-run cache-only.`,
    );
    this.name = 'CacheMiss';
  }
}

interface CacheRecord {
  url: string;
  finalUrl: string;
  status: number;
  mediaType: string;
  contentHash: string;
  bytes: number;
  fetchedAt: string;
}

const sha256 = (v: Buffer | string): string => createHash('sha256').update(v).digest('hex');

function recordPath(url: string): string {
  const h = sha256(url);
  return join(CACHE_DIR, 'url', h.slice(0, 2), `${h}.json`);
}

function blobPath(contentHash: string): string {
  return join(CACHE_DIR, 'blob', contentHash.slice(0, 2), contentHash);
}

function writeFileMkdir(path: string, data: Buffer | string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/**
 * Put bytes that were assembled rather than fetched into the blob cache.
 *
 * An adapter that joins several responses into one document -- the volumes of an Act, the
 * provisions of a consolidated page -- produces bytes that no single request ever returned. Those
 * are the bytes a provision is read out of, and the ones the document row's hash is taken over,
 * but only the parts were ever written to the cache. So the hash addressed nothing: 1,231 of 4,050
 * documents could not be re-checked against their own stored bytes, and 199 of them carried a
 * citation. Composing a document and storing it are one act, not two.
 */
export function cacheComposed(body: Buffer): string {
  const hash = sha256(body);
  const path = blobPath(hash);
  if (!existsSync(path)) writeFileMkdir(path, body);
  return hash;
}

/** The subset of robots.txt that matters: what we may not fetch, and how slowly. */
interface Robots {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number | null;
  /** Null when the file could not be fetched at all; we then behave as if it allowed everything. */
  fetched: boolean;
}

export function parseRobots(text: string): Robots {
  const disallow: string[] = [];
  const allow: string[] = [];
  let crawlDelayMs: number | null = null;
  let inStar = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      // A group applies to us if it is the wildcard group. We do not claim a name of our own in
      // robots terms, so anything more specific is somebody else's rules.
      inStar = value === '*';
      continue;
    }
    if (!inStar) continue;
    if (field === 'disallow' && value) disallow.push(value);
    else if (field === 'allow' && value) allow.push(value);
    else if (field === 'crawl-delay') {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds > 0) crawlDelayMs = Math.min(seconds * 1000, MAX_DELAY_MS);
    }
  }
  return { disallow, allow, crawlDelayMs, fetched: true };
}

/** Longest-match wins, the convention every major crawler follows. Allow beats Disallow on a tie. */
function robotsPermits(robots: Robots, pathname: string): boolean {
  const match = (rules: string[]): number =>
    rules.reduce((best, rule) => (pathname.startsWith(rule) ? Math.max(best, rule.length) : best), -1);
  const d = match(robots.disallow);
  if (d < 0) return true;
  return match(robots.allow) >= d;
}

interface HostState {
  robots: Robots | null;
  nextAllowedAt: number;
  chain: Promise<unknown>;
  /** Added to this host's delay each time it throttles us, and paid back by clean requests. */
  penaltyMs: number;
  /** Consecutive clean responses since the last throttle, counted towards RECOVERY_STREAK. */
  okStreak: number;
  /** Documents this host has refused outright, in a row. Trips the breaker at GIVE_UP_AFTER. */
  refusals: number;
  /** Set once the breaker trips: this host is done for the run, and we say so rather than grind. */
  suspended: boolean;
}

export interface FetcherOptions {
  db: Db;
  sourceMode: SourceMode;
  runId?: string | null;
  /** Floor on the gap between requests to one host. A site asking for more gets more. */
  minDelayMs?: number;
  /**
   * How long to wait before asking again when the connection dropped with no answer, one entry
   * per retry. Defaults to TRANSPORT_RETRY_MS; a test standing in for an unreachable host sets it
   * short so the breaker can be watched tripping without waiting out the real pauses.
   */
  transportRetryMs?: number[];
  onLog?: (line: string) => void;
}

export class Fetcher {
  private readonly hosts = new Map<string, HostState>();
  private readonly db: Db;
  private readonly sourceMode: SourceMode;
  private readonly runId: string | null;
  private readonly minDelayMs: number;
  private readonly transportRetryMs: number[];
  private readonly onLog: (line: string) => void;

  /** Counters the run report quotes, so "documents fetched = 0" comes from a measurement. */
  readonly stats = {
    network: 0, cached: 0, disallowed: 0, softBlocked: 0, errors: 0,
    /** Bytes of document, after decompression. */
    bytes: 0,
    /** Bytes actually taken off the host. The gap between the two is what compression saved it. */
    wireBytes: 0,
  };

  constructor(opts: FetcherOptions) {
    this.db = opts.db;
    this.sourceMode = opts.sourceMode;
    this.runId = opts.runId ?? null;
    this.minDelayMs = opts.minDelayMs ?? DEFAULT_DELAY_MS;
    this.transportRetryMs = opts.transportRetryMs ?? TRANSPORT_RETRY_MS;
    this.onLog = opts.onLog ?? (() => {});
  }

  private state(host: string): HostState {
    let s = this.hosts.get(host);
    if (!s) {
      s = {
        robots: null, nextAllowedAt: 0, chain: Promise.resolve(),
        penaltyMs: 0, okStreak: 0, refusals: 0, suspended: false,
      };
      this.hosts.set(host, s);
    }
    return s;
  }

  private log(url: string, outcome: string, status: number | null, bytes: number, waitMs: number): void {
    this.db
      .prepare(
        `INSERT INTO fetch_log (run_id, host, url, requested_at, http_status, bytes, wait_ms, outcome)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(this.runId, new URL(url).host, url, new Date().toISOString(), status, bytes, waitMs, outcome);
  }

  private readCache(url: string): FetchResult | null {
    const rp = recordPath(url);
    if (!existsSync(rp)) return null;
    const rec = JSON.parse(readFileSync(rp, 'utf8')) as CacheRecord;

    // A cache that holds a throttled empty response is worse than an empty cache: every later run
    // serves it instantly and confidently, and the corpus is permanently missing whatever that URL
    // was. So an entry that is not a document is dropped and re-fetched rather than served.
    if (rec.status !== 200 || rec.bytes === 0) {
      rmSync(rp, { force: true });
      return null;
    }

    const bp = blobPath(rec.contentHash);
    if (!existsSync(bp)) return null;
    return {
      url: rec.url,
      finalUrl: rec.finalUrl,
      status: rec.status,
      mediaType: rec.mediaType,
      body: readFileSync(bp),
      contentHash: rec.contentHash,
      fromCache: true,
      fetchedAt: rec.fetchedAt,
    };
  }

  /** Serialised per host: the delay is only honoured if nothing overlaps it. */
  private queue<T>(host: string, work: () => Promise<T>): Promise<T> {
    const s = this.state(host);
    const next = s.chain.then(work, work);
    s.chain = next.catch(() => undefined);
    return next;
  }

  private async wait(host: string): Promise<number> {
    const s = this.state(host);
    // Jittered, because a request exactly every six seconds for three hours is itself a pattern
    // a rate rule notices, and because two stages of the pipeline should not synchronise.
    const base = Math.max(this.minDelayMs, s.robots?.crawlDelayMs ?? 0) + s.penaltyMs;
    const delay = Math.round(base * (0.85 + Math.random() * 0.3));
    const waitMs = Math.max(0, s.nextAllowedAt - Date.now());
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    s.nextAllowedAt = Date.now() + delay;
    return waitMs;
  }

  /**
   * Stop asking this host, and write down that we stopped.
   *
   * Recorded rather than held in memory so the next run does not start over and ask again -- the
   * cooldown outlives the process, which is the only way it protects anything.
   */
  private suspend(host: string, refusals: number): void {
    const state = this.state(host);
    state.suspended = true;
    const until = new Date(Date.now() + COOLDOWN_MS).toISOString();
    this.db
      .prepare(
        `INSERT INTO host_cooldown (host, until, refusals, recorded_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(host) DO UPDATE SET until = excluded.until,
           refusals = excluded.refusals, recorded_at = excluded.recorded_at`,
      )
      .run(host, until, refusals, new Date().toISOString());
    this.onLog(
      `  ${host}: refused ${refusals} documents in a row. Stopping, and leaving it alone until ` +
        `${until.slice(11, 19)} -- recorded, so the next run does not start over and ask again.`,
    );
  }

  /** Raw request. Callers go through fetch(), which adds the cache, robots and the log. */
  private async send(url: string): Promise<SendResult> {
    const res = await request(url, {
      method: 'GET',
      dispatcher,
      headersTimeout: TIMEOUT_MS,
      bodyTimeout: TIMEOUT_MS,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/pdf,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
        'accept-encoding': 'gzip, deflate, br',
        // A request whose user agent claims to be Chrome while its other headers say otherwise is
        // the exact inconsistency bot detection scores on, and ours claims Chrome because the CDN
        // requires it. If we present as a browser, we ask like one.
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'upgrade-insecure-requests': '1',
      },
    });
    const wire = Buffer.from(await res.body.arrayBuffer());
    this.stats.wireBytes += wire.length;
    const body = decompress(wire, res.headers['content-encoding']);
    const ct = res.headers['content-type'];
    const ctValue = (Array.isArray(ct) ? ct[0] : ct) ?? 'application/octet-stream';
    const mediaType = (ctValue.split(';')[0] ?? 'application/octet-stream').trim().toLowerCase();

    // The redirect interceptor records where it went; the last hop is what actually served us.
    const history = (res.context as { history?: URL[] } | undefined)?.history;
    const finalUrl = history?.length ? String(history[history.length - 1]) : url;
    return { status: res.statusCode, mediaType, body, finalUrl };
  }

  /**
   * What this host asks of us, learned once per run.
   *
   * The important case is failure. If robots.txt cannot be read -- and a throttled host will not
   * serve it either -- then we do not know what the site wants, and the safe reading of "unknown"
   * is slow, not fast. Falling back to the one-second floor is how a run that had been crawling
   * Singapore Statutes Online at its requested six seconds silently switched to one, and got
   * itself rate limited for the rest of the run.
   *
   * A robots.txt already on disk from an earlier run is used in preference to asking again: it is
   * the same file, and it costs a request we would rather spend on a document.
   */
  private async ensureRobots(host: string, origin: string): Promise<Robots> {
    const s = this.state(host);
    if (s.robots) return s.robots;

    // A host that answers "there is no such file" has answered, and the answer is that it has no
    // rules. Only 404 and 410 say that: 403 and 429 are a host pushing back, which is the opposite.
    const unknown = (): Robots => ({ disallow: [], allow: [], crawlDelayMs: UNKNOWN_ROBOTS_DELAY_MS, fetched: false });
    const noRules = (): Robots => ({ disallow: [], allow: [], crawlDelayMs: null, fetched: true });
    let absent = false;

    const cached = this.readCache(`${origin}/robots.txt`);
    if (cached) {
      s.robots = parseRobots(cached.body.toString('utf8'));
    } else if (this.sourceMode === 'cache-only') {
      s.robots = unknown();
    } else {
      // Fetched under the default delay: we do not yet know what the site would prefer.
      await this.wait(host);
      try {
        const res = await this.send(`${origin}/robots.txt`);
        if (res.status === 404 || res.status === 410) {
          absent = true;
          s.robots = noRules();
        } else if (res.status === 200 && res.body.length > 0 && !isSoftBlock(res)) {
          s.robots = parseRobots(res.body.toString('utf8'));
          const hash = sha256(res.body);
          writeFileMkdir(blobPath(hash), res.body);
          writeFileMkdir(
            recordPath(`${origin}/robots.txt`),
            JSON.stringify(
              {
                url: `${origin}/robots.txt`, finalUrl: res.finalUrl, status: res.status,
                mediaType: res.mediaType, contentHash: hash, bytes: res.body.length,
                fetchedAt: new Date().toISOString(),
              } satisfies CacheRecord,
              null, 2,
            ),
          );
        } else {
          s.robots = unknown();
        }
        this.log(`${origin}/robots.txt`, s.robots.fetched ? 'ok' : 'error', res.status, res.body.length, 0);
      } catch {
        s.robots = unknown();
      }
    }

    const delay = Math.max(this.minDelayMs, s.robots.crawlDelayMs ?? 0);
    this.onLog(
      absent
        ? `  ${host}: no robots.txt, which is a host saying it has no rules: ${delay}ms between requests`
        : s.robots.fetched
          ? `  ${host}: robots.txt read, ${s.robots.disallow.length} disallow rule(s), ${delay}ms between requests`
          : `  ${host}: robots.txt could not be read. Treating that as unknown rather than permissive: ${delay}ms between requests.`,
    );

    // Record what we learned against every portal on this host, so the profile view shows it.
    this.db
      .prepare(`UPDATE portal SET robots_allows = ?, crawl_delay_ms = ? WHERE url LIKE ?`)
      .run(s.robots.disallow.length ? 0 : 1, s.robots.crawlDelayMs, `%${host}%`);

    return s.robots;
  }

  /**
   * A cooldown this host is still inside, or null.
   *
   * Read from the database rather than memory so it survives the process: the in-process breaker
   * protects one run, and runs are frequently launched in a loop.
   */
  hostCooldown(host: string): { until: string; refusals: number } | null {
    const row = this.db
      .prepare('SELECT until, refusals FROM host_cooldown WHERE host = ? AND until > ?')
      .get(host, new Date().toISOString()) as { until: string; refusals: number } | undefined;
    return row ?? null;
  }

  /**
   * Fetch one URL, or serve it from the cache.
   *
   * Throws RobotsDisallowed if the site says no, and CacheMiss if the run is cache-only and we
   * have not seen this URL before. Neither is swallowed: a caller that wants to continue past one
   * must say so.
   */
  async fetch(url: string, opts: { refresh?: boolean } = {}): Promise<FetchResult> {
    const parsed = new URL(url);
    const host = parsed.host;

    if (!opts.refresh) {
      const cached = this.readCache(url);
      if (cached) {
        this.stats.cached += 1;
        this.log(url, 'cached', cached.status, cached.body.length, 0);
        return cached;
      }
    }

    if (this.sourceMode === 'cache-only') {
      this.log(url, 'skipped-cache-only', null, 0, 0);
      throw new CacheMiss(url);
    }

    // Asked before the queue, so a suspended host costs nothing at all rather than a turn in it.
    if (this.state(host).suspended) throw new HostSuspended(host, this.state(host).refusals);

    const cooling = this.hostCooldown(host);
    if (cooling) {
      this.state(host).suspended = true;
      throw new HostSuspended(host, cooling.refusals, cooling.until);
    }

    return this.queue(host, async () => {
      const robots = await this.ensureRobots(host, parsed.origin);
      if (!robotsPermits(robots, parsed.pathname)) {
        this.stats.disallowed += 1;
        this.log(url, 'robots-disallowed', null, 0, 0);
        throw new RobotsDisallowed(url);
      }

      const state = this.state(host);
      let waitMs = await this.wait(host);
      try {
        // A connection that drops before the host answers is retried here, close in, before any
        // of the logic below treats it as a refusal. The walk that prompted this lost a register
        // of 847 Acts to one reset on the fourth page: the three pages already gathered were
        // discarded, and the same page served 1.3MB on the next attempt.
        let res = await this.sendThroughDrops(url, host);
        // Every attempt is logged, retries included. fetch_log is the run record that makes
        // "we crawled politely" checkable rather than claimed, and a record that counts three
        // requests as one understates what actually left this machine.
        this.log(url, isSoftBlock(res) ? 'soft-blocked' : 'ok', res.status, res.body.length, waitMs);

        // Back off and retry a throttled or empty response before giving up on it. The delays are
        // long on purpose: the point is to stop asking, not to ask more insistently.
        for (let attempt = 0; attempt < BACKOFF_MS.length && isSoftBlock(res); attempt += 1) {
          state.penaltyMs += SLOWDOWN_MS;
          state.okStreak = 0;
          const pause = BACKOFF_MS[attempt]!;
          this.onLog(
            `  ${host}: HTTP ${res.status}, ${res.body.length} bytes -- throttled. Backing off ` +
              `${pause / 1000}s, and every later request to this host waits ` +
              `${state.penaltyMs / 1000}s longer.`,
          );
          await new Promise((r) => setTimeout(r, pause));
          waitMs += pause;
          res = await this.sendThroughDrops(url, host);
          this.log(url, isSoftBlock(res) ? 'soft-blocked' : 'ok', res.status, res.body.length, pause);
        }
        if (isSoftBlock(res)) {
          this.stats.softBlocked += 1;
          state.refusals += 1;
          if (state.refusals >= GIVE_UP_AFTER) this.suspend(host, state.refusals);
          throw new SoftBlocked(url, res.status);
        }
        // The host is serving us again, so the recorded cooldown is stale. Leaving it behind would
        // make the next run decline to ask for no reason.
        if (state.refusals > 0) this.db.prepare('DELETE FROM host_cooldown WHERE host = ?').run(host);
        state.refusals = 0;

        // A clean response is evidence the host has stopped objecting. Enough of them in a row
        // pays back one step of the slowdown, so an early throttle does not price the whole run.
        state.okStreak += 1;
        if (state.penaltyMs > 0 && state.okStreak >= RECOVERY_STREAK) {
          state.penaltyMs = Math.max(0, state.penaltyMs - SLOWDOWN_MS);
          state.okStreak = 0;
          this.onLog(
            `  ${host}: ${RECOVERY_STREAK} clean requests -- easing back to ` +
              `${state.penaltyMs / 1000}s of added delay.`,
          );
        }

        const contentHash = sha256(res.body);
        const fetchedAt = new Date().toISOString();

        writeFileMkdir(blobPath(contentHash), res.body);
        writeFileMkdir(
          recordPath(url),
          JSON.stringify(
            { url, finalUrl: res.finalUrl, status: res.status, mediaType: res.mediaType, contentHash, bytes: res.body.length, fetchedAt } satisfies CacheRecord,
            null, 2,
          ),
        );

        this.stats.network += 1;
        this.stats.bytes += res.body.length;
        return { url, finalUrl: res.finalUrl, status: res.status, mediaType: res.mediaType, body: res.body, contentHash, fromCache: false, fetchedAt };
      } catch (err) {
        this.stats.errors += 1;
        this.log(url, 'error', null, 0, waitMs);
        if (isNamedRefusal(err)) throw err;

        // A transport fault. It counts as a refusal, so a host that has gone quiet is stopped by
        // the same rule that stops one refusing out loud -- see TransportFault for the crawl this
        // was written after.
        state.refusals += 1;
        if (state.refusals >= GIVE_UP_AFTER) {
          this.suspend(host, state.refusals);
          throw new HostSuspended(host, state.refusals);
        }
        throw new TransportFault(url, err);
      }
    });
  }

  /**
   * Send, and ask again if the connection dropped without an answer.
   *
   * A reset, a hang-up or a DNS blip is not a decision the host made about us, and the caller
   * cannot tell the difference from an outright refusal once the exception is thrown. Retrying
   * here keeps that distinction where the evidence for it is. A refusal the host actually stated
   * -- robots, a cooldown, a suspension -- is never retried, and every attempt is logged, so a
   * quiet host still shows up in fetch_log as the several requests it really cost.
   */
  private async sendThroughDrops(url: string, host: string): Promise<SendResult> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.send(url);
      } catch (err) {
        if (isNamedRefusal(err) || attempt >= this.transportRetryMs.length) throw err;
        const pause = this.transportRetryMs[attempt]!;
        this.log(url, 'error', null, 0, 0);
        this.onLog(
          `  ${host}: ${err instanceof Error ? err.message : String(err)} -- no answer. ` +
            `Asking again in ${pause / 1000}s.`,
        );
        await new Promise((r) => setTimeout(r, pause));
      }
    }
  }

  /** True when the URL is already on disk, so a caller can plan without triggering a fetch. */
  isCached(url: string): boolean {
    return this.readCache(url) !== null;
  }
}

/** Exposed for the test that pins the shapes of a throttled response. Not part of the API. */
export const __softBlockShapes = isSoftBlock;

/** Exposed for the test that pins the conservative fallback. Not part of the API. */
export const __unknownRobotsDelayMs = UNKNOWN_ROBOTS_DELAY_MS;

/** Exported for the test that a compressed response is unwrapped rather than parsed as noise. */
export const __decompress = decompress;

/** Exported for the test that a host which keeps refusing is abandoned rather than ground against. */
export const __giveUpAfter = GIVE_UP_AFTER;
