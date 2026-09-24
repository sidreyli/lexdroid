/**
 * A looping answer costs the indicators it was asked about, not the provision.
 *
 * Ollama aborts a generation that repeats itself, and an answer that runs to the output limit is
 * the tail of the same loop. Either way the reader lost the whole provision: every indicator in
 * the pillar lost it, including the ones the engine had already answered for before it started
 * repeating. That was 32 provisions on Malaysia's rerun and 27 on Australia's.
 *
 * Re-asking cannot help, because the loop is deterministic at temperature zero. A smaller ask can,
 * because the answer is one object per indicator asked: halving the ask halves what the engine has
 * to write. Halved down to one, the indicator left at the bottom is the one that actually loops.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

/** Indicators the fake engine loops on, rather than answers. */
const LOOPS_ON = new Set<string>();
/** Every ask the engine saw, as the sorted list of indicators it covered. */
const asks: string[][] = [];
let failure: 'overran' | 'silent' = 'overran';

vi.mock('../src/engines/ollama.js', async (importActual) => {
  const real = (await importActual()) as Record<string, unknown>;
  const Overran = real['EngineOverran'] as new (...a: never[]) => Error;
  const Silent = real['EngineSilent'] as new (...a: never[]) => Error;
  return {
    ...real,
    generate: async (prompt: string) => {
      const asked = ['9.1', '9.3', '9.4'].filter((id) => prompt.includes(id));
      asks.push(asked);
      if (asked.some((id) => LOOPS_ON.has(id))) {
        throw failure === 'overran'
          ? new (Overran as never as new (m: string, l: number, p: number, c: number, d: number) => Error)(
              'test-model',
              4096,
              10,
              4096,
              1,
            )
          : new (Silent as never as new (m: string, d: string) => Error)('test-model', 'nothing at all');
      }
      return {
        text: JSON.stringify({ findings: asked.map((id) => finding(id)) }),
        model: 'test-model',
        promptTokens: 10,
        completionTokens: 20,
        durationMs: 1,
        fromCache: false,
        fromResume: false,
      };
    },
  };
});

const { readSection } = await import('../src/read/index.js');
const { loadRubric } = await import('../src/rubric/index.js');

const TEXT =
  'A licensee must not publish any advertisement that is false or misleading in a material '
  + 'particular, and the Commission may direct a licensee to block access to any such advertisement.';

const MEASURE: Record<string, string> = {
  '9.1': 'content-blocking',
  '9.3': 'advertising-restriction',
  '9.4': 'content-licence',
};

/** An answer the reader accepts: every phrase is the provision's own. */
function finding(indicatorId: string) {
  return {
    indicatorId,
    measure: MEASURE[indicatorId],
    quote: 'A licensee must not publish any advertisement that is false or misleading',
    dutyBearer: 'A licensee',
    dutyAct: 'must not publish',
    dutyForce: 'forbids',
    dutyBearerKind: 'organisation',
    mandatory: true,
    sectorScope: 'all',
    dataScope: 'specific-category',
    definingWords: 'must not publish any advertisement',
  };
}

const indicators = loadRubric().indicators.filter((i) => i.id.startsWith('9.'));
const section = {
  sectionId: 1,
  instrumentTitle: 'Communications and Multimedia Act 1998',
  headingPath: 'Part VIII, s 211',
  text: TEXT,
};
const read = () => readSection(section, 9, 'Content Access', indicators);

beforeEach(() => {
  LOOPS_ON.clear();
  asks.length = 0;
  failure = 'overran';
});

describe('a provision the engine loops on', () => {
  it('is still read for the indicators that did not loop', async () => {
    LOOPS_ON.add('9.3');
    const r = await read();

    expect(r.findings.map((f) => f.indicatorId).sort()).toEqual(['9.1', '9.4']);
    expect(r.rejected).toEqual([]);
    expect(r.unanswered).toEqual(['9.3']);
    expect(r.runaway).toBe(true);
    expect(r.failure).toMatch(/cut off at the 4096-token limit/);
  });

  it('halves the ask down to the one indicator that loops, and no further', async () => {
    LOOPS_ON.add('9.3');
    await read();

    // The whole pillar, then each half, then each half of the half that failed.
    expect(asks.map((a) => a.join('+'))).toEqual(['9.1+9.3+9.4', '9.1+9.3', '9.1', '9.3', '9.4']);
  });

  it('counts every call it paid for, the failed ones included', async () => {
    LOOPS_ON.add('9.3');
    const r = await read();

    expect(r.calls).toBe(asks.length);
    expect(r.completionTokens).toBe(3 * 4096 + 2 * 20);
  });

  it('loses the provision only where every indicator loops', async () => {
    for (const id of ['9.1', '9.3', '9.4']) LOOPS_ON.add(id);
    const r = await read();

    expect(r.findings).toEqual([]);
    expect([...(r.unanswered ?? [])].sort()).toEqual(['9.1', '9.3', '9.4']);
    expect(r.failure).not.toBeNull();
  });

  it('does not split an engine that failed for any other reason, because splitting is not a retry', async () => {
    failure = 'silent';
    LOOPS_ON.add('9.3');
    const r = await read();

    expect(asks).toHaveLength(1);
    expect(r.runaway).toBeUndefined();
    expect(r.findings).toEqual([]);
    expect([...(r.unanswered ?? [])].sort()).toEqual(['9.1', '9.3', '9.4']);
  });
});
