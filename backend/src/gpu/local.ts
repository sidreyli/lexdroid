/**
 * The engine on this machine: whether Ollama is up, whether the engine is built, whether it is in
 * memory, and loading it before a run so the first provision is not also a cold start.
 *
 * The tag is built from `ollama/<model>.Modelfile`, the file the declaration names, so what this
 * machine serves and what a rented pod serves are one definition.
 */
import { spawn } from 'node:child_process';
import { request } from 'undici';
import { authHeaders } from '../engines/ollama.js';
import type { Engine } from '../engines/registry.js';
import { modelfileFor } from './runpod.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const LOCAL_HOST = 'http://127.0.0.1:11434';

export interface LocalStatus {
  host: string;
  up: boolean;
  version: string;
  /** The declared base, e.g. qwen3.8:27b-q4_K_M, is on disk. */
  pulled: boolean;
  /** The tag the pipeline asks for is built. */
  built: boolean;
  /** And sitting in memory now. */
  loaded: boolean;
  /** Free and total GPU memory as Ollama sees the loaded models, where it says. */
  loadedVramGb: number | null;
}

async function get<T>(host: string, path: string): Promise<T> {
  const res = await request(`${host}${path}`, { headers: authHeaders(), headersTimeout: 5_000, bodyTimeout: 5_000 });
  if (res.statusCode >= 400) {
    await res.body.dump();
    throw new Error(`HTTP ${res.statusCode}`);
  }
  return (await res.body.json()) as T;
}

export function baseOf(engine: Engine): string {
  return /^FROM\s+(\S+)/m.exec(modelfileFor(engine))?.[1] ?? '';
}

const sameTag = (a: string, b: string) => a === b || a === `${b}:latest` || `${a}:latest` === b;

export async function localStatus(engine: Engine, host = LOCAL_HOST): Promise<LocalStatus> {
  const out: LocalStatus = { host, up: false, version: '', pulled: false, built: false, loaded: false, loadedVramGb: null };
  try {
    out.version = (await get<{ version: string }>(host, '/api/version')).version;
    out.up = true;
  } catch {
    return out;
  }
  const base = baseOf(engine);
  const tags = (await get<{ models?: { name: string }[] }>(host, '/api/tags')).models ?? [];
  out.pulled = tags.some((m) => sameTag(m.name, base));
  out.built = tags.some((m) => sameTag(m.name, engine.model));
  const ps = (await get<{ models?: { name: string; size_vram?: number }[] }>(host, '/api/ps')).models ?? [];
  const loaded = ps.find((m) => sameTag(m.name, engine.model));
  out.loaded = Boolean(loaded);
  out.loadedVramGb = loaded?.size_vram ? loaded.size_vram / 1e9 : null;
  return out;
}

export type Progress = (stage: string, detail: string, fraction: number | null) => void;

/** Pull the base, build the tag from the declared Modelfile, and load it. Safe to repeat. */
export async function loadLocal(engine: Engine, progress: Progress, host = LOCAL_HOST): Promise<void> {
  const status = await localStatus(engine, host);
  if (!status.up) throw new Error(`Ollama is not answering at ${host}. Start it, then load again.`);
  const base = baseOf(engine);
  if (!status.pulled) await pull(host, base, progress);
  if (!status.built) {
    progress('building', engine.model, null);
    const dir = mkdtempSync(join(tmpdir(), 'lex-'));
    const file = join(dir, 'Modelfile');
    writeFileSync(file, modelfileFor(engine));
    await new Promise<void>((resolve, reject) => {
      const child = spawn('ollama', ['create', engine.model, '-f', file], { shell: false, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`ollama create exited ${code}`))));
    });
  }
  progress('loading', engine.model, null);
  const res = await request(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model: engine.model, prompt: 'ok', stream: false, think: false, keep_alive: '30m', options: { num_predict: 1 } }),
    headersTimeout: 900_000,
    bodyTimeout: 900_000,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) throw new Error(`loading ${engine.model}: ${text.slice(0, 300)}`);
  progress('ready', engine.model, 1);
}

/** Take the engine out of memory, which is what frees the GPU for the other one. */
export async function unloadLocal(engine: Engine, host = LOCAL_HOST): Promise<void> {
  const res = await request(`${host}/api/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model: engine.model, keep_alive: 0 }),
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });
  await res.body.dump();
}

async function pull(host: string, model: string, progress: Progress): Promise<void> {
  const res = await request(`${host}/api/pull`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ model, stream: true }),
    headersTimeout: 60_000,
    bodyTimeout: 3_600_000,
  });
  let buffered = '';
  for await (const chunk of res.body) {
    buffered += chunk.toString();
    let nl: number;
    while ((nl = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, nl).trim();
      buffered = buffered.slice(nl + 1);
      if (!line) continue;
      const event = JSON.parse(line) as { status?: string; total?: number; completed?: number; error?: string };
      if (event.error) throw new Error(`pulling ${model}: ${event.error}`);
      if (event.total && event.completed) {
        progress('pulling', `${model}: ${(event.completed / 1e9).toFixed(1)} of ${(event.total / 1e9).toFixed(1)} GB`, event.completed / event.total);
      }
    }
  }
}
