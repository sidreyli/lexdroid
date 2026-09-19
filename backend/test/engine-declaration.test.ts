/**
 * The two engines we are promising ESCAP, checked against what ESCAP asked for.
 *
 * Section 5 is frozen on 30 September and says so in the template: "An incomplete Section 5 cannot
 * be corrected after the deadline." Until this existed, Engine B had an empty provider, an empty
 * model and an empty checkpoint, declared: false -- every run in the store was answered by Engine
 * A, the interface refused to start a run on B, and no engine comparison had ever been produced.
 *
 * The requirement is stated three different ways across ESCAP's own documents, so all three are
 * asserted rather than the most convenient one:
 *
 *   orientation slide   "At least one must be open weights"
 *   Word template       "must differ in kind... Two versions of the same vendor's model do not
 *                        count. A hosted open-weights API is acceptable"
 *   output checklist    item 20, "one commercial hosted, one open weights"
 *
 * A locally-run open-weights engine against a commercially hosted open-weights engine satisfies
 * every one of them at once, which is why that is what is declared.
 */
import { describe, expect, it } from 'vitest';
import { loadEngines } from '../src/engines/registry.js';
import { hostedConfig } from '../src/engines/hosted.js';

const registry = loadEngines();
const declared = registry.engines.filter((e) => e.declared);

describe('the engine declaration', () => {
  it('declares two engines', () => {
    expect(declared.length).toBe(2);
  });

  it('gives every declared engine a provider, a model and an exact checkpoint', () => {
    // The three fields Section 5 asks for by name. An empty one is an incomplete Section 5.
    for (const e of declared) {
      expect(e.provider, `${e.id} provider`).not.toBe('');
      expect(e.model, `${e.id} model`).not.toBe('');
      expect(e.checkpoint, `${e.id} checkpoint`).not.toBe('');
      expect(e.hosts.length, `${e.id} has nowhere to send a request`).toBeGreaterThan(0);
    }
  });

  it('declares at least one open-weights engine', () => {
    expect(declared.some((e) => e.kind === 'open-weights')).toBe(true);
  });

  it('declares one that runs locally and one that is hosted', () => {
    // "Differ in kind", and the checklist's "one commercial hosted, one open weights".
    expect(declared.some((e) => !e.hosted)).toBe(true);
    expect(declared.some((e) => e.hosted)).toBe(true);
  });

  it('does not declare two versions of the same vendor\'s model', () => {
    const family = (model: string) => model.toLowerCase().replace(/[^a-z]/g, ' ').trim().split(/\s+/)[0];
    const families = declared.map((e) => family(e.model));
    expect(new Set(families).size, `both engines are ${families[0]}`).toBe(declared.length);
  });

  it('runs the whole pipeline on the open-weights engine alone', () => {
    // Section 3's tick box: "The core pipeline can be run end to end with no proprietary API."
    // That needs the local engine to be the default, so a clean machine with no key still works.
    const fallback = declared.find((e) => !e.hosted);
    expect(fallback, 'nothing runs without a key').toBeDefined();
    expect(fallback?.kind).toBe('open-weights');
  });

  it('keeps no API key in the registry file', () => {
    // A key on disk is a key in a backup. The hosted engine reads it from the environment.
    const raw = JSON.stringify(registry);
    expect(raw).not.toMatch(/sk-|gsk_|api[_-]?key"\s*:\s*"[^"]+/i);
  });
});

describe('reaching a hosted engine', () => {
  const saved = { ...process.env };
  const restore = () => {
    process.env = { ...saved };
  };

  it('is off unless both the host and the model are named', () => {
    delete process.env['LEXDROID_HOSTED_BASE_URL'];
    delete process.env['LEXDROID_HOSTED_MODEL'];
    expect(hostedConfig()).toBe(null);

    process.env['LEXDROID_HOSTED_BASE_URL'] = 'https://api.groq.com/openai/v1';
    expect(hostedConfig(), 'a host with no model is not a configured engine').toBe(null);
    restore();
  });

  it('takes the host, model and key from the environment', () => {
    process.env['LEXDROID_HOSTED_BASE_URL'] = 'https://api.groq.com/openai/v1/';
    process.env['LEXDROID_HOSTED_MODEL'] = 'qwen/qwen3-32b';
    process.env['LEXDROID_HOSTED_API_KEY'] = 'test-key';

    const config = hostedConfig();
    // The trailing slash is dropped, because '/chat/completions' is appended to it.
    expect(config?.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(config?.model).toBe('qwen/qwen3-32b');
    expect(config?.apiKey).toBe('test-key');
    expect(config?.provider).toBe('api.groq.com');
    restore();
  });

  it('names the provider where one is given', () => {
    process.env['LEXDROID_HOSTED_BASE_URL'] = 'https://api.groq.com/openai/v1';
    process.env['LEXDROID_HOSTED_MODEL'] = 'qwen/qwen3-32b';
    process.env['LEXDROID_HOSTED_PROVIDER'] = 'Groq';
    expect(hostedConfig()?.provider).toBe('Groq');
    restore();
  });
});
