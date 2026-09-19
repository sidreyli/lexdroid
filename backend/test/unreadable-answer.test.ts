/**
 * An answer nobody can read is not the answer "nothing applies".
 *
 * The reader used to turn any response it could not parse into an empty list of findings, which is
 * indistinguishable from the ruling "I read this provision and it imposes nothing" -- the evidence
 * a zero is made of. A truncated JSON object, a refusal in prose, a list of strings: all of them
 * scored as absence. They are failures, and a failure is not a verdict.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const answers: string[] = [];

vi.mock('../src/engines/ollama.js', async (importActual) => {
  const real = (await importActual()) as Record<string, unknown>;
  return {
    ...real,
    generate: async () => ({
      text: answers.shift() ?? '{"findings":[]}',
      model: 'test-model',
      promptTokens: 1,
      completionTokens: 1,
      durationMs: 1,
      fromCache: false,
      fromResume: false,
    }),
  };
});

const { readSection } = await import('../src/read/index.js');
const { loadRubric } = await import('../src/rubric/index.js');
const { MEASURES } = await import('../src/rubric/measures.js');

const rubric = loadRubric();
const indicators = rubric.indicators.filter((i) => i.id.startsWith('9.'));

const TEXT =
  'A licensee must not publish any advertisement that is false or misleading in a material particular.';

const section = { sectionId: 1, instrumentTitle: 'Consumer Protection Act 1999', headingPath: 'Part II, s 10', text: TEXT };

const read = () => readSection(section, 9, 'Consumer protection', indicators);

beforeEach(() => {
  answers.length = 0;
});

describe('an answer the reader cannot use', () => {
  it('fails on an answer that is not JSON', async () => {
    answers.push('I am sorry, I cannot help with that request.');
    const r = await read();
    expect(r.failure).toMatch(/not JSON/);
    expect(r.findings).toEqual([]);
  });

  it('fails on JSON that is not the object asked for', async () => {
    answers.push('[{"indicatorId":"9.3"}]');
    const r = await read();
    expect(r.failure).toMatch(/no list of findings/);
  });

  it('fails on a truncated object', async () => {
    answers.push('{"findings":[{"indicatorId":"9.3","quote":"A licensee must not pub');
    const r = await read();
    expect(r.failure).toMatch(/not JSON/);
  });

  it('says how much output it could not read, so a runaway is recognisable', async () => {
    answers.push('x'.repeat(4_000));
    const r = await read();
    expect(r.failure).toMatch(/4000 characters of output/);
  });

  it('still reports no findings and no failure where the answer is a proper empty list', async () => {
    answers.push('{"findings":[]}');
    const r = await read();
    expect(r.failure).toBeNull();
    expect(r.findings).toEqual([]);
  });
});

describe('a claim inside a well-formed answer', () => {
  const measure = MEASURES['9.3']![0]!.token;

  it('counts an item that is not a finding at all, rather than dropping it', async () => {
    answers.push('{"findings":[{"note":"see the schedule"}]}');
    const r = await read();
    expect(r.failure).toBeNull();
    expect(r.findings).toEqual([]);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]!.reason).toMatch(/names no indicator or quotes nothing/);
  });

  it('rejects a finding that does not say what force the duty has', async () => {
    answers.push(
      JSON.stringify({
        findings: [
          {
            indicatorId: '9.3',
            measure,
            quote: 'A licensee must not publish any advertisement that is false or misleading',
            dutyBearer: 'A licensee',
            dutyAct: 'must not publish',
            mandatory: true,
            dutyBearerKind: 'organisation',
            requirement: 'A licensee may not publish misleading advertising.',
          },
        ],
      }),
    );
    const r = await read();
    expect(r.findings).toEqual([]);
    expect(r.rejected[0]!.reason).toMatch(/does not state dutyForce/);
  });

  it('rejects a finding that does not say whom the duty binds', async () => {
    answers.push(
      JSON.stringify({
        findings: [
          {
            indicatorId: '9.3',
            measure,
            quote: 'A licensee must not publish any advertisement that is false or misleading',
            dutyBearer: 'A licensee',
            dutyAct: 'must not publish',
            dutyForce: 'forbids',
            mandatory: true,
            requirement: 'A licensee may not publish misleading advertising.',
          },
        ],
      }),
    );
    const r = await read();
    expect(r.findings).toEqual([]);
    expect(r.rejected[0]!.reason).toMatch(/does not state dutyBearerKind/);
  });
});

describe('a long provision read in parts', () => {
  const long = { ...section, text: `${TEXT}\n`.repeat(400) };

  it('fails the whole reading where one part could not be read', async () => {
    // The first part answers cleanly and the second does not. Banking the first part's "nothing
    // applies" would state an absence over text nobody saw.
    answers.push('{"findings":[]}', 'the model apologises');
    const r = await readSection(long, 9, 'Consumer protection', indicators);
    expect(r.failure).toMatch(/part 2 of/);
    expect(r.findings).toEqual([]);
  });

  it('adds up what every part cost, so a long provision is not billed as one call', async () => {
    const r = await readSection(long, 9, 'Consumer protection', indicators);
    expect(r.failure).toBeNull();
    expect(r.promptTokens).toBeGreaterThan(1);
  });
});
