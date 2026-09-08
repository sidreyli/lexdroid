/**
 * A replay of what the engine said, for development only.
 *
 * Reading is the whole cost of a run, and a scoring change touches none of it: the same provisions
 * produce the same readings, and forty minutes is spent proving it. Replaying them turns that into
 * seconds, which is the difference between trying five variations of a rule and trying one.
 *
 * The danger is not staleness, it is what validation means here. A change is accepted by running
 * two economies and checking whether it moves both toward ESCAP's answers. If the readings come
 * from a cache, that stops being a measurement and becomes a replay -- and a scoring change could
 * be "validated" without ever being put in front of a fresh reading. So: off unless asked for,
 * every cached call counted, and a run that used one marked in its own record. See recordPillarAnswer.
 *
 * The key is a hash of exactly what would have been sent, so any change to a prompt, a schema, a
 * model or an option misses. Nothing is hand-versioned; the v1 repository kept a revision counter
 * that had to be bumped by hand, and it was the bump that got forgotten.
 */
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** Its own file, so deleting the cache can never touch a run record. Read late, not at import. */
export function cachePath(): string {
  return process.env['LEXDROID_ENGINE_CACHE_PATH'] ?? 'backend/data/engine-cache.db';
}

/** Off unless asked for. A run that is going to be quoted must never be served from here. */
export function cacheEnabled(): boolean {
  const v = process.env['LEXDROID_ENGINE_CACHE'];
  return v === '1' || v === 'true';
}

export interface CachedResponse {
  text: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  model: string;
}

let handle: Database.Database | null = null;
let openedAt = '';

function db(): Database.Database {
  const path = cachePath();
  if (handle && openedAt === path) return handle;
  if (handle) handle.close();
  if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true });
  handle = new Database(path);
  openedAt = path;
  handle.pragma('journal_mode = WAL');
  handle.exec(
    `CREATE TABLE IF NOT EXISTS response (
       key            TEXT PRIMARY KEY,
       model          TEXT NOT NULL,
       text           TEXT NOT NULL,
       prompt_tokens  INTEGER NOT NULL,
       output_tokens  INTEGER NOT NULL,
       duration_ms    INTEGER NOT NULL,
       stored_at      TEXT NOT NULL
     )`,
  );
  return handle;
}

/**
 * The request, hashed.
 *
 * Object key order is normalised, because two identical requests built in a different order are
 * the same request and a JSON string of them is not.
 */
export function cacheKey(request: unknown): string {
  return createHash('sha256').update(canonical(request)).digest('hex');
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
}

export function cacheGet(key: string): CachedResponse | null {
  const row = db()
    .prepare('SELECT model, text, prompt_tokens, output_tokens, duration_ms FROM response WHERE key = ?')
    .get(key) as
    | { model: string; text: string; prompt_tokens: number; output_tokens: number; duration_ms: number }
    | undefined;
  if (!row) return null;
  return {
    text: row.text,
    promptTokens: row.prompt_tokens,
    completionTokens: row.output_tokens,
    durationMs: row.duration_ms,
    model: row.model,
  };
}

export function cachePut(key: string, value: CachedResponse): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO response (key, model, text, prompt_tokens, output_tokens, duration_ms, stored_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(key, value.model, value.text, value.promptTokens, value.completionTokens, value.durationMs, new Date().toISOString());
}

/** How many answers are stored, for the banner that says a run was not measured. */
export function cacheSize(): number {
  if (!existsSync(cachePath())) return 0;
  return (db().prepare('SELECT COUNT(*) c FROM response').get() as { c: number }).c;
}

export function closeCache(): void {
  handle?.close();
  handle = null;
  openedAt = '';
}
