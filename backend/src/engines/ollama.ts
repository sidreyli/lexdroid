/**
 * The engine client.
 *
 * Everything the pipeline asks a model for goes through Ollama: generation, embeddings, and later
 * OCR. That is the whole of the Section 3 declaration -- no proprietary API is called and the
 * weights are open. Ollama is on this machine by default; OLLAMA_HOST can point it at a GPU you
 * rent, which is the same weights on someone else's hardware and should be said that way.
 *
 * Generation is asked for as JSON against a declared schema and at temperature zero. Both are
 * deliberate: the reading stage returns facts a scoring function consumes, and a stage whose
 * output shape is negotiable is a stage whose failures arrive as a parse error three modules
 * later.
 */
import { request } from 'undici';
import { cacheEnabled, cacheGet, cacheKey, cachePut, resumePath } from './cache.js';
import { enginePool, engineHosts } from './pool.js';
import { OllamaUnavailable } from './errors.js';
export { OllamaUnavailable, NoEnginesLeft } from './errors.js';

/** The first engine named. Reads go to whichever engine the pool frees; this is for one-offs. */
const HOST = engineHosts()[0]!;

/**
 * A rented engine is reachable by whoever guesses its URL, and Ollama has no auth of its own.
 * Passed inline at the shell and never stored: a token written to a file is a token in a backup.
 */
export function authHeaders(): Record<string, string> {
  const token = process.env['LEXDROID_ENGINE_TOKEN'];
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Multilingual by design: the same model has to place a Malay provision and an English one in the
 * same space, or semantic search works for one economy and silently fails for another. bge-m3 is
 * trained across 100+ languages and runs in about 1.2 GB.
 */
export const EMBEDDING_MODEL = process.env['LEXDROID_EMBEDDING_MODEL'] ?? 'bge-m3';

/**
 * The engine that reads law.
 *
 * Declared here and overridable by environment, because C5b asks for the whole pipeline to run on
 * a second engine with nothing edited. Both candidates are open weights on this machine.
 */
export const READING_MODEL = process.env['LEXDROID_READING_MODEL'] ?? 'gemma4-lex-16k';

/**
 * The most tokens one answer may write. Set in the empty band between the two populations:
 * over 5,783 calls, every useful answer stopped by 3,515 tokens and every runaway passed 11,786.
 * 8192 was tried and reverted: the two provisions it was meant to rescue overran that too.
 */
export const MAX_OUTPUT_TOKENS = Number(process.env['LEXDROID_MAX_OUTPUT_TOKENS'] ?? 4096);


/** The engine produced nothing usable. Carries what the attempt cost, which is real either way. */
export class EngineFailure extends Error {
  constructor(
    readonly model: string,
    message: string,
    readonly promptTokens = 0,
    readonly completionTokens = 0,
    readonly durationMs = 0,
  ) {
    super(message);
    this.name = 'EngineFailure';
  }
}

/**
 * The engine accepted the request and then did not answer.
 *
 * Distinct from OllamaUnavailable, and the distinction decides what the caller does. An engine
 * that is not running is the end of the job: nothing further can be read and pretending otherwise
 * produces a run that reports an empty search. An engine that stalls on one prompt is a fact about
 * that one provision -- a fifty-thousand-character section, a moment of contention -- and the
 * other hundred and forty-nine can still be read. A run that dies on the first of them throws away
 * everything it had already done, which is what happened here: nine cells' work lost to one
 * provision, ten minutes in.
 */
export class EngineTimeout extends EngineFailure {
  constructor(model: string, detail: string) {
    super(model, `${model} accepted the request and did not answer: ${detail}`);
    this.name = 'EngineTimeout';
  }
}

/**
 * The engine wrote until it was cut off at the output limit.
 * Measured: 31 such calls, each filling the context window to the token and returning no finding,
 * no quote and no reasoning, took 169 minutes -- a ninth of all engine time ever spent reading.
 */
export class EngineOverran extends EngineFailure {
  constructor(model: string, limit: number, promptTokens: number, completionTokens: number, durationMs: number) {
    super(
      model,
      `${model} wrote ${completionTokens} tokens without finishing and was cut off at the ${limit}-token limit`,
      promptTokens,
      completionTokens,
      durationMs,
    );
    this.name = 'EngineOverran';
  }
}

/**
 * The engine stopped its own prediction and returned an error instead of an answer.
 *
 * Ollama aborts a generation that repeats itself past a limit, and reports it as HTTP 500 rather
 * than as a completed call. Unclassified it left the client as a plain error, which no caller
 * treats as one provision's failure, so it escaped the read stage's catch and took the pillar with
 * it -- measured on Australia's pillar 6, twice, at the same provision both times. It is
 * deterministic at temperature zero: re-running is not a remedy, recording it is.
 */
export class EngineAborted extends EngineFailure {
  constructor(model: string, detail: string) {
    super(model, `${model} stopped its own prediction on this prompt: ${detail}`);
    this.name = 'EngineAborted';
  }
}

/** The engine answered with nothing at all. Observed once, at 81 seconds and zero output tokens. */
export class EngineSilent extends EngineFailure {
  constructor(model: string, promptTokens: number, durationMs: number) {
    super(model, `${model} returned an empty answer`, promptTokens, 0, durationMs);
    this.name = 'EngineSilent';
  }
}

/**
 * How long to keep trying while the engine is unreachable, and how long between attempts.
 * A tunnel that drops for seconds is not an engine that has stopped; the difference is a pillar.
 */
const RECONNECT_WAITS_MS = (process.env['LEXDROID_RECONNECT_WAITS_MS'] ?? '2000,5000,10000,20000,40000,60000')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isFinite(n) && n >= 0);

let reconnectAttempts = 0;

/** How many times a request had to wait for the engine to come back. Reported, never silent. */
export function engineReconnects(): number {
  return reconnectAttempts;
}

/**
 * A connection that broke, told apart from an engine that stopped.
 *
 * An SSH tunnel to a rented pod resets whatever is in flight when it flaps, and the reset arrives
 * as ECONNRESET rather than a refusal. Unlisted, it escaped the reconnect ladder below and the
 * pool's retirement above, so a blink that the keeper healed in fifteen seconds still cost the
 * whole pillar -- most of one night's engine time, for four banked answers.
 */
const CONNECTION_LOST =
  /ECONNRESET|ECONNREFUSED|ECONNABORTED|EPIPE|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENETDOWN|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET|SocketError|socket hang up|other side closed|fetch failed|terminated/i;

/** The engine said the request timed out, which is about this prompt and not about the link. */
const STALLED = /UND_ERR_(HEADERS|BODY)_TIMEOUT|Headers Timeout|Body Timeout/i;

/** The engine gave up on this generation. One provision's fact, like a stall, not the link's. */
const ABORTED = /prediction aborted|token repeat limit/i;

/**
 * Every message and code down the cause chain.
 * undici reports the interesting part as the cause: the outer message is often just "fetch failed".
 */
function failureText(err: unknown): string {
  const parts: string[] = [];
  let e: unknown = err;
  for (let depth = 0; e instanceof Error && depth < 5; depth += 1) {
    parts.push(e.message);
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string') parts.push(code);
    e = (e as { cause?: unknown }).cause;
  }
  return parts.length > 0 ? parts.join(' | ') : String(err);
}

async function once<T>(host: string, path: string, body: unknown, timeoutMs: number, model: string): Promise<T> {
  try {
    const res = await request(`${host}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify(body),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    const text = await res.body.text();
    if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  } catch (err) {
    const message = failureText(err);
    // Stall first: a prompt the engine took and did not answer costs that provision, not the link.
    if (STALLED.test(message)) throw new EngineTimeout(model, message);
    if (ABORTED.test(message)) throw new EngineAborted(model, message);
    if (CONNECTION_LOST.test(message)) throw new OllamaUnavailable(message, host);
    throw err;
  }
}

/**
 * The same request, retried while the engine is only briefly away. Past the budget it really has
 * gone, and the caller must stop rather than report a search that found nothing.
 */
async function post<T>(host: string, path: string, body: unknown, timeoutMs = 600_000, model = ''): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const value = await once<T>(host, path, body, timeoutMs, model);
      if (attempt > 0) console.warn(`  engine answered again after ${attempt} attempt(s) waiting`);
      return value;
    } catch (err) {
      const wait = RECONNECT_WAITS_MS[attempt];
      if (!(err instanceof OllamaUnavailable) || wait === undefined) throw err;
      reconnectAttempts += 1;
      console.warn(`  ${host} unreachable; waiting ${wait / 1000}s, then attempt ${attempt + 2}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/**
 * The same request, on whichever engine is free. Past its reconnect budget an engine really has
 * gone, so it is retired and the request is tried on another rather than costing the pillar.
 */
async function onAnyEngine<T>(path: string, body: unknown, timeoutMs: number, model: string): Promise<T> {
  return enginePool().run(
    (host) => post<T>(host, path, body, timeoutMs, model),
    (err) => err instanceof OllamaUnavailable,
  );
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await request(`${HOST}/api/tags`, {
      headers: authHeaders(),
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });
    const body = (await res.body.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) => m.name);
  } catch (err) {
    throw new OllamaUnavailable(err instanceof Error ? err.message : String(err), HOST);
  }
}

export async function haveModel(name: string): Promise<boolean> {
  const models = await listModels();
  const base = (n: string) => n.replace(/:latest$/, '');
  return models.some((m) => base(m) === base(name));
}

/** One batch of texts to vectors. Ollama embeds sequentially; the batch is for fewer round trips. */
export async function embed(texts: string[], model: string = EMBEDDING_MODEL): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const res = await onAnyEngine<{ embeddings: number[][] }>('/api/embed', { model, input: texts }, 600_000, model);
  if (!res.embeddings || res.embeddings.length !== texts.length) {
    throw new Error(`${model} returned ${res.embeddings?.length ?? 0} vectors for ${texts.length} inputs`);
  }
  return res.embeddings.map((v) => Float32Array.from(v));
}

export interface GenerateOptions {
  model?: string;
  /** A JSON Schema the response must satisfy. Ollama constrains decoding to it. */
  schema?: unknown;
  /** Raised only for a stage that has a reason to want variety. Nothing here does yet. */
  temperature?: number;
  /** Tokens of context. Too small silently truncates the prompt, which reads as a wrong answer. */
  contextTokens?: number;
  /** The most tokens one answer may write. Past it the answer is a repetition loop, not a reading. */
  maxOutputTokens?: number;
  /**
   * Let the engine reason at length before answering. Off, and measured rather than assumed.
   *
   * Both local engines here are reasoning models. Asked to read one 874-character provision of the
   * PDPA against pillar 6, with thinking on, gemma4-lex-16k produced 63,876 characters of internal
   * reasoning, ran out of budget and returned an empty answer -- 349 seconds for nothing. The same
   * prompt with thinking off returned the correct finding in 5.2 seconds.
   *
   * That is not a tuning preference. This stage asks a closed question about a passage in front of
   * it, and open-ended deliberation is where a reader stops reading and starts speculating.
   */
  think?: boolean;
}

export interface Generated {
  text: string;
  /** What the engine reported it did, so a run record can carry cost without a second measurement. */
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  model: string;
  /** Whether this answer was replayed rather than asked for. A run that used one is not a measurement. */
  fromCache: boolean;
  /** Replayed from this unit's own interrupted attempt: asked once, answered once, paid for once. */
  fromResume: boolean;
}

/**
 * One prompt to the reading engine.
 *
 * The system prompt is separate from the task so that the instruction not to score sits outside
 * the document text, where nothing in a statute can reach it.
 */
export async function generate(
  prompt: string,
  system: string,
  opts: GenerateOptions = {},
): Promise<Generated> {
  const model = opts.model ?? READING_MODEL;
  const limit = opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS;
  const started = Date.now();

  const body = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    ...(opts.schema ? { format: opts.schema } : {}),
    think: opts.think ?? false,
    options: {
      temperature: opts.temperature ?? 0,
      num_predict: limit,
      ...(opts.contextTokens ? { num_ctx: opts.contextTokens } : {}),
    },
  };

  // Keyed on the request itself, so a changed prompt, schema, model or option misses rather than
  // replaying an answer to a question nobody is asking any more.
  const key = cacheEnabled() ? cacheKey(body) : null;
  if (key) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, fromCache: true, fromResume: false };
  }

  // What this unit already read before it was interrupted. Same key, so a changed prompt misses.
  const resume = resumePath();
  const resumeKey = resume ? (key ?? cacheKey(body)) : null;
  if (resume && resumeKey) {
    const hit = cacheGet(resumeKey, resume);
    if (hit) return { ...hit, fromCache: false, fromResume: true };
  }

  const res = await onAnyEngine<{
    response?: string;
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
    done_reason?: string;
  }>('/api/chat', body, 600_000, model);

  const text = res.message?.content ?? res.response ?? '';
  const promptTokens = res.prompt_eval_count ?? 0;
  const completionTokens = res.eval_count ?? 0;
  const durationMs = Date.now() - started;

  // An answer that ran to the limit is the tail of a repetition loop, and reporting it as a
  // reading would present the loop's leftovers as what the provision says. Thrown before the
  // cache is written, so a runaway is never replayed as if it were a reading.
  if (res.done_reason === 'length' || completionTokens >= limit) {
    throw new EngineOverran(model, limit, promptTokens, completionTokens, durationMs);
  }
  if (!text.trim()) throw new EngineSilent(model, promptTokens, durationMs);

  const answer = { text, promptTokens, completionTokens, durationMs, model };
  if (key) cachePut(key, answer);
  if (resume && resumeKey) cachePut(resumeKey, answer, resume);
  return { ...answer, fromCache: false, fromResume: false };
}
