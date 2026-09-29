/**
 * Renting a GPU for one engine, from the interface.
 *
 * Up to MAX_PODS pods per engine, named for it, and nothing about them kept on this machine: RunPod's
 * own record of each pod is the record. The token is in each pod's environment, which is read back
 * through the same API that created it -- anyone who can read it there could already stop or start
 * the pod, so writing it to a file here would add a copy and no protection. An engine's pods share
 * one token, so a run reading across all of them authenticates the same way it does on one.
 *
 * The pod serves Ollama through `infra/runpod/pod.py` on RunPod's HTTPS proxy. Ollama itself stays
 * bound to localhost on the pod.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import { envPath, parseEnv } from '../env.js';
import type { Engine } from '../engines/registry.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REST = 'https://rest.runpod.io/v1';
const GRAPHQL = 'https://api.runpod.io/graphql';
const IMAGE = 'runpod/base:1.0.2-ubuntu2204';
const OLLAMA_VERSION = '0.34.4';
const PORT = 8000;
/** The ceiling on one GPU's rent. A pod that comes back dearer is given back at once. */
export const DEFAULT_MAX_USD_PER_HOUR = 0.34;
/**
 * The most pods one engine may hold. A pillar's reads divide across them, one read per pod at a
 * time, so four cut the slowest stage of the live test about fourfold for four times the rent.
 * LEXDROID_MAX_PODS raises it for a command that runs several economies side by side, each on
 * pods of its own.
 */
export const MAX_PODS = Math.max(1, Number(process.env['LEXDROID_MAX_PODS']) || 4);

export interface Rental {
  provider: 'RunPod';
  /** The least GPU memory the engine fits in at its declared context. */
  minGpuMemoryGb: number;
  maxUsdPerHour?: number;
}

export type Cloud = 'COMMUNITY' | 'SECURE';

export interface Offer {
  gpu: string;
  memoryGb: number;
  usdPerHour: number;
  cloud: Cloud;
}

export interface Pod {
  id: string;
  engineId: string;
  name: string;
  gpu: string;
  usdPerHour: number;
  /** When it started billing, ISO. */
  since: string;
  running: boolean;
  url: string;
  token: string;
}

export interface PodStatus {
  stage: 'booting' | 'starting' | 'installing' | 'pulling' | 'building' | 'loading' | 'ready' | 'failed';
  detail: string;
  progress: number | null;
  gpu: string;
}

/** The key, from the environment or the root `.env`'s `api` line. Never logged, never returned. */
export function runpodKey(root = REPO_ROOT): string {
  const fromEnv = process.env['RUNPOD_API_KEY'];
  if (fromEnv) return fromEnv;
  const path = envPath(root);
  const key = existsSync(path) ? parseEnv(readFileSync(path, 'utf8')).get('api') : undefined;
  if (!key) throw new Error('No RunPod key: set RUNPOD_API_KEY, or an `api=` line in the root .env');
  return key;
}

/** The first pod keeps the name one pod always had; the rest are numbered from 2. */
export function podName(engineId: string, slot = 1): string {
  return slot === 1 ? `lexdroid-${engineId}` : `lexdroid-${engineId}-${slot}`;
}

/** The slot a pod's name says it holds for the engine, or null when it is not one of its pods. */
export function slotOf(name: string, engineId: string): number | null {
  if (name === podName(engineId)) return 1;
  const prefix = `${podName(engineId)}-`;
  if (!name.startsWith(prefix)) return null;
  const n = name.slice(prefix.length);
  return /^[2-9]\d*$/.test(n) ? Number(n) : null;
}

/** The lowest free slots, as many as are asked for. */
export function freeSlots(taken: readonly number[], count: number): number[] {
  const out: number[] = [];
  for (let slot = 1; out.length < count; slot++) if (!taken.includes(slot)) out.push(slot);
  return out;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await request(`${REST}${path}`, {
    method: method as 'GET',
    headers: { authorization: `Bearer ${runpodKey()}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) throw new Error(`RunPod ${method} ${path}: HTTP ${res.statusCode} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * What a GPU with room for the engine costs now, within the ceiling: the community tier cheapest
 * first, then the secure tier. The community tier is often out of the larger cards -- every 24 GB
 * one was taken the first time Engine B was started -- and a secure card under the ceiling is
 * better than no run.
 */
export async function offers(rental: Rental): Promise<Offer[]> {
  const res = await request(GRAPHQL, {
    method: 'POST',
    headers: { authorization: `Bearer ${runpodKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      query: '{ gpuTypes { id memoryInGb communityPrice securePrice communityCloud secureCloud } }',
    }),
    headersTimeout: 30_000,
    bodyTimeout: 30_000,
  });
  const json = (await res.body.json()) as {
    data?: {
      gpuTypes?: {
        id: string;
        memoryInGb: number;
        communityPrice: number | null;
        securePrice: number | null;
        communityCloud: boolean;
        secureCloud: boolean;
      }[];
    };
  };
  const cap = rental.maxUsdPerHour ?? DEFAULT_MAX_USD_PER_HOUR;
  const fits = (json.data?.gpuTypes ?? []).filter((g) => g.memoryInGb >= rental.minGpuMemoryGb);
  const tier = (cloud: Cloud): Offer[] =>
    fits
      .map((g) => ({
        gpu: g.id,
        memoryGb: g.memoryInGb,
        usdPerHour: (cloud === 'COMMUNITY' ? g.communityPrice : g.securePrice) ?? 0,
        cloud,
        offered: cloud === 'COMMUNITY' ? g.communityCloud : g.secureCloud,
      }))
      .filter((o) => o.offered && o.usdPerHour > 0 && o.usdPerHour <= cap)
      // Price decides, and memory only has to be enough.
      .sort((x, y) => x.usdPerHour - y.usdPerHour || y.memoryGb - x.memoryGb)
      .map(({ offered: _offered, ...o }) => o);
  return [...tier('COMMUNITY'), ...tier('SECURE')];
}

interface RawPod {
  id: string;
  name: string;
  desiredStatus?: string;
  costPerHr?: number;
  adjustedCostPerHr?: number;
  lastStartedAt?: string;
  createdAt?: string;
  env?: Record<string, string>;
  machine?: { gpuTypeId?: string };
  gpu?: { id?: string; displayName?: string };
}

function toPod(p: RawPod): Pod {
  return {
    id: p.id,
    engineId: p.env?.['LEX_ENGINE'] ?? p.name.replace(/^lexdroid-/, ''),
    name: p.name,
    gpu: p.machine?.gpuTypeId ?? p.gpu?.displayName ?? p.gpu?.id ?? '',
    usdPerHour: p.adjustedCostPerHr ?? p.costPerHr ?? 0,
    since: (p.lastStartedAt ?? p.createdAt ?? '').replace(' +0000 UTC', 'Z').replace(' ', 'T'),
    running: p.desiredStatus === 'RUNNING',
    url: `https://${p.id}-${PORT}.proxy.runpod.net`,
    token: p.env?.['LEX_TOKEN'] ?? '',
  };
}

/** The pods this interface started. Pods named otherwise are not ours. */
export async function listPods(): Promise<Pod[]> {
  const all = await call<RawPod[]>('GET', '/pods');
  return all.filter((p) => p.name.startsWith('lexdroid-') && p.env?.['LEX_TOKEN']).map(toPod);
}

/** Every pod rented for the engine, in slot order. */
export async function podsFor(engineId: string): Promise<Pod[]> {
  return (await listPods())
    .filter((p) => p.engineId === engineId && slotOf(p.name, engineId) !== null)
    .sort((a, b) => slotOf(a.name, engineId)! - slotOf(b.name, engineId)!);
}

export async function podFor(engineId: string): Promise<Pod | undefined> {
  return (await podsFor(engineId))[0];
}

/** What the pod says it is doing. Unreachable means it is still booting, not that it has failed. */
export async function podStatus(pod: Pod): Promise<PodStatus> {
  try {
    const res = await request(`${pod.url}/lex/status`, {
      headers: { authorization: `Bearer ${pod.token}` },
      headersTimeout: 8_000,
      bodyTimeout: 8_000,
    });
    if (res.statusCode !== 200) {
      await res.body.dump();
      return { stage: 'booting', detail: `the pod answered ${res.statusCode}`, progress: null, gpu: pod.gpu };
    }
    const s = (await res.body.json()) as Partial<PodStatus> & { error?: string | null };
    return {
      stage: (s.stage as PodStatus['stage']) ?? 'booting',
      detail: s.error ?? s.detail ?? '',
      progress: s.progress ?? null,
      gpu: s.gpu || pod.gpu,
    };
  } catch {
    return { stage: 'booting', detail: 'the container is starting', progress: null, gpu: pod.gpu };
  }
}

export function modelfileFor(engine: Engine, root = REPO_ROOT): string {
  const path = join(root, 'ollama', `${engine.model}.Modelfile`);
  if (!existsSync(path)) throw new Error(`${engine.id} has no Modelfile at ollama/${engine.model}.Modelfile`);
  return readFileSync(path, 'utf8');
}

/** What is sent to RunPod to create the pod. Separate so it can be checked without renting. */
export function createBody(
  engine: Engine,
  rental: Rental,
  gpus: string[],
  token: string,
  root = REPO_ROOT,
  cloud: Cloud = 'COMMUNITY',
  slot = 1,
) {
  const script = readFileSync(join(root, 'infra', 'runpod', 'pod.py'));
  return {
    name: podName(engine.id, slot),
    imageName: IMAGE,
    gpuTypeIds: gpus,
    gpuTypePriority: 'custom',
    gpuCount: 1,
    cloudType: cloud,
    // The weights, the embedding model and Ollama, with room to spare.
    containerDiskInGb: rental.minGpuMemoryGb >= 24 ? 60 : 40,
    volumeInGb: 0,
    ports: [`${PORT}/http`],
    env: {
      LEX_ENGINE: engine.id,
      LEX_TOKEN: token,
      LEX_TAG: engine.model,
      LEX_MODELFILE: Buffer.from(modelfileFor(engine, root)).toString('base64'),
      LEX_EMBED: 'bge-m3',
      LEX_OLLAMA: OLLAMA_VERSION,
      LEX_POD: script.toString('base64'),
    },
    dockerStartCmd: ['bash', '-c', 'echo "$LEX_POD" | base64 -d > /root/pod.py && exec python3 /root/pod.py'],
  };
}

export interface Rented {
  /** Every pod the engine now has, in slot order, including any it had before. */
  pods: Pod[];
  /** Why fewer were rented than asked for, when that happened. */
  shortfall: string | null;
}

/**
 * Bring the engine up to `count` GPUs, renting only the ones it lacks. Returns as soon as they
 * exist; each pod then installs and loads the engine itself, which `podStatus` reports.
 *
 * The price is checked twice: the offers are filtered by the ceiling before asking, and each pod
 * RunPod actually placed is checked after, because what it bills can differ from what it listed.
 * Stock runs out a card at a time, so a partial rental is kept and said rather than given back:
 * three pods of four still read a pillar three times faster than one.
 */
export async function startPods(engine: Engine, rental: Rental, count = 1): Promise<Rented> {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PODS) {
    throw new Error(`Between 1 and ${MAX_PODS} GPUs per engine, not ${count}`);
  }
  const existing = await podsFor(engine.id);
  if (existing.length >= count) return { pods: existing, shortfall: null };
  const cap = rental.maxUsdPerHour ?? DEFAULT_MAX_USD_PER_HOUR;
  const available = await offers(rental);
  if (available.length === 0) {
    throw new Error(`No GPU with ${rental.minGpuMemoryGb} GB or more is listed at $${cap.toFixed(2)}/hr or less`);
  }
  const token = existing.find((p) => p.token)?.token ?? randomBytes(32).toString('base64url');
  const slots = freeSlots(
    existing.map((p) => slotOf(p.name, engine.id)!),
    count - existing.length,
  );
  const pods = [...existing];
  let shortfall: string | null = null;
  for (const slot of slots) {
    try {
      pods.push(await rentOne(engine, rental, available, token, slot, cap));
    } catch (err) {
      shortfall = `${pods.length} of ${count} rented: ${err instanceof Error ? err.message : String(err)}`;
      break;
    }
  }
  if (pods.length === 0) throw new Error(shortfall ?? 'No GPU could be rented');
  return { pods, shortfall };
}

/** One pod, into one slot: the community tier first, then the secure one. */
async function rentOne(
  engine: Engine,
  rental: Rental,
  available: Offer[],
  token: string,
  slot: number,
  cap: number,
): Promise<Pod> {
  let created: RawPod | undefined;
  let lastError: unknown;
  for (const cloud of ['COMMUNITY', 'SECURE'] as const) {
    const gpus = available.filter((o) => o.cloud === cloud).slice(0, 8).map((o) => o.gpu);
    if (gpus.length === 0) continue;
    try {
      created = await call<RawPod>('POST', '/pods', createBody(engine, rental, gpus, token, REPO_ROOT, cloud, slot));
      break;
    } catch (err) {
      // Out of stock on this tier is the expected failure; anything else is not.
      lastError = err;
      if (!/no instances currently available/i.test(String(err))) throw err;
    }
  }
  if (!created) {
    throw new Error(
      `No GPU with ${rental.minGpuMemoryGb} GB or more is free under $${cap.toFixed(2)}/hr on either tier ` +
        `right now; try again in a few minutes (${String(lastError).slice(0, 120)})`,
    );
  }
  const pod = toPod({ ...created, env: { ...created.env, LEX_TOKEN: token, LEX_ENGINE: engine.id } });
  if (pod.usdPerHour > cap) {
    await deletePod(pod.id);
    throw new Error(`RunPod placed ${pod.gpu} at $${pod.usdPerHour}/hr, over the $${cap.toFixed(2)} ceiling; given back`);
  }
  return pod;
}

export async function deletePod(id: string): Promise<void> {
  await call('DELETE', `/pods/${id}`);
}

/**
 * Give back the engine's pods, or the one named. Only a pod this interface named for the engine is
 * ever touched: an id that is not one of them stops nothing.
 */
export async function stopPods(engineId: string, podId?: string): Promise<Pod[]> {
  const pods = (await podsFor(engineId)).filter((p) => !podId || p.id === podId);
  await Promise.all(pods.map((p) => deletePod(p.id)));
  return pods;
}

/** Rent so far, from when the pod last started billing. */
export function spentUsd(pod: Pod, now = Date.now()): number {
  const since = Date.parse(pod.since);
  if (!Number.isFinite(since)) return 0;
  return (Math.max(0, now - since) / 3_600_000) * pod.usdPerHour;
}
