/**
 * The second engine: open weights, somebody else's hardware.
 *
 * Everything the pipeline asks a model for went to Ollama's own `/api/chat`, which no hosted
 * provider serves. So Engine B could be declared in a file and chosen in the interface and then
 * had nowhere to send a request, which is why every run in the store was answered by Engine A and
 * no engine comparison had ever been produced.
 *
 * This speaks the OpenAI chat-completions shape instead, because that is what the open-weights
 * hosts converged on -- Groq, Together, Fireworks, DeepInfra and Ollama's own `/v1` all accept it.
 * The engine stays open weights: what is hosted is the hardware, not the model, and Section 3's
 * claim is about the weights. The pipeline is told nothing about any of this. It asks `generate`
 * for a schema-constrained answer at temperature zero and gets the same `Generated` back, so the
 * switch between engines really is a switch and not a second code path with its own bugs.
 *
 * Configured from the environment, set by the run from the engine registry, never from a file
 * committed to the repository: an API key written to disk is a key in a backup.
 */
import { request } from 'undici';
import { OllamaUnavailable } from './errors.js';

export interface HostedConfig {
  /** The API root, without a trailing slash. `/chat/completions` is appended. */
  baseUrl: string;
  model: string;
  apiKey: string | null;
  provider: string;
}

/** Whether this process is pointed at a hosted engine rather than a local one. */
export function hostedConfig(): HostedConfig | null {
  const baseUrl = process.env['LEXDROID_HOSTED_BASE_URL']?.trim().replace(/\/+$/, '');
  const model = process.env['LEXDROID_HOSTED_MODEL']?.trim();
  if (!baseUrl || !model) return null;
  return {
    baseUrl,
    model,
    apiKey: process.env['LEXDROID_HOSTED_API_KEY']?.trim() || null,
    provider: process.env['LEXDROID_HOSTED_PROVIDER']?.trim() || new URL(baseUrl).host,
  };
}

export interface HostedAnswer {
  text: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  model: string;
  /** Why the model stopped. 'length' is a runaway and the caller throws on it, as it does locally. */
  finishReason: string | null;
}

/**
 * A JSON Schema, as the chat-completions API wants it.
 *
 * Ollama takes a bare schema in `format`; this API wants it wrapped and named, and wants
 * `additionalProperties: false` before it will enforce the shape at all. The wrapping is done here
 * so that every caller keeps writing the one schema it already writes.
 */
function responseFormat(schema: unknown): Record<string, unknown> | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const strict = closed(schema) as Record<string, unknown>;
  return {
    type: 'json_schema',
    json_schema: { name: 'reading', schema: strict, strict: true },
  };
}

/**
 * The schema with `additionalProperties: false` on every object in it, not only the outermost.
 *
 * Groq refuses a strict schema with any open object, and the reading schema's findings are objects
 * inside an array: closing only the top level had every reading on Engine B rejected with a 400
 * before a single provision was read.
 */
function closed(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const out: Record<string, unknown> = { ...(schema as Record<string, unknown>) };
  // Walked by keyword, so a property that happens to be called "type" or "properties" is a name
  // and never mistaken for a schema.
  if (out['properties'] && typeof out['properties'] === 'object') {
    // Strict mode also wants every property required. One the schema left optional is required
    // here but allowed to be null, which is what the reader's normaliser already makes of an
    // absent field -- so the answer means the same whichever engine gave it.
    const required = new Set(Array.isArray(out['required']) ? (out['required'] as string[]) : []);
    const props = out['properties'] as Record<string, unknown>;
    out['properties'] = Object.fromEntries(
      Object.entries(props).map(([name, s]) => [name, required.has(name) ? closed(s) : nullable(closed(s))]),
    );
    out['required'] = Object.keys(props);
  }
  if (out['items'] !== undefined) out['items'] = Array.isArray(out['items']) ? out['items'].map(closed) : closed(out['items']);
  for (const k of ['anyOf', 'oneOf', 'allOf'] as const) {
    if (Array.isArray(out[k])) out[k] = (out[k] as unknown[]).map(closed);
  }
  const type = out['type'];
  if (type === 'object' || (Array.isArray(type) && type.includes('object')) || out['properties']) {
    out['additionalProperties'] = false;
  }
  return out;
}

/** The JSON a schema refusal carries in `failed_generation`, if it is JSON at all. */
function failedGeneration(body: string): string | null {
  try {
    const g = (JSON.parse(body) as { error?: { failed_generation?: unknown } }).error?.failed_generation;
    if (typeof g !== 'string') return null;
    JSON.parse(g);
    return g;
  } catch {
    return null;
  }
}

/** A schema that also accepts null. */
function nullable(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
  const s = { ...(schema as Record<string, unknown>) };
  if (Array.isArray(s['enum']) && !(s['enum'] as unknown[]).includes(null)) s['enum'] = [...(s['enum'] as unknown[]), null];
  const t = s['type'];
  if (typeof t === 'string' && t !== 'null') s['type'] = [t, 'null'];
  else if (Array.isArray(t) && !t.includes('null')) s['type'] = [...t, 'null'];
  else if (t === undefined && !s['enum']) return { anyOf: [s, { type: 'null' }] };
  return s;
}

export async function hostedGenerate(
  prompt: string,
  system: string,
  opts: { model?: string; schema?: unknown; temperature?: number; maxOutputTokens?: number } = {},
): Promise<HostedAnswer> {
  const config = hostedConfig();
  if (!config) throw new Error('no hosted engine is configured');

  const model = opts.model ?? config.model;
  const started = Date.now();
  const format = responseFormat(opts.schema);

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    temperature: opts.temperature ?? 0,
    ...(opts.maxOutputTokens ? { max_tokens: opts.maxOutputTokens } : {}),
    ...(format ? { response_format: format } : {}),
    stream: false,
  };

  // A rate limit is the host telling us when to ask again, not a host that has gone. Groq's free
  // tier allows 1,000 output tokens a minute, so a reading run meets it every few provisions; with
  // no wait the first 429 retired the only engine and ended the pillar. The wait is the host's own
  // (retry-after, or "try again in 28.9s" in the body), bounded so a daily quota still fails.
  for (let attempt = 0; ; attempt += 1) {
    let answer;
    try {
      answer = await hostedOnce(config, body, model, started);
    } catch (err) {
      const reserved = (body as { max_tokens?: number }).max_tokens;
      const smaller = err instanceof TooLarge && reserved ? reserved - err.excess - 100 : 0;
      if (!(err instanceof TooLarge) || smaller < MIN_RESERVED_TOKENS) {
        throw err instanceof TooLarge
          ? new Error(`${config.provider} will never accept this request on the current plan: ${err.detail.slice(0, 300)}`)
          : err;
      }
      (body as { max_tokens?: number }).max_tokens = smaller;
      continue;
    }
    if (answer.retryAfterMs === null) return answer.result;
    if (attempt >= RATE_LIMIT_RETRIES || answer.retryAfterMs > MAX_RATE_LIMIT_WAIT_MS) {
      throw new OllamaUnavailable(`${config.provider} answered 429 (rate limited) ${attempt + 1} times; last asked to wait ${Math.round(answer.retryAfterMs / 1000)}s`, config.baseUrl);
    }
    if (attempt % 5 === 4) console.warn(`  ${config.provider}: rate limited ${attempt + 1} times in a row; waiting ${Math.round(answer.retryAfterMs / 1000)}s`);
    await new Promise((r) => setTimeout(r, answer.retryAfterMs! + 500));
  }
}

const RATE_LIMIT_RETRIES = 60;

/** Below this an answer has no room to be one, and the prompt alone is the problem. */
const MIN_RESERVED_TOKENS = 800;

/** A request over the per-minute limit, by this many tokens, whatever the wait. */
class TooLarge extends Error {
  constructor(
    readonly excess: number,
    readonly detail: string,
  ) {
    super(`request too large by ${excess} tokens`);
  }
}
const MAX_RATE_LIMIT_WAIT_MS = 5 * 60_000;

/** How long a 429 asks us to wait: the header if sent, else the body's "try again in 28.9s". */
function retryAfter(header: string | string[] | undefined, text: string): number {
  const h = Array.isArray(header) ? header[0] : header;
  if (h && Number.isFinite(Number(h))) return Number(h) * 1000;
  const m = /try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i.exec(text);
  if (m) return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 1000;
  return 15_000;
}

async function hostedOnce(
  config: NonNullable<ReturnType<typeof hostedConfig>>,
  body: unknown,
  model: string,
  started: number,
): Promise<{ result: HostedAnswer; retryAfterMs: null } | { result: null; retryAfterMs: number }> {
  let res;
  try {
    res = await request(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      headersTimeout: 600_000,
      bodyTimeout: 600_000,
    });
  } catch (err) {
    // The same class the local client throws, so the pool retires a dead host the same way and
    // the run does not need to know which kind of engine went away.
    throw new OllamaUnavailable(err instanceof Error ? err.message : String(err), config.baseUrl);
  }

  const text = await res.body.text();
  // "Request too large" is a 429 that no wait cures: the account's per-minute limit is smaller than
  // one request. Qwen on Groq's free tier refuses every reading this way (1,000 output tokens a
  // minute), so it is said at once rather than waited on for five minutes a provision.
  //
  // Except where only the output reservation makes it too large. Groq counts the prompt plus
  // max_tokens against its 8,000 tokens a minute, so a long provision asking for 4,096 back is
  // refused outright; the caller can ask again reserving less, and an answer that then runs long
  // is split by the reader like any other overrun.
  if ((res.statusCode === 429 || res.statusCode === 413) && /request too large/i.test(text)) {
    const m = /tokens per minute \(TPM\): Limit (\d+), Requested (\d+)/i.exec(text);
    if (m) throw new TooLarge(Number(m[2]) - Number(m[1]), text);
    throw new Error(`${config.provider} will never accept this request on the current plan: ${text.slice(0, 300)}`);
  }
  if (res.statusCode === 429) return { result: null, retryAfterMs: retryAfter(res.headers['retry-after'], text) };
  if (res.statusCode >= 500) {
    throw new OllamaUnavailable(`${config.provider} answered ${res.statusCode}`, config.baseUrl);
  }
  // A reading the host checked against the schema after writing it, rather than while, and refused
  // for a field it left out. The answer is in the refusal, whole, and an absent field is what the
  // reader's normaliser makes null anyway; so it is kept. gpt-oss on Groq omits optional fields
  // this way, and each refusal was killing the pillar over a missing `placeWords`. Only JSON that
  // parses is kept -- a generation cut off mid-document is still an error.
  if (res.statusCode === 400 && /json_validate_failed/.test(text)) {
    const kept = failedGeneration(text);
    if (kept !== null) {
      return {
        retryAfterMs: null,
        result: { text: kept, promptTokens: 0, completionTokens: 0, durationMs: Date.now() - started, model, finishReason: 'stop' },
      };
    }
  }
  if (res.statusCode >= 400) {
    // A 4xx is our request, not their availability, and retrying it on another host would just
    // ask the same bad question again. Surfaced with the body, which is where the reason is.
    throw new Error(`${config.provider} rejected the request (${res.statusCode}): ${text.slice(0, 400)}`);
  }

  let parsed: {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    throw new Error(`${config.provider} returned something that is not JSON: ${text.slice(0, 200)}`);
  }

  const choice = parsed.choices?.[0];
  return {
    retryAfterMs: null,
    result: {
      text: choice?.message?.content ?? '',
      promptTokens: parsed.usage?.prompt_tokens ?? 0,
      completionTokens: parsed.usage?.completion_tokens ?? 0,
      durationMs: Date.now() - started,
      model,
      finishReason: choice?.finish_reason ?? null,
    },
  };
}

/** Whether the host answers at all, and with the model it was asked for. */
export async function probeHosted(): Promise<{ ok: boolean; detail: string }> {
  const config = hostedConfig();
  if (!config) return { ok: false, detail: 'no hosted engine configured' };
  try {
    const answer = await hostedGenerate('Reply with the word ready.', 'You answer in one word.', {
      // Room for a reasoning model to think before its one word: gpt-oss spent 16 tokens thinking
      // and answered with nothing, which read as an engine that does not answer.
      maxOutputTokens: 512,
    });
    return answer.text.trim()
      ? { ok: true, detail: `${config.provider} / ${config.model} answered` }
      : { ok: false, detail: `${config.provider} answered with nothing` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}
