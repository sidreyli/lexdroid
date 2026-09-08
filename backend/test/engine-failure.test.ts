/**
 * What a failed engine call has to be, so a run steps over it instead of publishing it.
 *
 * The defect these were written for: 31 calls wrote until the context window was physically full
 * -- every one of them to the token -- and returned no finding, no quote and no reasoning.
 */
import { describe, expect, it } from 'vitest';
import {
  EngineFailure,
  EngineOverran,
  EngineSilent,
  EngineTimeout,
  MAX_OUTPUT_TOKENS,
} from '../src/engines/ollama.js';

describe('an engine call that produced nothing usable', () => {
  it('is one kind of thing, whichever way it failed', () => {
    expect(new EngineTimeout('m', 'body timeout')).toBeInstanceOf(EngineFailure);
    expect(new EngineOverran('m', 4096, 2771, 4096, 27_000)).toBeInstanceOf(EngineFailure);
    expect(new EngineSilent('m', 2771, 81_000)).toBeInstanceOf(EngineFailure);
  });

  it('carries what the attempt cost, because a cut-off answer was still paid for', () => {
    const err = new EngineOverran('gemma4-lex-16k', 4096, 2771, 4096, 27_000);
    expect(err.promptTokens).toBe(2771);
    expect(err.completionTokens).toBe(4096);
    expect(err.durationMs).toBe(27_000);
  });

  it('says in its own message which limit it hit', () => {
    expect(new EngineOverran('gemma4-lex-16k', 4096, 2771, 4096, 27_000).message).toContain('4096-token limit');
  });

  it('keeps its own name, so the ledger can tell a stall from a loop', () => {
    expect(new EngineTimeout('m', 'x').name).toBe('EngineTimeout');
    expect(new EngineOverran('m', 4096, 1, 4096, 1).name).toBe('EngineOverran');
    expect(new EngineSilent('m', 1, 1).name).toBe('EngineSilent');
  });
});

describe('the output limit', () => {
  // The two populations do not overlap: useful answers stop by 3,515, runaways start at 11,786.
  it('sits in the empty band between a useful answer and a runaway', () => {
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThan(3515);
    expect(MAX_OUTPUT_TOKENS).toBeLessThan(11_786);
  });
});
