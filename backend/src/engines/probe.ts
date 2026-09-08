/**
 * What has to be true about an engine before a run is allowed to use it.
 *
 * Renting GPUs adds a failure a laptop does not have: two hosts serving different builds under one
 * tag. A run split across them is answered half by each, and the difference arrives as findings
 * rather than as an error. So the fingerprint -- family, parameter count, quantisation -- is read
 * from every host and they must agree. That check is exact, and it is the one that blocks a run.
 *
 * Batching is measured too, because reading two provisions at once changed 18 of 40 of them
 * (scripts/concurrency.ts). It is reported rather than enforced, and the reason is worth stating: a
 * worker reads one provision at a time and has its engine to itself, so there is never a second
 * request for the server to bundle with. That protection is structural, not a setting. The timing
 * here is a cross-check and would be a poor gate -- the same server measured 1.11x, then read above
 * the threshold once a second model was resident and memory was tight. --require-serial makes it
 * blocking, for an engine something else shares.
 */
import { request } from 'undici';
import { authHeaders } from './ollama.js';

/**
 * Two requests that finish together were run together; one that waited for the other was queued.
 * Measured 1.11x against a server set to batch and 2.11x against one set to serialise, same GPU.
 */
export const SERIAL_RATIO = 1.5;

export function batchesFrom(soloMs: number, pairMs: number[]): boolean {
  if (soloMs <= 0) return false;
  return Math.max(...pairMs) / soloMs < SERIAL_RATIO;
}

/** Family, size and quantisation. Two hosts that disagree here answer one run two ways. */
export interface Fingerprint {
  family: string;
  parameters: string;
  quantisation: string;
}

export interface EngineReport {
  host: string;
  reachable: boolean;
  /** Why the host cannot be used at all. */
  detail: string | null;
  /** Worth saying, but not a reason to refuse the host. */
  note: string | null;
  models: string[];
  hasModel: boolean;
  fingerprint: Fingerprint | null;
  /** Null when the timing did not run: an earlier check failed, or --quick was asked for. */
  batches: boolean | null;
  ratio: number | null;
  soloMs: number | null;
}

export function fingerprintOf(r: EngineReport): string | null {
  const f = r.fingerprint;
  return f ? [f.family, f.parameters, f.quantisation].join('/') : null;
}

/** The first host serving something other than what the first host serves, or null if they agree. */
export function mismatchedEngine(reports: EngineReport[]): EngineReport | null {
  const known = reports.filter((r) => r.fingerprint !== null);
  const first = known[0];
  if (!first) return null;
  return known.find((r) => fingerprintOf(r) !== fingerprintOf(first)) ?? null;
}

const sameModel = (a: string, b: string) => a.replace(/:latest$/, '') === b.replace(/:latest$/, '');

async function tags(host: string, timeoutMs: number): Promise<string[]> {
  const res = await request(`${host}/api/tags`, {
    headers: authHeaders(),
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    throw new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`);
  }
  const body = (await res.body.json()) as { models?: { name: string }[] };
  return (body.models ?? []).map((m) => m.name);
}

/** What the host is actually serving under that name, as opposed to what it is called. */
async function fingerprint(
  host: string,
  model: string,
  timeoutMs: number,
): Promise<Fingerprint | null> {
  try {
    const res = await request(`${host}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ model }),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
    if (res.statusCode >= 400) return null;
    const body = (await res.body.json()) as {
      details?: { family?: string; parameter_size?: string; quantization_level?: string };
    };
    const d = body.details ?? {};
    return {
      family: d.family ?? 'unknown',
      parameters: d.parameter_size ?? 'unknown',
      quantisation: d.quantization_level ?? 'unknown',
    };
  } catch {
    return null;
  }
}

/** One short deterministic generation, timed. The content is irrelevant; the clock is the point. */
async function timedCall(host: string, model: string, timeoutMs: number): Promise<number> {
  const started = Date.now();
  const res = await request(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      messages: [{ role: 'user', content: 'Count from 1 to 60, one number per line.' }],
      options: { temperature: 0, num_predict: 128 },
    }),
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) throw new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`);
  return Date.now() - started;
}

export interface ProbeOptions {
  /** Skip the timed part. Reachability, model presence and fingerprint only. */
  quick?: boolean;
  timeoutMs?: number;
}

/**
 * Ask one host to prove it can be used. Never throws: an unusable engine is a report, not an
 * exception, because the caller wants every host's verdict rather than the first failure.
 */
export async function probeEngine(
  host: string,
  model: string,
  opts: ProbeOptions = {},
): Promise<EngineReport> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const report: EngineReport = {
    host,
    reachable: false,
    detail: null,
    note: null,
    models: [],
    hasModel: false,
    fingerprint: null,
    batches: null,
    ratio: null,
    soloMs: null,
  };

  try {
    report.models = await tags(host, Math.min(timeoutMs, 20_000));
    report.reachable = true;
  } catch (err) {
    report.detail = `not answering: ${err instanceof Error ? err.message : String(err)}`;
    return report;
  }

  report.hasModel = report.models.some((m) => sameModel(m, model));
  if (!report.hasModel) {
    report.detail = `is not serving ${model}. Build it there, or drop the host.`;
    return report;
  }

  report.fingerprint = await fingerprint(host, model, Math.min(timeoutMs, 20_000));
  if (opts.quick) return report;

  try {
    // Twice, because one warm-up leaves the next call slow enough to blur the two cases.
    await timedCall(host, model, timeoutMs);
    await timedCall(host, model, timeoutMs);
    const first = await timedCall(host, model, timeoutMs);
    const second = await timedCall(host, model, timeoutMs);
    const solo = (first + second) / 2;
    const pair = await Promise.all([
      timedCall(host, model, timeoutMs),
      timedCall(host, model, timeoutMs),
    ]);
    report.soloMs = solo;
    report.ratio = Math.max(...pair) / solo;
    report.batches = batchesFrom(solo, pair);
    if (report.batches) {
      report.note =
        'ran two requests together. Harmless while one worker has this engine to itself; set ' +
        'OLLAMA_NUM_PARALLEL=1 there if anything else uses it.';
    }
  } catch (err) {
    report.detail = `would not answer a test prompt: ${err instanceof Error ? err.message : String(err)}`;
  }
  return report;
}

/** Usable means reachable and serving the model. Batching is reported, not disqualifying. */
export function usable(r: EngineReport, requireSerial = false): boolean {
  if (!r.reachable || !r.hasModel || r.detail !== null) return false;
  return !(requireSerial && r.batches === true);
}

export function describeReport(r: EngineReport): string {
  if (!r.reachable || !r.hasModel) return `${r.host}  ${r.detail}`;
  const what = fingerprintOf(r) ?? 'model details unavailable';
  const tail = r.note ? `\n    ${r.note}` : '';
  if (r.batches === null) return `${r.host}  ${what}, not timed${tail}`;
  const how = r.batches ? 'batches' : 'one at a time';
  return `${r.host}  ${what}  ${how} (${r.ratio!.toFixed(2)}x under two)${tail}`;
}
