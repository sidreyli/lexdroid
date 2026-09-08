/**
 * Load the derived rubric.
 *
 * data/rubric.json is written by scripts/derive-rubric.ts out of ESCAP's own documents. It is
 * validated on load rather than trusted, because the scope of an entire run -- how many cells
 * exist, and therefore how many answers are owed -- is read straight off this file.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { Indicator, IndicatorId, Pillar, Rubric } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PATH = join(here, '..', '..', 'data', 'rubric.json');

const provenanceSchema = z.object({
  document: z.string().min(1),
  locator: z.string().min(1),
});

const bandSchema = z.object({
  score: z.number(),
  criterion: z.string().min(1),
  ordinal: z.number().int().positive(),
});

const indicatorSchema = z.object({
  id: z.string().min(1),
  pillarId: z.number().int().positive(),
  pillarName: z.string().min(1),
  category: z.string().min(1),
  exception: z.string().min(1).nullable(),
  criteriaText: z.string().min(1),
  bands: z.array(bandSchema).min(1),
  shape: z.enum(['provision', 'framework', 'practice']),
  shapeBasis: z.string().min(1),
  provenance: provenanceSchema,
});

const rubricSchema = z.object({
  version: z.string().min(1),
  derivedAt: z.string().min(1),
  pillars: z
    .array(z.object({ id: z.number().int().positive(), name: z.string().min(1), indicatorIds: z.array(z.string()) }))
    .min(1),
  indicators: z.array(indicatorSchema).min(1),
  nonRegulatory: z.array(z.string()),
  sources: z.array(provenanceSchema).min(1),
});

let cached: Rubric | null = null;

export function loadRubric(path: string = DEFAULT_PATH): Rubric {
  if (cached && path === DEFAULT_PATH) return cached;

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `No rubric at ${path}. It is derived from ESCAP's documents, not committed: ` +
        `run "npm run -w backend derive-rubric".`,
    );
  }

  const parsed = rubricSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`${path} is not a valid rubric: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  }
  const rubric = parsed.data as Rubric;

  const seen = new Set<string>();
  for (const i of rubric.indicators) {
    if (seen.has(i.id)) throw new Error(`Duplicate indicator id ${i.id} in ${path}`);
    seen.add(i.id);
  }
  for (const nr of rubric.nonRegulatory) {
    if (seen.has(nr)) {
      throw new Error(
        `${nr} is both in scope and listed non-regulatory in ${path}. ESCAP states no extraction ` +
          `tool is required for the non-regulatory indicators.`,
      );
    }
  }

  if (path === DEFAULT_PATH) cached = rubric;
  return rubric;
}

export function indicator(id: IndicatorId, rubric: Rubric = loadRubric()): Indicator {
  const found = rubric.indicators.find((i) => i.id === id);
  if (!found) throw new Error(`No indicator ${id} in the rubric`);
  return found;
}

export function pillar(id: number, rubric: Rubric = loadRubric()): Pillar {
  const found = rubric.pillars.find((p) => p.id === id);
  if (!found) throw new Error(`No pillar ${id} in the rubric`);
  return found;
}

export function indicatorsOfPillar(id: number, rubric: Rubric = loadRubric()): Indicator[] {
  return rubric.indicators.filter((i) => i.pillarId === id);
}

/** Every cell owed for one economy: one per regulatory indicator, in ESCAP's own order. */
export function cellsFor(economy: string, rubric: Rubric = loadRubric()): { economy: string; indicatorId: IndicatorId }[] {
  return rubric.indicators.map((i) => ({ economy, indicatorId: i.id }));
}

export * from './types.js';
