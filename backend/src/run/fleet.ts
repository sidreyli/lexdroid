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
