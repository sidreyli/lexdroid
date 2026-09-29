/**
 * A GPU type an engine cannot use is never offered for it, however cheap.
 *
 * On 29 September the interface rented Engine B an RTX 4090, the cheapest 24 GB card under the
 * ceiling, and Qwen loaded on its CPU ("loaded with 0.0 of 17.8 GB on the GPU"), as it had on a
 * 4090 and a 5090 two days before. Price alone chose it every time.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const gpuTypes = [
  { id: 'NVIDIA GeForce RTX 4090', memoryInGb: 24, communityPrice: 0.34, securePrice: 0.69, communityCloud: true, secureCloud: true },
  { id: 'NVIDIA RTX A5000', memoryInGb: 24, communityPrice: 0.16, securePrice: 0.27, communityCloud: true, secureCloud: true },
  { id: 'NVIDIA GeForce RTX 3090', memoryInGb: 24, communityPrice: 0.22, securePrice: null, communityCloud: true, secureCloud: false },
  { id: 'NVIDIA RTX A4000', memoryInGb: 16, communityPrice: 0.17, securePrice: 0.25, communityCloud: true, secureCloud: true },
];

async function offersWith() {
  vi.resetModules();
  process.env['RUNPOD_API_KEY'] = 'test-key';
  vi.doMock('undici', async (original) => ({
    ...(await original<typeof import('undici')>()),
    request: async () => ({ body: { json: async () => ({ data: { gpuTypes } }) } }),
  }));
  return (await import('../src/gpu/runpod.js')).offers;
}

afterEach(() => {
  vi.doUnmock('undici');
  delete process.env['RUNPOD_API_KEY'];
});

describe('the GPUs an engine is offered', () => {
  it('leaves out the types it is told to avoid, whatever they cost', async () => {
    const offers = await offersWith();
    const got = await offers({ provider: 'RunPod', minGpuMemoryGb: 24, maxUsdPerHour: 0.34, avoidGpus: ['RTX 4090', 'RTX 3090'] });
    expect(got.map((o) => `${o.gpu} ${o.cloud}`)).toEqual(['NVIDIA RTX A5000 COMMUNITY', 'NVIDIA RTX A5000 SECURE']);
  });

  it('offers every type that fits when nothing is avoided', async () => {
    const offers = await offersWith();
    const got = await offers({ provider: 'RunPod', minGpuMemoryGb: 24, maxUsdPerHour: 0.34 });
    expect(got.map((o) => o.gpu)).toContain('NVIDIA GeForce RTX 4090');
    expect(got.map((o) => o.gpu)).not.toContain('NVIDIA RTX A4000');
  });
});
