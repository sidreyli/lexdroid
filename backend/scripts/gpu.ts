/**
 * The engines' GPUs, for the interface: what each engine can run on, whether it is ready, and the
 * buttons behind "load", "start" and "stop". Every command prints one line of JSON.
 *
 *   gpu status [--offers]         every declared engine, on this machine and rented
 *   gpu load   --engine ID        pull, build and load it on this machine (writes progress)
 *   gpu unload --engine ID        take it out of this machine's GPU memory
 *   gpu start  --engine ID [--pods N]   rent GPUs for it, up to N in all (default 1, at most 4);
 *                                       each pod then loads the engine itself
 *   gpu stop   --engine ID [--pod POD]  give its GPUs back, or only the one named
 *   gpu cap    --engine ID --usd N|declared   the most one of its pods may cost an hour, on this
 *                                       machine; "declared" goes back to engines.json's
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
import {
  DEFAULT_MAX_USD_PER_HOUR,
  MAX_PODS,
  effectiveRental,
  offers,
  podStatus,
  podsFor,
  setPriceCap,
  spentUsd,
  startPods,
  stopPods,
  type Pod,
} from '../src/gpu/runpod.js';

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

/** A GPU this machine has, and the memory it can use. On Apple silicon that memory is shared. */
type LocalGpu = { name: string; memoryGb: number; shared?: boolean };

/** This machine's GPU: an NVIDIA card where nvidia-smi can say, otherwise an Apple silicon chip. */
function localGpu(): LocalGpu | null {
  return nvidiaGpu() ?? appleGpu();
}

function nvidiaGpu(): LocalGpu | null {
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

/**
 * An M-series Mac has no nvidia-smi, yet Ollama runs on its GPU through Metal. The GPU draws on
 * the machine's unified memory, so the whole of it is what a model competes for. Read from sysctl,
 * which reports the chip even when Node itself runs under Rosetta; an Intel Mac names an Intel CPU
 * and is left as having no GPU this can use.
 */
function appleGpu(): LocalGpu | null {
  if (process.platform !== 'darwin') return null;
  try {
    const read = (key: string) => execFileSync('sysctl', ['-n', key], { encoding: 'utf8', timeout: 5_000 }).trim();
    const name = read('machdep.cpu.brand_string');
    if (!/^Apple M\d/.test(name)) return null;
    const bytes = Number(read('hw.memsize'));
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    return { name, memoryGb: Math.round(bytes / 1024 ** 3), shared: true };
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
    // Reported even when the engine does not fit, marked so, which lets the panel say why this
    // machine is out rather than only greying it. Asking Ollama for its state is a local call.
    const local = await localStatus(e, e.hosts[0] ?? LOCAL_HOST).catch(() => null);
    let rented: object | null = null;
    if (e.rented) {
      let pods: Pod[] = [];
      let error: string | null = null;
      try {
        pods = await podsFor(e.id);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      const rental = effectiveRental(e.id, e.rented);
      rented = {
        ...rental,
        declaredUsdPerHour: e.rented.maxUsdPerHour ?? DEFAULT_MAX_USD_PER_HOUR,
        maxPods: MAX_PODS,
        pods: await Promise.all(pods.map(withStatus)),
        offers: withOffers && pods.length < MAX_PODS ? await offers(rental).catch(() => []) : undefined,
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

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
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
      const { pods, shortfall } = await startPods(e, effectiveRental(e.id, e.rented), Number(flag(rest, '--pods') ?? 1));
      console.log(JSON.stringify({ ok: true, pods: pods.map(publicPod), shortfall }));
      return;
    }
    case 'cap': {
      // --usd <n> sets what one pod may cost an hour; --usd declared goes back to engines.json's.
      const e = engineArg(rest);
      if (!e.rented) throw new Error(`${e.label} is not declared as rentable`);
      const usd = flag(rest, '--usd');
      if (usd === undefined || usd === null) throw new Error('Say the cap: --usd <dollars an hour> or --usd declared');
      setPriceCap(e.id, usd === 'declared' ? null : Number(usd));
      console.log(JSON.stringify({ ok: true, maxUsdPerHour: effectiveRental(e.id, e.rented).maxUsdPerHour }));
      return;
    }
    case 'stop': {
      const e = engineArg(rest);
      const stopped = await stopPods(e.id, flag(rest, '--pod'));
      console.log(JSON.stringify({ ok: true, stopped: stopped.map(publicPod) }));
      return;
    }
    default:
      throw new Error('usage: gpu status [--offers] | load|unload --engine ID | start --engine ID [--pods N] | stop --engine ID [--pod POD]');
  }
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
