/**
 * The engines the interface can choose between, and which one a run was answered by.
 * A run records the engine's id, so what answered it stays legible after the file changes.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Engine {
  id: string;
  label: string;
  kind: 'open-weights' | 'hosted';
  provider: string;
  model: string;
  checkpoint: string;
  hosted: boolean;
  hosts: string[];
  declared: boolean;
  weaknesses: string;
  notes: string;
}

export interface Registry {
  default: string;
  engines: Engine[];
}

const EMPTY: Registry = { default: 'engine-a', engines: [] };

/**
 * The workspace root, found from this module rather than from the working directory.
 *
 * It used to be `process.cwd()`, which meant the registry existed only when a command happened to
 * be run from `backend/`. Run the test suite from the repository root -- which is what a reviewer
 * following the README does -- and the four engine-declaration tests failed with "expected 0 to be
 * 2", reading as an undeclared Section 5 rather than as a wrong working directory.
 */
const BACKEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function registryPath(root = BACKEND_ROOT): string {
  return join(root, 'data', 'engines.json');
}

export function loadEngines(root?: string): Registry {
  const path = registryPath(root);
  if (!existsSync(path)) return EMPTY;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Registry;
    return { default: raw.default ?? 'engine-a', engines: raw.engines ?? [] };
  } catch {
    return EMPTY;
  }
}

export function findEngine(id: string, root?: string): Engine | undefined {
  return loadEngines(root).engines.find((e) => e.id === id);
}

/** Which engine a run uses when none is named, preferring one that is actually declared. */
export function defaultEngine(root?: string): Engine | undefined {
  const reg = loadEngines(root);
  return (
    reg.engines.find((e) => e.id === reg.default && e.declared) ?? reg.engines.find((e) => e.declared)
  );
}

/** Only the chosen engine moves. Declarations are frozen after 30 September and are not editable here. */
export function chooseEngine(id: string, root?: string): Registry {
  const reg = loadEngines(root);
  if (!reg.engines.some((e) => e.id === id)) throw new Error(`No engine ${id}`);
  const next = { ...reg, default: id };
  writeFileSync(registryPath(root), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}
