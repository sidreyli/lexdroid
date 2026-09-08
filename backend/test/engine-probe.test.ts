import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  batchesFrom,
  usable,
  describeReport,
  mismatchedEngine,
  fingerprintOf,
  SERIAL_RATIO,
  type EngineReport,
} from '../src/engines/probe.js';

const base = (over: Partial<EngineReport> = {}): EngineReport => ({
  host: 'http://pod-a:11434',
  reachable: true,
  detail: null,
  note: null,
  models: ['gemma4-lex-16k:latest'],
  hasModel: true,
  fingerprint: { family: 'gemma3', parameters: '11.9B', quantisation: 'Q4_K_M' },
  batches: false,
  ratio: 1.9,
  soloMs: 2700,
  ...over,
});

describe('two hosts must be serving the same model', () => {
  // The cloud failure a laptop cannot have. Half a run answered by a different build is two runs.
  it('passes hosts that agree', () => {
    expect(mismatchedEngine([base(), base({ host: 'http://pod-b:11434' })])).toBeNull();
  });

  it('names the host serving something else', () => {
    const odd = base({
      host: 'http://pod-b:11434',
      fingerprint: { family: 'gemma3', parameters: '11.9B', quantisation: 'Q8_0' },
    });
    expect(mismatchedEngine([base(), odd])?.host).toBe('http://pod-b:11434');
  });

  it('catches a different parameter count under the same tag', () => {
    const odd = base({
      host: 'http://pod-b:11434',
      fingerprint: { family: 'gemma3', parameters: '8.0B', quantisation: 'Q4_K_M' },
    });
    expect(mismatchedEngine([base(), odd])).not.toBeNull();
  });

  it('says nothing about a single host', () => {
    expect(mismatchedEngine([base()])).toBeNull();
  });

  it('ignores hosts whose model could not be read rather than calling them a mismatch', () => {
    expect(mismatchedEngine([base(), base({ fingerprint: null })])).toBeNull();
  });

  it('reads a fingerprint as one comparable string', () => {
    expect(fingerprintOf(base())).toBe('gemma3/11.9B/Q4_K_M');
  });
});

describe('telling a batching engine from a serialising one', () => {
  // Measured against two real servers on one GPU: 1.11x set to batch, 2.11x set to serialise.
  it('calls the measured batching case batched', () => {
    expect(batchesFrom(2725, [2518, 2519])).toBe(true);
  });

  it('calls the measured serialising case serialised', () => {
    expect(batchesFrom(566, [495, 980])).toBe(false);
  });

  it('judges on the slower of the pair, not the average', () => {
    // One fast and one queued is serialised; averaging them would hide the queue.
    expect(batchesFrom(1000, [1000, 2000])).toBe(false);
  });

  it('puts the threshold between the two measurements', () => {
    expect(SERIAL_RATIO).toBeGreaterThan(1.11);
    expect(SERIAL_RATIO).toBeLessThan(2.11);
  });

  it('does not divide by a zero solo time', () => {
    expect(batchesFrom(0, [10, 10])).toBe(false);
  });
});

describe('what counts as an engine a run may use', () => {
  it('accepts one that answers and serves the model', () => {
    expect(usable(base())).toBe(true);
  });

  it('accepts a batching host, because one worker gives it nothing to batch with', () => {
    // The timing is a cross-check, not the guarantee. Asked to gate on it, it cleared a server
    // known to batch once memory was tight, so it reports and the structure protects.
    expect(usable(base({ batches: true, ratio: 1.05, note: 'ran two requests together' }))).toBe(true);
  });

  it('refuses a batching host when the caller says the engine is shared', () => {
    expect(usable(base({ batches: true, ratio: 1.05 }), true)).toBe(false);
  });

  it('refuses one that is not serving the model', () => {
    expect(usable(base({ hasModel: false, models: ['llama3'], detail: 'is not serving it' }))).toBe(false);
  });

  it('refuses one that is not answering at all', () => {
    expect(usable(base({ reachable: false, detail: 'not answering' }))).toBe(false);
  });

  it('shows what the host is serving, not only that it answered', () => {
    expect(describeReport(base())).toContain('gemma3/11.9B/Q4_K_M');
  });
});

describe('the pod script builds the model this repo declares', () => {
  // Two copies of one definition drift. This fails when they do.
  const root = join(__dirname, '..', '..');
  const modelfile = readFileSync(join(root, 'ollama', 'gemma4-lex-16k.Modelfile'), 'utf8');
  const bootstrap = readFileSync(join(root, 'infra', 'runpod', 'bootstrap.sh'), 'utf8');

  it('starts from the same base model', () => {
    const declared = /^FROM\s+(\S+)/m.exec(modelfile)![1];
    expect(bootstrap).toContain(`BASE:-${declared}`);
  });

  it('uses the same context width', () => {
    const declared = /num_ctx\s+(\d+)/.exec(modelfile)![1];
    expect(bootstrap).toContain(`NUM_CTX:-${declared}`);
  });

  it('pins the pod to one request at a time', () => {
    expect(bootstrap).toContain('OLLAMA_NUM_PARALLEL=1');
  });

  it('does not open the engine port to the internet by default', () => {
    expect(bootstrap).toContain('EXPOSE:-0');
  });
});
