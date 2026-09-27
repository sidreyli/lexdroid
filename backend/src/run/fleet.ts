/**
 * How work is split across engines, and what counts as one engine.
 *
 * Apart from the script that drives it so both can be tested without spawning anything.
 */

export interface Unit {
  economy: string;
  pillar: number;
}

/** One unit is one economy and one pillar: the smallest thing a worker can finish and record. */
export function workUnits(economies: string[], pillars: number[]): Unit[] {
  const units: Unit[] = [];
  for (const economy of economies) for (const pillar of pillars) units.push({ economy, pillar });
  return units;
}

/**
 * Biggest first. Whichever unit starts last decides when the run ends, so the last one handed out
 * must not be the largest: in listed order the three pillar 12s go last and cost hours of tail.
 */
export function longestFirst(units: Unit[], size: (unit: Unit) => number): Unit[] {
  return units
    .map((unit, at) => ({ unit, at, size: size(unit) }))
    .sort((a, b) => b.size - a.size || a.at - b.at)
    .map((u) => u.unit);
}

/** localhost and 127.0.0.1 are the same engine, so the one-worker-per-engine rule must see that. */
export function engineKey(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/[/]+$/, '')
    .replace(/^https?:[/][/]/, '')
    .replace(/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?=$|:)/, 'local');
}

/**
 * Which units each host takes, with every unit of one economy on one engine.
 *
 * Work stealing hands a unit to whichever engine is free, so one economy can be answered by two
 * machines and nothing in the record says which answered what. Pinning costs an idle host when the
 * economies are uneven, and buys an economy that was read start to finish by one engine.
 */
export function pinByEconomy(units: Unit[], hosts: string[]): Map<string, Unit[]> {
  const byEconomy = new Map<string, Unit[]>();
  for (const u of units) byEconomy.set(u.economy, [...(byEconomy.get(u.economy) ?? []), u]);
  const out = new Map<string, Unit[]>(hosts.map((h) => [h, []]));
  let n = 0;
  for (const list of byEconomy.values()) out.get(hosts[n++ % hosts.length]!)!.push(...list);
  return out;
}

/**
 * The first host that names an engine an earlier host already named, or null.
 * Two workers on one engine have their reads batched together, which changes the answers.
 */
export function duplicateEngine(hosts: string[]): string | null {
  const keys = hosts.map(engineKey);
  const i = keys.findIndex((k, n) => keys.indexOf(k) !== n);
  return i >= 0 ? hosts[i]! : null;
}

/**
 * Replaying stored answers on GPUs billed by the hour. Each feature is fine alone; together the
 * run carries a rent figure while being marked not a measurement, which reads as a measured one.
 */
export function replayingWhilePaying(cacheOn: boolean, usdPerHour: number): boolean {
  return cacheOn && usdPerHour > 0;
}

/**
 * What a child gate is told about engines.
 *
 * Pinned, not inherited: one request in flight per engine is what makes several engines safe, and
 * a stray environment variable must not be able to lift it. Reading wide means more engines, never
 * a larger number here.
 */
export function childEngineEnv(hosts: string[], engine?: HostedEngine): Record<string, string> {
  // A hosted engine generates over the chat-completions client, so the Ollama pool is left with
  // what only Ollama does: the embeddings behind every search. It used to be handed the hosted
  // engine's own URL, which speaks another protocol -- the first query embedding went to the chat
  // endpoint, the host was retired as dead, and the worker had no engine left before reading one
  // provision. The embedding engine is its own setting, and the local one unless said otherwise.
  if (engine?.hosted) {
    const embedding = (process.env['LEXDROID_EMBED_HOSTS'] ?? 'http://127.0.0.1:11434').trim();
    return {
      OLLAMA_HOSTS: embedding,
      OLLAMA_HOST: embedding.split(',')[0]!.trim(),
      LEXDROID_READ_CONCURRENCY: '1',
      LEXDROID_HOSTED_BASE_URL: engine.baseUrl,
      LEXDROID_HOSTED_MODEL: engine.model,
      LEXDROID_HOSTED_PROVIDER: engine.provider,
      // Read from this process's own environment and passed on, never from the registry file.
      ...(process.env['LEXDROID_HOSTED_API_KEY']
        ? { LEXDROID_HOSTED_API_KEY: process.env['LEXDROID_HOSTED_API_KEY'] }
        : {}),
    };
  }
  if (hosts.length === 0) throw new Error('a child needs at least one engine');
  return {
    OLLAMA_HOSTS: hosts.join(','),
    OLLAMA_HOST: hosts[0]!,
    LLM_PROVIDER: 'ollama',
    LEXDROID_READ_CONCURRENCY: '1',
    // The child inherits the parent's environment, and a parent that ran a hosted fleet earlier in
    // the same shell still has these set. Left alone, the child read hostedConfig() first and every
    // provision went to the hosted engine while the host it was assigned sat idle -- a run recorded
    // against the wrong engine. Empty is unset as far as hostedConfig is concerned.
    LEXDROID_HOSTED_BASE_URL: '',
    LEXDROID_HOSTED_MODEL: '',
    LEXDROID_HOSTED_PROVIDER: '',
    LEXDROID_HOSTED_API_KEY: '',
  };
}

/** What a child needs to know to reach a hosted engine. The key never travels in here. */
export interface HostedEngine {
  hosted: boolean;
  baseUrl: string;
  model: string;
  provider: string;
}

/**
 * How a run is shaped across engines.
 *
 * Pillar-at-a-time: every engine reads one pillar together, so the largest pillar is divided
 * instead of setting the floor. One economy's pillar 12 is 603 provisions; alone on one engine it
 * is four hours whatever the other eleven are doing.
 *
 * Unit-at-a-time: one engine per pillar, which is reproducible per engine but ends when its
 * biggest single unit ends.
 */
export type Shape = 'pillar-at-a-time' | 'unit-at-a-time';

/** Wall time in seconds for a shape, given each unit's cost and how many engines there are. */
export function makespan(unitSeconds: number[], engines: number, shape: Shape): number {
  const total = unitSeconds.reduce((a, b) => a + b, 0);
  if (engines < 1) throw new Error('a run needs at least one engine');
  if (shape === 'pillar-at-a-time') return total / engines;
  const longest = unitSeconds.length > 0 ? Math.max(...unitSeconds) : 0;
  return Math.max(total / engines, longest);
}
