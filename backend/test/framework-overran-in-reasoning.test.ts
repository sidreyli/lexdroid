/**
 * A framework answer that loops in its reasoning has already answered.
 *
 * The defect: Australia's Security of Critical Infrastructure Act wrote every field of its answer
 * in the first 400 characters, then "The title of the Act is the primary indicator of the purpose
 * of the instrument." until the engine cut it off -- at 4,096 tokens, and again at 12,288. The whole
 * answer was thrown away with the loop, the instrument went unexamined, and 7.2 abstained on the
 * Act that decides it. 8.2 lost the Broadcasting Services Act the same way.
 */
import { describe, expect, it } from 'vitest';
import { answeredBeforeReasoning } from '../src/read/index.js';

const ANSWER =
  '{"frameworkWords": "imposing enhanced cyber security obligations on relevant entities", "establishesFramework": true, ' +
  '"sectorWords": null, "sector": "multiple", "horizontal": true, "dedicatedWords": "Security of Critical Infrastructure Act 2018", ' +
  '"dedicated": true, "quote": "Security of Critical Infrastructure Act 2018", ';

describe('a framework answer cut off in its reasoning', () => {
  it('keeps every field written before the reasoning, and drops the loop', () => {
    const loop = 'The title of the Act is the primary indicator of the purpose of the instrument. '.repeat(200);
    const kept = answeredBeforeReasoning(`${ANSWER}"reasoning": "${loop}`);
    expect(kept).not.toBeNull();
    const p = JSON.parse(kept!) as Record<string, unknown>;
    expect(p['establishesFramework']).toBe(true);
    expect(p['horizontal']).toBe(true);
    expect(p['quote']).toBe('Security of Critical Infrastructure Act 2018');
    expect(p['reasoning']).toBe('');
  });

  it('keeps nothing when the loop began before a field the decision needs', () => {
    const early = '{"frameworkWords": "the Act the Act the Act the Act the Act';
    expect(answeredBeforeReasoning(early)).toBeNull();
    // Reasoning reached, but a field before it never written.
    const missing = '{"frameworkWords": null, "establishesFramework": true, "quote": "x", "reasoning": "again again';
    expect(answeredBeforeReasoning(missing)).toBeNull();
  });
});
