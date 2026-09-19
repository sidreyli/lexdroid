/**
 * The one `.env`, read from the repository root by everything that needs it.
 *
 * There was no loader at all. `engines.json` says the hosted key is read from
 * `LEXDROID_HOSTED_API_KEY` in the environment -- correctly, because a key on disk is a key in a
 * backup -- but nothing put it there, so the key had to be exported by hand into every shell that
 * ran a command, and `engine-check` reported "not set" on a machine that had one sitting in a file.
 *
 * Deliberately small. It does not expand variables, does not support multi-line values, and
 * **never overwrites a variable already set**, so an explicit `LEXDROID_HOSTED_API_KEY=... npm run`
 * still wins over the file. Anything more than that belongs in a dependency, and a dependency that
 * reads credentials is a dependency worth not having.
 *
 * Next.js loads `frontend/.env` on its own; `frontend/next.config.ts` calls this for the root one
 * so that the interface and the command line read the same file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function envPath(root = REPO_ROOT): string {
  return join(root, '.env');
}

/** Parsed into pairs, so the parsing can be tested without touching `process.env`. */
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    // `export FOO=bar` is what a shell-shaped file looks like, and people paste those.
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2] ?? '';
    // An unquoted trailing comment is a comment. A quoted one is part of the value.
    else value = value.replace(/\s+#.*$/, '').trim();
    out.set(key, value);
  }
  return out;
}

/** Returns the names it set, never the values: this function handles credentials. */
export function loadEnv(root?: string): string[] {
  const path = envPath(root);
  if (!existsSync(path)) return [];
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return [];
  }
  const set: string[] = [];
  for (const [key, value] of parseEnv(text)) {
    if (process.env[key] !== undefined) continue;
    process.env[key] = value;
    set.push(key);
  }
  return set;
}
