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

export class EnginePool {
  private readonly free: string[];
  private readonly waiting: ((host: string | null) => void)[] = [];
  private readonly retired: string[] = [];
  private live: number;

  constructor(hosts: string[] = engineHosts()) {
    if (hosts.length === 0) throw new Error('a pool needs at least one engine');
    this.free = [...hosts];
    this.live = hosts.length;
  }

  /** How many reads may be in flight at once: one per engine still standing. */
  width(): number {
    return this.live;
  }

  retiredHosts(): string[] {
    return [...this.retired];
  }

  /** Resolves null once the last engine is gone, so a waiter is woken rather than left hanging. */
  private acquire(): Promise<string | null> {
    if (this.live === 0) return Promise.resolve(null);
    const host = this.free.shift();
    if (host !== undefined) return Promise.resolve(host);
    return new Promise((resolve) => this.waiting.push(resolve));
  }

  private release(host: string): void {
    const next = this.waiting.shift();
    if (next) next(host);
    else this.free.push(host);
  }

  /**
   * An engine that has gone for good is dropped rather than handed out again. The work it was
   * holding is not lost: the caller retries it on another engine.
   */
  private retire(host: string): void {
    if (this.retired.includes(host)) return;
    this.retired.push(host);
    this.live -= 1;
    if (this.live === 0) for (const waiter of this.waiting.splice(0)) waiter(null);
  }

  /**
   * Runs the work on one engine, held for the whole call. If that engine has gone away for good,
   * it is retired and the same work is tried on the next engine, so one dead tunnel costs one
   * engine rather than the pillar it was reading.
   */
  async run<T>(work: (host: string) => Promise<T>, gone: (err: unknown) => boolean): Promise<T> {
    for (;;) {
      const host = await this.acquire();
      if (host === null) throw new NoEnginesLeft(this.retired);
      try {
        const value = await work(host);
        this.release(host);
        return value;
      } catch (err) {
        if (!gone(err)) {
          this.release(host);
          throw err;
        }
        this.retire(host);
        console.warn(`  engine ${host} retired; ${this.live} left, retrying this provision`);
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
