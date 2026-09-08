/**
 * The local engine client.
 *
 * Everything the pipeline asks a model for goes through Ollama on this machine: generation,
 * embeddings, and later OCR. That is the whole of the Section 3 declaration -- no proprietary API
 * is called, and nothing about the documents leaves the machine.
 *
 * Generation is asked for as JSON against a declared schema and at temperature zero. Both are
 * deliberate: the reading stage returns facts a scoring function consumes, and a stage whose
 * output shape is negotiable is a stage whose failures arrive as a parse error three modules
 * later.
 */
import { request } from 'undici';
import { cacheEnabled, cacheGet, cacheKey, cachePut } from './cache.js';

const HOST = process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434';

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

export class OllamaUnavailable extends Error {
  constructor(detail: string) {
    super(`Ollama is not answering at ${HOST}: ${detail}\n  Start it, or set OLLAMA_HOST.`);
    this.name = 'OllamaUnavailable';
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
export class EngineTimeout extends Error {
  constructor(readonly model: string, detail: string) {
    super(`${model} accepted the request and did not answer: ${detail}`);
    this.name = 'EngineTimeout';
  }
}

async function post<T>(path: string, body: unknown, timeoutMs = 600_000, model = ''): Promise<T> {
  try {
    const res = await request(`${HOST}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    const text = await res.body.text();
    if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/ECONNREFUSED|fetch failed|other side closed/i.test(message)) throw new OllamaUnavailable(message);
    if (/UND_ERR_(HEADERS|BODY)_TIMEOUT|Headers Timeout|Body Timeout/i.test(message)) {
      throw new EngineTimeout(model, message);
    }
    throw err;
  }
}

export async function listModels(): Promise<string[]> {
  try {
    const res = await request(`${HOST}/api/tags`, { headersTimeout: 10_000, bodyTimeout: 10_000 });
    const body = (await res.body.json()) as { models?: { name: string }[] };
    return (body.models ?? []).map((m) => m.name);
  } catch (err) {
    throw new OllamaUnavailable(err instanceof Error ? err.message : String(err));
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
  const res = await post<{ embeddings: number[][] }>('/api/embed', { model, input: texts });
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
      ...(opts.contextTokens ? { num_ctx: opts.contextTokens } : {}),
    },
  };

  // Keyed on the request itself, so a changed prompt, schema, model or option misses rather than
  // replaying an answer to a question nobody is asking any more.
  const key = cacheEnabled() ? cacheKey(body) : null;
  if (key) {
    const hit = cacheGet(key);
    if (hit) return { ...hit, fromCache: true };
  }

  const res = await post<{
    response?: string;
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  }>('/api/chat', body, 600_000, model);

  const answer = {
    text: res.message?.content ?? res.response ?? '',
    promptTokens: res.prompt_eval_count ?? 0,
    completionTokens: res.eval_count ?? 0,
    durationMs: Date.now() - started,
    model,
  };
  if (key) cachePut(key, answer);
  return { ...answer, fromCache: false };
}
