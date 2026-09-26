/**
 * What the interface sends RunPod when it rents a GPU for an engine, checked without renting one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEngine } from '../src/engines/registry.js';
import { createBody, podName, spentUsd, type Pod } from '../src/gpu/runpod.js';

const root = join(__dirname, '..', '..');
const engineB = findEngine('engine-b')!;

describe('renting a GPU for an engine', () => {
  const body = createBody(engineB, engineB.rented!, ['NVIDIA RTX A5000', 'NVIDIA GeForce RTX 3090'], 'tok-123');

  it('names the pod for the engine, so it is found again and nothing else is touched', () => {
    expect(body.name).toBe(podName('engine-b'));
    expect(body.env.LEX_ENGINE).toBe('engine-b');
  });

  it('builds the tag on the pod from the Modelfile this repository declares', () => {
    const declared = readFileSync(join(root, 'ollama', 'qwen3.8-lex-16k.Modelfile'), 'utf8');
    expect(Buffer.from(body.env.LEX_MODELFILE, 'base64').toString('utf8')).toBe(declared);
    expect(body.env.LEX_TAG).toBe(engineB.model);
    expect(declared).toContain(`FROM ${engineB.checkpoint}`);
  });

  it('ships the server that runs on the pod, unchanged', () => {
    const script = readFileSync(join(root, 'infra', 'runpod', 'pod.py'), 'utf8');
    expect(Buffer.from(body.env.LEX_POD, 'base64').toString('utf8')).toBe(script);
  });

  it('exposes only the token-checked port, on the HTTPS proxy', () => {
    expect(body.ports).toEqual(['8000/http']);
    expect(body.env.LEX_TOKEN).toBe('tok-123');
  });

  it('asks for the cheapest card first and one GPU on the community tier', () => {
    expect(body.gpuTypeIds).toEqual(['NVIDIA RTX A5000', 'NVIDIA GeForce RTX 3090']);
    expect(body.gpuTypePriority).toBe('custom');
    expect(body.gpuCount).toBe(1);
    expect(body.cloudType).toBe('COMMUNITY');
  });

  it('carries no RunPod key', () => {
    process.env['RUNPOD_API_KEY'] = 'rpa_SECRET_TEST_VALUE';
    const again = JSON.stringify(createBody(engineB, engineB.rented!, ['x'], 't'));
    expect(again).not.toContain('rpa_SECRET_TEST_VALUE');
    delete process.env['RUNPOD_API_KEY'];
  });
});

describe('the pod server', () => {
  const script = readFileSync(join(root, 'infra', 'runpod', 'pod.py'), 'utf8');
  it('keeps Ollama on localhost and pins one request at a time', () => {
    expect(script).toContain('OLLAMA_HOST="127.0.0.1:11434"');
    expect(script).toContain('OLLAMA_NUM_PARALLEL="1"');
  });
  it('gives the Ollama installer lspci, so it installs the GPU build, and refuses a CPU load', () => {
    // Without lspci the installer fetched the CPU build and Qwen ran on a 4090 at 0 GB of VRAM.
    expect(script).toMatch(/apt-get[^\n]*pciutils/);
    expect(script).toContain('on_gpu(TAG)');
    const bootstrap = readFileSync(join(root, 'infra', 'runpod', 'bootstrap.sh'), 'utf8');
    expect(bootstrap).toContain('pciutils');
  });
  it('checks the token in constant time on every request', () => {
    expect(script).toContain('hmac.compare_digest');
    expect(script.match(/if not self\.authorised\(\):/g)).toHaveLength(2);
  });
});

describe('rent so far', () => {
  it('is hours since the pod started billing times its price', () => {
    const pod = { since: '2026-09-26T12:00:00Z', usdPerHour: 0.2 } as Pod;
    expect(spentUsd(pod, Date.parse('2026-09-26T13:30:00Z'))).toBeCloseTo(0.3, 6);
    expect(spentUsd({ ...pod, since: '' }, Date.now())).toBe(0);
  });
});
