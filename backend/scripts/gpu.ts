/**
 * The engines' GPUs, for the interface: what each engine can run on, whether it is ready, and the
 * buttons behind "load", "start" and "stop". Every command prints one line of JSON.
 *
 *   gpu status [--offers]         every declared engine, on this machine and rented
 *   gpu load   --engine ID        pull, build and load it on this machine (writes progress)
 *   gpu unload --engine ID        take it out of this machine's GPU memory
 *   gpu start  --engine ID        rent a GPU for it; the pod then loads the engine itself
 *   gpu stop   --engine ID        give that GPU back
 *
 * No token and no key is ever printed. The pod's token stays in RunPod's record of the pod, and the
 * fleet reads it from there when a run is started on it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/env.js';
import { findEngine, loadEngines, type Engine } from '../src/engines/registry.js';
import { LOCAL_HOST, loadLocal, localStatus, unloadLocal } from '../src/gpu/local.js';
import { offers, podFor, podStatus, spentUsd, startPod, stopPod, type Pod } from '../src/gpu/runpod.js';

loadEnv();

const PROGRESS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gpu');

function progressPath(engineId: string): string {
  return join(PROGRESS_DIR, `${engineId}-local.json`);
}

function readProgress(engineId: string): unknown {
  const path = progressPath(engineId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeProgress(engineId: string, value: object): void {
  mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(progressPath(engineId), JSON.stringify({ ...value, at: new Date().toISOString() }));
}

/** This machine's GPU memory, in GB, where nvidia-smi can say. */
function localGpu(): { name: string; memoryGb: number } | null {
  try {
    const line = execFileSync('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], {
      encoding: 'utf8',
      timeout: 10_000,
    })
      .split('\n')[0]!
      .trim();
    const [name, mib] = line.split(',').map((x) => x.trim());
    return { name: name ?? '', memoryGb: Math.round(Number(mib) / 1024) };
  } catch {
    return null;
  }
}

function publicPod(pod: Pod) {
  const { token: _token, ...rest } = pod;
  return { ...rest, spentUsd: Number(spentUsd(pod).toFixed(4)) };
}

/** RunPod's listing omits the card; the pod names it itself once it is up. */
async function withStatus(pod: Pod) {
  const st = await podStatus(pod);
  return { ...publicPod(pod), gpu: pod.gpu || st.gpu.split(',')[0]!.trim(), status: st };
}

async function status(withOffers: boolean) {
  const gpu = localGpu();
  const engines = loadEngines().engines.filter((e) => e.declared);
  const out = [];
  for (const e of engines) {
    const needs = e.rented?.minGpuMemoryGb ?? 0;
    // Declared with a host of its own means this machine already serves it; the rental minimum
    // carries headroom a laptop that runs the engine every day does not need.
    const fitsHere = e.hosts.length > 0 || (gpu ? gpu.memoryGb >= needs : true);
    const local = e.hosts.length > 0 || fitsHere ? await localStatus(e, e.hosts[0] ?? LOCAL_HOST).catch(() => null) : null;
    let rented: object | null = null;
    if (e.rented) {
      let pod: Pod | undefined;
      let error: string | null = null;
      try {
        pod = await podFor(e.id);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      rented = {
        ...e.rented,
        pod: pod ? await withStatus(pod) : null,
        offers: withOffers && !pod ? await offers(e.rented).catch(() => []) : undefined,
        error,
      };
    }
    out.push({
      id: e.id,
      label: e.label,
      model: e.model,
      checkpoint: e.checkpoint,
      local: local && { ...local, fits: fitsHere, needsGb: needs, progress: readProgress(e.id) },
      rented,
    });
  }
  return { gpu, engines: out };
}

function engineArg(argv: string[]): Engine {
  const i = argv.indexOf('--engine');
  const id = i >= 0 ? argv[i + 1] : undefined;
  const engine = id ? findEngine(id) : undefined;
  if (!engine || !engine.declared) throw new Error(`No declared engine ${id ?? '(none given)'}`);
  return engine;
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case 'status':
      console.log(JSON.stringify(await status(rest.includes('--offers'))));
      return;
    case 'load': {
      const e = engineArg(rest);
      writeProgress(e.id, { stage: 'starting', detail: e.model, fraction: null });
      try {
        await loadLocal(e, (stage, detail, fraction) => writeProgress(e.id, { stage, detail, fraction }), e.hosts[0] ?? LOCAL_HOST);
      } catch (err) {
        writeProgress(e.id, { stage: 'failed', detail: err instanceof Error ? err.message : String(err), fraction: null });
        throw err;
      }
      console.log(JSON.stringify({ ok: true }));
      return;
    }
    case 'unload': {
      const e = engineArg(rest);
      await unloadLocal(e, e.hosts[0] ?? LOCAL_HOST);
      writeProgress(e.id, { stage: 'unloaded', detail: e.model, fraction: null });
      console.log(JSON.stringify({ ok: true }));
      return;
    }
    case 'start': {
      const e = engineArg(rest);
      if (!e.rented) throw new Error(`${e.label} is not declared as rentable`);
      console.log(JSON.stringify({ ok: true, pod: publicPod(await startPod(e, e.rented)) }));
      return;
    }
    case 'stop': {
      const e = engineArg(rest);
      const pod = await stopPod(e.id);
      console.log(JSON.stringify({ ok: true, stopped: pod ? publicPod(pod) : null }));
      return;
    }
    default:
      throw new Error('usage: gpu status [--offers] | load|unload|start|stop --engine ID');
  }
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
