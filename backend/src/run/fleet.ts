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
 * The first host that names an engine an earlier host already named, or null.
 * Two workers on one engine have their reads batched together, which changes the answers.
 */
export function duplicateEngine(hosts: string[]): string | null {
  const keys = hosts.map(engineKey);
  const i = keys.findIndex((k, n) => keys.indexOf(k) !== n);
  return i >= 0 ? hosts[i]! : null;
}
