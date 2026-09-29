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
import { hostedConfig, hostedGenerate } from './hosted.js';
import { loadEngines } from './registry.js';
export { OllamaUnavailable, NoEnginesLeft } from './errors.js';

/**
 * The first engine named. Reads go to whichever engine the pool frees; this is for one-offs.
 * Read when asked, not when this module loads: a script that loads its .env or takes --hosts after
 * its imports have run would otherwise be pointed at whatever the shell had.
 */
function firstHost(): string {
  return engineHosts()[0]!;
}

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
  constructor(
    model: string,
    limit: number,
    promptTokens: number,
    completionTokens: number,
    durationMs: number,
    /** What it wrote before it was cut off, for a caller that can tell an answer from the loop. */
    readonly partial = '',
  ) {
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
//
// A connection the proxy did not accept in time is the same: nothing was sent, so nothing was
// spent, and the next attempt found the engine there -- see the connect-timeout test.
const CONNECTION_LOST =
  /ECONNRESET|ECONNREFUSED|ECONNABORTED|EPIPE|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|ENETDOWN|ENOTFOUND|EAI_AGAIN|UND_ERR_SOCKET|UND_ERR_CONNECT_TIMEOUT|Connect Timeout|SocketError|socket hang up|other side closed|fetch failed|terminated/i;

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
    const parsed = JSON.parse(text) as T & { error?: unknown };
    // A rented engine's proxy has sent its status line before the answer exists, so a failure
    // arrives as a 200 whose body is only an error. Read as an answer, it was an empty one.
    if (typeof parsed.error === 'string') throw new Error(`engine: ${parsed.error.slice(0, 300)}`);
    return parsed;
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
    const res = await request(`${firstHost()}/api/tags`, {
      headers: authHeaders(),
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });
    const body = (await res.body.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) => m.name);
  } catch (err) {
    throw new OllamaUnavailable(err instanceof Error ? err.message : String(err), firstHost());
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
  // A vector of the wrong width, or one holding a NaN, is stored without complaint and poisons
  // every similarity it is later compared against. The count was checked; the contents were not.
  const dims = res.embeddings[0]?.length ?? 0;
  return res.embeddings.map((v, i) => {
    if (v.length !== dims || dims === 0) {
      throw new Error(`${model} returned a ${v.length}-dim vector where the batch is ${dims}-dim (input ${i})`);
    }
    if (!v.every((x) => Number.isFinite(x))) {
      throw new Error(`${model} returned a vector holding a non-finite value (input ${i})`);
    }
    return Float32Array.from(v);
  });
}

/**
 * Questions embedded once per process, and in one request where they arrive together.
 *
 * Retrieval and the shortlist each ask thirty-odd questions a cell and embedded them one request at
 * a time. Against a rented GPU through an SSH tunnel the model takes 11 ms and the round trip one to
 * two seconds, measured 27 September, so a sweep of the register spent its time on the wire and the
 * GPU sat at 0%. A caller that knows its questions hands them over together; each is embedded once,
 * and asked again it is answered from here. The vectors are the model's own, so a question embedded
 * alone or in a batch is compared by the same function either way.
 */
const queryVectors = new Map<string, Float32Array>();

export async function embedQueries(texts: readonly string[], model: string = EMBEDDING_MODEL): Promise<Float32Array[]> {
  const key = (t: string) => `${model}\u0000${t}`;
  const missing = [...new Set(texts.filter((t) => !queryVectors.has(key(t))))];
  if (missing.length) {
    const vectors = await embed(missing, model);
    missing.forEach((t, i) => queryVectors.set(key(t), vectors[i]!));
  }
  return texts.map((t) => queryVectors.get(key(t))!);
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
  /** How the engine is held to the schema, where not as its declaration says. */
  decoding?: SchemaDecoding;
}

/**
 * How an engine is held to the schema: by the decoder, or by being shown it.
 *
 * Constrained is the default, and Engine A reads well under it. Qwen 3.8 does not: on Rule 4 of
 * India's Intermediary Rules, the provision that decides 8.3, it answered `{"findings": []}` in
 * seven tokens every time it was constrained. Unconstrained, the same engine at the same
 * temperature named the duty ("identify such user and verify his identity") and the others around
 * it. So for an engine declared `"schema": "described"`, the schema goes in the system prompt, the
 * answer is read as JSON wherever it sits in the text, and only an answer that holds no JSON is
 * asked again under the decoder.
 */
export type SchemaDecoding = 'constrained' | 'described';

let declared: Map<string, SchemaDecoding> | null = null;

export function schemaDecoding(model: string): SchemaDecoding {
  const forced = process.env['LEXDROID_SCHEMA_DECODING'];
  if (forced === 'constrained' || forced === 'described') return forced;
  declared ??= new Map(loadEngines().engines.map((e) => [e.model, e.schema ?? 'constrained']));
  return declared.get(model.replace(/:latest$/, '')) ?? 'constrained';
}

/** What the engine is told when the decoder does not hold it to the schema. */
export function describedSchema(system: string, schema: unknown): string {
  return [
    system,
    '',
    'Answer with one JSON object and nothing else: no code fence, and no words before or after it.',
    'Write every field as a JSON string, number, boolean or null. The object must satisfy this JSON Schema:',
    JSON.stringify(schema),
  ].join('\n');
}

/**
 * The JSON object in an answer, or null when there is none.
 *
 * An engine asked for JSON in words, rather than held to it by the decoder, sometimes fences it in
 * Markdown or says a sentence first. The object itself is taken from the first brace to the brace
 * that closes it, strings respected; anything else is not an answer and is not guessed at.
 */
export function jsonIn(text: string): string | null {
  const whole = text.trim();
  try {
    if (typeof JSON.parse(whole) === 'object') return whole;
  } catch {
    // Not bare JSON; look inside it.
  }
  for (let start = whole.indexOf('{'); start !== -1; start = whole.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < whole.length; i += 1) {
      const c = whole[i];
      if (inString) {
        if (c === '\\') i += 1;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth += 1;
      else if (c === '}' && --depth === 0) {
        const candidate = whole.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          break;
        }
      }
    }
  }
  return null;
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
  // Never for a hosted engine: its API holds it to the schema by its own means.
  if (opts.schema && !hostedConfig() && (opts.decoding ?? schemaDecoding(model)) === 'described') {
    return generateDescribed(prompt, system, { ...opts, model });
  }
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

  // Where the run is pointed at a hosted engine, the request goes out in the chat-completions
  // shape instead. Read before the cache, because the cache has to know who would answer.
  const hosted = hostedConfig();

  // Keyed on the request itself, so a changed prompt, schema, model or option misses rather than
  // replaying an answer to a question nobody is asking any more. And on the engine that answers:
  // keyed on the requested model alone, a hosted run replayed the local engine's answers as its
  // own, and a comparison of two engines compared one engine with itself. A local request keeps
  // the key it always had, so the local cache is still valid.
  const identity = hosted ? { ...body, model: hosted.model, provider: hosted.provider } : body;
  const key = cacheEnabled() ? cacheKey(identity) : null;
  if (key) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, fromCache: true, fromResume: false };
  }

  // What this unit already read before it was interrupted. Same key, so a changed prompt misses.
  const resume = resumePath();
  const resumeKey = resume ? (key ?? cacheKey(identity)) : null;
  if (resume && resumeKey) {
    const hit = cacheGet(resumeKey, resume);
    if (hit) return { ...hit, fromCache: false, fromResume: true };
  }

  // Everything on either side of this -- the cache above, the runaway and silence checks below --
  // is the same for both engines, because a second engine that took a second code path would be a
  // second set of failures rather than a comparison.
  let text: string;
  let promptTokens: number;
  let completionTokens: number;
  let overran: boolean;

  if (hosted) {
    const answer = await hostedGenerate(prompt, system, {
      model: hosted.model,
      ...(opts.schema ? { schema: opts.schema } : {}),
      temperature: opts.temperature ?? 0,
      maxOutputTokens: limit,
    }).catch((err: unknown) => {
      // A provision too long for the plan's per-minute limit is a fact about that provision, like
      // a stall: recorded as a failure to read it, and the rest of the pillar is still read.
      // So is an answer the host could not validate and had nothing of to hand back -- gpt-oss-20b
      // produced empty output on one Russian provision and the refusal ended the pillar.
      if (err instanceof Error && /will never accept this request|json_validate_failed/.test(err.message)) {
        throw new EngineFailure(hosted.model, err.message);
      }
      throw err;
    });
    text = answer.text;
    promptTokens = answer.promptTokens;
    completionTokens = answer.completionTokens;
    overran = answer.finishReason === 'length';
  } else {
    const res = await onAnyEngine<{
      response?: string;
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      done_reason?: string;
    }>('/api/chat', body, 600_000, model);

    text = res.message?.content ?? res.response ?? '';
    promptTokens = res.prompt_eval_count ?? 0;
    completionTokens = res.eval_count ?? 0;
    overran = res.done_reason === 'length';
  }
  const durationMs = Date.now() - started;

  // An answer that ran to the limit is the tail of a repetition loop, and reporting it as a
  // reading would present the loop's leftovers as what the provision says. Thrown before the
  // cache is written, so a runaway is never replayed as if it were a reading.
  if (overran || completionTokens >= limit) {
    throw new EngineOverran(model, limit, promptTokens, completionTokens, durationMs, text);
  }
  if (!text.trim()) throw new EngineSilent(model, promptTokens, durationMs);

  const answer = { text, promptTokens, completionTokens, durationMs, model: hosted?.model ?? model };
  if (key) cachePut(key, answer);
  if (resume && resumeKey) cachePut(resumeKey, answer, resume);
  return { ...answer, fromCache: false, fromResume: false };
}

/**
 * One prompt to an engine that is shown the schema rather than held to it.
 *
 * The answer comes back as the JSON object it contains, so every caller parses it as it parses a
 * constrained one. An answer with no JSON in it is asked once more under the decoder, and what the
 * two calls cost is added together; whether that second answer is any good is the caller's to
 * judge, as it is for every answer.
 */
async function generateDescribed(prompt: string, system: string, opts: GenerateOptions): Promise<Generated> {
  const { schema, ...rest } = opts;
  const first = await generate(prompt, describedSchema(system, schema), rest);
  const json = jsonIn(first.text);
  if (json !== null) return { ...first, text: json };
  describedFallbacks += 1;
  const again = await generate(prompt, system, { ...opts, decoding: 'constrained' });
  return {
    ...again,
    promptTokens: first.promptTokens + again.promptTokens,
    completionTokens: first.completionTokens + again.completionTokens,
    durationMs: first.durationMs + again.durationMs,
    fromCache: first.fromCache && again.fromCache,
    fromResume: first.fromResume && again.fromResume,
  };
}

let describedFallbacks = 0;

/** How many answers held no JSON and were asked again under the decoder. Reported, never silent. */
export function describedSchemaFallbacks(): number {
  return describedFallbacks;
}
