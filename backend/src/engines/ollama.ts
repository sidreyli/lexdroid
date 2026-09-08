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

const HOST = process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434';

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
 */
export const MAX_OUTPUT_TOKENS = Number(process.env['LEXDROID_MAX_OUTPUT_TOKENS'] ?? 4096);

export class OllamaUnavailable extends Error {
  constructor(detail: string) {
    super(`Ollama is not answering at ${HOST}: ${detail}\n  Start it, or set OLLAMA_HOST.`);
    this.name = 'OllamaUnavailable';
  }
}

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

/** The engine answered with nothing at all. Observed once, at 81 seconds and zero output tokens. */
export class EngineSilent extends EngineFailure {
  constructor(model: string, promptTokens: number, durationMs: number) {
    super(model, `${model} returned an empty answer`, promptTokens, 0, durationMs);
    this.name = 'EngineSilent';
  }
}

async function post<T>(path: string, body: unknown, timeoutMs = 600_000, model = ''): Promise<T> {
  try {
    const res = await request(`${HOST}${path}`, {
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
    const res = await request(`${HOST}/api/tags`, {
      headers: authHeaders(),
      headersTimeout: 10_000,
      bodyTimeout: 10_000,
    });
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
  const res = await post<{
    response?: string;
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
    done_reason?: string;
  }>('/api/chat', {
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
  }, 600_000, model);

  const text = res.message?.content ?? res.response ?? '';
  const promptTokens = res.prompt_eval_count ?? 0;
  const completionTokens = res.eval_count ?? 0;
  const durationMs = Date.now() - started;

  // An answer that ran to the limit is the tail of a repetition loop, and reporting it as a
  // reading would present the loop's leftovers as what the provision says.
  if (res.done_reason === 'length' || completionTokens >= limit) {
    throw new EngineOverran(model, limit, promptTokens, completionTokens, durationMs);
  }
  if (!text.trim()) throw new EngineSilent(model, promptTokens, durationMs);

  return { text, promptTokens, completionTokens, durationMs, model };
}
