/**
 * The engines a run may read on, and which one each read goes to.
 *
 * One provision per engine at a time. Measured on 11 September: two concurrent reads inside one
 * Ollama server changed 18 of 40 answers, while reads on separate servers changed none. So the
 * pool hands out an engine exclusively and takes it back, and width comes from engines, not from
 * asking one engine for more at once.
 */

import { NoEnginesLeft } from './errors.js';
export { NoEnginesLeft };

/** Every engine this process may use, in the order given. */
export function engineHosts(): string[] {
  const many = process.env['OLLAMA_HOSTS'];
  const one = process.env['OLLAMA_HOST'];
  const list = (many ?? one ?? 'http://127.0.0.1:11434')
    .split(',')
    .map((h) => h.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set(list)];
}

/**
 * How long an engine that stopped answering is left alone before it is tried again, and how long
 * it may stay away before it is given up for good. A rented engine behind a proxy drops out for
 * seconds or minutes and comes back; retired for good on its first bad stretch, Mongolia's fleet
 * of six lost one engine after another and then its pillars, with every pod still running.
 */
export interface PoolTiming {
  restMs: number;
  giveUpMs: number;
}

function timingFromEnv(): PoolTiming {
  return {
    restMs: Number(process.env['LEXDROID_ENGINE_REST_MS'] ?? 60_000),
    giveUpMs: Number(process.env['LEXDROID_ENGINE_GIVE_UP_MS'] ?? 30 * 60_000),
  };
}

export class EnginePool {
  private readonly free: string[];
  private readonly waiting: ((host: string | null) => void)[] = [];
  private readonly retired: string[] = [];
  /** When each engine out of the pool first stopped answering, for the give-up clock. */
  private readonly downSince = new Map<string, number>();
  private readonly resting = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly timing: PoolTiming;
  private live: number;

  constructor(hosts: string[] = engineHosts(), timing: Partial<PoolTiming> = {}) {
    if (hosts.length === 0) throw new Error('a pool needs at least one engine');
    this.free = [...hosts];
    this.live = hosts.length;
    this.timing = { ...timingFromEnv(), ...timing };
  }

  /** How many reads may be in flight at once: one per engine still standing. */
  width(): number {
    return this.live;
  }

  /** The engines out of the pool now, resting or given up. */
  retiredHosts(): string[] {
    return [...this.retired];
  }

  /**
   * Resolves null once every engine is gone and none is due back, so a waiter is woken rather
   * than left hanging.
   */
  private acquire(): Promise<string | null> {
    if (this.live === 0 && this.resting.size === 0) return Promise.resolve(null);
    const host = this.free.shift();
    if (host !== undefined) return Promise.resolve(host);
    const waiter = new Promise<string | null>((resolve) => this.waiting.push(resolve));
    this.holdOpen();
    return waiter;
  }

  private release(host: string): void {
    const next = this.waiting.shift();
    if (next) next(host);
    else this.free.push(host);
  }

  /**
   * An engine that has stopped answering is taken out and rested, not handed out meanwhile. The
   * work it was holding is not lost: the caller retries it on another engine. Rested, it is tried
   * again, until it has been away longer than the give-up allows.
   */
  private retire(host: string): void {
    if (this.retired.includes(host)) return;
    this.retired.push(host);
    this.live -= 1;
    const since = this.downSince.get(host) ?? Date.now();
    this.downSince.set(host, since);
    if (Date.now() - since + this.timing.restMs <= this.timing.giveUpMs) {
      this.resting.set(host, setTimeout(() => this.readmit(host), this.timing.restMs));
      console.warn(`  engine ${host} resting ${Math.round(this.timing.restMs / 1000)}s before it is tried again`);
    } else {
      console.warn(`  engine ${host} given up after ${Math.round((Date.now() - since) / 60_000)} min away`);
    }
    if (this.live === 0 && this.resting.size === 0) for (const waiter of this.waiting.splice(0)) waiter(null);
    this.holdOpen();
  }

  private readmit(host: string): void {
    this.resting.delete(host);
    this.retired.splice(this.retired.indexOf(host), 1);
    this.live += 1;
    this.release(host);
    this.holdOpen();
  }

  /**
   * A rest timer keeps the process alive only while someone is waiting on it with no engine
   * standing; otherwise a finished run would linger for a minute on an engine it no longer needs.
   */
  private holdOpen(): void {
    const needed = this.live === 0 && this.waiting.length > 0;
    for (const t of this.resting.values()) {
      if (needed) t.ref();
      else t.unref();
    }
  }

  /**
   * Runs the work on one engine, held for the whole call. If that engine has stopped answering,
   * it is rested and the same work is tried on the next engine, so one dropped tunnel costs one
   * engine for a minute rather than the pillar it was reading.
   */
  async run<T>(work: (host: string) => Promise<T>, gone: (err: unknown) => boolean): Promise<T> {
    for (;;) {
      const host = await this.acquire();
      if (host === null) throw new NoEnginesLeft([...this.downSince.keys()]);
      try {
        const value = await work(host);
        this.downSince.delete(host);
        this.release(host);
        return value;
      } catch (err) {
        if (!gone(err)) {
          this.release(host);
          throw err;
        }
        this.retire(host);
        console.warn(`  engine ${host} out; ${this.live} left, retrying this provision`);
      }
    }
  }
}

let shared: EnginePool | null = null;

/** The pool this process reads on. Built once, from the environment, on first use. */
export function enginePool(): EnginePool {
  shared ??= new EnginePool();
  return shared;
}

/** Test seam: forget the process-wide pool so the next call rebuilds it from the environment. */
export function resetEnginePool(): void {
  shared = null;
}
