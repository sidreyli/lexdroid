/**
 * The word a provision has to use to be a given measure, and whether it is the measure's own word.
 *
 * `defines` says what a provision must state to be a measure, and the reader copies those words
 * out; MEASURE_NAMES is what checks that the words it copied say the thing. Two of those checks
 * were wrong in a way that no test could see, because a gate is only ever exercised by the findings
 * that reach it: one measure had no gate and took provisions that say the opposite of it, and
 * another was gated on a word it had no reason to use. Three cells each, in all three economies.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES, MEASURE_NAMES } from '../src/rubric/measures.js';

/** The gate for a measure, by token, wherever the token is declared. */
function gate(token: string): RegExp {
  const re = MEASURE_NAMES[token];
  if (!re) throw new Error(`${token} has no name gate`);
  return re;
}

describe('a gate is the measure\'s own word', () => {
  // The check that would have caught both defects below without anyone reading a cell: a gate
  // asking for a word the measure's own defining sentence does not use is asking for the wrong
  // word. `sim-registration` was gated on LICENCE while asking for "the words requiring the
  // subscriber identity to be recorded" -- a SIM rule says identity, and says licence only by
  // accident.
  it('matches the defining sentence of the measure it gates', () => {
    const wrong: string[] = [];
    for (const [id, measures] of Object.entries(MEASURES)) {
      for (const m of measures) {
        const re = MEASURE_NAMES[m.token];
        if (!re) continue;
        // 7.3's maximum retention names the moment the keeping stops rather than the span, and is
        // rightly gated on the span. It is the only measure whose sentence and gate differ.
        if (m.token === 'maximum-retention') continue;
        if (!re.test(m.defines)) wrong.push(`${id} ${m.token}: /${re.source.slice(0, 40)}/ vs "${m.defines}"`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe('a measure named by what a rule lets happen without', () => {
  const opaque = gate('opaque-standard-setting');

  it('turns away a provision that publishes, consults or invites comment', () => {
    // Section 132 of the Telecommunications Act 1997, headed "Public consultation on industry
    // standards", decided Australia's 11.1 cell on these words. ESCAP scores the economy 0.
    expect(opaque.test('free copies of the draft will be made available to members of the public')).toBe(false);
    expect(opaque.test('must have the following objects')).toBe(false);
    expect(opaque.test('standards, condition, restriction, specification, requirement or code')).toBe(false);
  });

  it('admits one that says the publicity need not happen', () => {
    expect(opaque.test('may be adopted without publication')).toBe(true);
    expect(opaque.test('the Authority need not give notice')).toBe(true);
    expect(opaque.test('deliberations are confidential')).toBe(true);
    expect(opaque.test('no requirement to invite comment')).toBe(true);
  });

  it('is not made out by the topic, which a transparency duty shares', () => {
    // The trap the missing gate fell into: every word naming standard-setting appears in the rules
    // that mandate openness, so topic cannot tell the measure from its own negation.
    expect(opaque.test('technical standards published for public comment')).toBe(false);
  });
});

describe('the two identity measures in pillar 8', () => {
  it('turn away provisions that identify nobody', () => {
    const user = gate('user-identity');
    // All three decided Australia's 8.3 cell at the top band: a customs declaration for imported
    // timber, a duty to keep records of personal data, and an agreement in writing.
    expect(user.test('declaration')).toBe(false);
    expect(user.test('personal data')).toBe(false);
    expect(user.test('service agreement or access agreement')).toBe(false);
  });

  it('admit the subscriber identity a SIM rule actually records', () => {
    // Gated on LICENCE, this asked a SIM registration rule for a word meaning licence. Malaysia
    // had seven such findings and scored the band above them.
    const sim = gate('sim-registration');
    expect(sim.test('the identity of the subscriber must be recorded')).toBe(true);
    expect(sim.test('verify the identity of the customer before activation')).toBe(true);
    expect(sim.test('proof of identity')).toBe(true);
  });

  it('are both named by identity, because both are about identifying someone', () => {
    expect(gate('user-identity').source).toBe(gate('sim-registration').source);
  });
});
