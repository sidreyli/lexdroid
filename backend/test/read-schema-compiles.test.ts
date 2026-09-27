/**
 * Every read the engine can be asked for has a grammar it can compile.
 *
 * The defect this exists for: in the India rehearsal, a batch holding only 8.1 and 8.2 -- safe
 * harbours, which recognise no measure -- declared `measure` with an empty enum. llama.cpp refuses
 * that grammar with HTTP 400, the retry refused it the same way, and pillar 8 could not be read.
 */
import { describe, expect, it } from 'vitest';
import { schemaFor } from '../src/read/index.js';
import { loadRubric, indicatorsOfPillar } from '../src/rubric/index.js';

function emptyEnums(node: unknown, path = '#'): string[] {
  if (!node || typeof node !== 'object') return [];
  const out: string[] = [];
  const o = node as Record<string, unknown>;
  if (Array.isArray(o.enum) && o.enum.length === 0) out.push(path);
  for (const [k, v] of Object.entries(o)) out.push(...emptyEnums(v, `${path}/${k}`));
  return out;
}

describe('read schema', () => {
  const rubric = loadRubric();
  for (let pillar = 1; pillar <= 12; pillar += 1) {
    it(`pillar ${pillar}: no batch of its indicators declares an empty enum`, () => {
      const all = indicatorsOfPillar(pillar, rubric);
      const batches = [all, ...all.map((i) => [i])];
      for (const b of batches) expect(emptyEnums(schemaFor(b)), b.map((i) => i.id).join(',')).toEqual([]);
    });
  }
});
