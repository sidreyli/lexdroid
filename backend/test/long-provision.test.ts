/**
 * A provision longer than one reading.
 *
 * The reader used to cut at twelve thousand characters and append a note that the text continued.
 * Nothing downstream knew: the finding list was banked against the whole provision, so "nothing in
 * this section applies" covered the part that had never been shown. Malaysia's Personal Data
 * Protection Act has sections past 30,000 characters, and the corpus holds 643 provisions longer
 * than the old cut.
 *
 * Now the provision is read in overlapping parts and the findings are pooled.
 */
import { describe, expect, it } from 'vitest';
import { windowsOf } from '../src/read/index.js';

/** A provision of `n` characters made of numbered sentences, so a part can be located in it. */
function provision(n: number): string {
  let out = '';
  for (let i = 0; out.length < n; i++) out += `Clause ${i} states a requirement of some length. `;
  return out.slice(0, n);
}

describe('cutting a long provision into parts', () => {
  it('leaves a provision that fits in one reading alone', () => {
    const text = provision(500);
    expect(windowsOf(text, 1_000, 100)).toEqual([text]);
  });

  it('covers every character of the provision', () => {
    const text = provision(10_000);
    const parts = windowsOf(text, 1_000, 100);
    // Reassembled by following each part's start, the parts are the provision again.
    let at = 0;
    let seen = '';
    for (const part of parts) {
      const from = text.indexOf(part, Math.max(0, at - part.length));
      expect(from).toBeGreaterThanOrEqual(0);
      seen = seen.slice(0, from) + part;
      at = from + part.length;
    }
    expect(seen).toBe(text);
  });

  it('overlaps consecutive parts, so a clause one part cuts is whole in the next', () => {
    const parts = windowsOf(provision(10_000), 1_000, 200);
    expect(parts.length).toBeGreaterThan(1);
    for (let i = 1; i < parts.length; i++) {
      const tail = parts[i - 1]!.slice(-100);
      expect(parts[i]!).toContain(tail);
    }
  });

  it('never writes a part longer than the reading budget', () => {
    for (const part of windowsOf(provision(50_000), 1_000, 200)) {
      expect(part.length).toBeLessThanOrEqual(1_000);
    }
  });

  it('cuts at a sentence or paragraph break rather than mid-word', () => {
    const parts = windowsOf(provision(6_000), 1_000, 200);
    for (const part of parts.slice(0, -1)) {
      expect(part.trimEnd()).toMatch(/[.;]$/);
    }
  });

  it('terminates on text with no break to cut at', () => {
    const parts = windowsOf('x'.repeat(5_000), 1_000, 200);
    expect(parts.length).toBe(Math.ceil((5_000 - 1_000) / 800) + 1);
    expect(parts.join('').length).toBeGreaterThanOrEqual(5_000);
  });

  it('makes progress even where the overlap is as wide as the part', () => {
    // An overlap that consumed the whole part would loop forever. It advances by at least one.
    const parts = windowsOf(provision(3_000), 1_000, 1_000);
    expect(parts.length).toBeLessThan(3_100);
    expect(parts[parts.length - 1]!.endsWith(provision(3_000).slice(-20))).toBe(true);
  });
});
