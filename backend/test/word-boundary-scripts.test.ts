/**
 * `\b` does not mean what it looks like it means beside a non-Latin letter.
 *
 * JavaScript defines the word boundary against `\w`, which is `[A-Za-z0-9_]` and nothing else. So
 * there is no boundary between a space and a Cyrillic letter, and `/\bБҮЛЭГ/` never matches
 * anything at all. Not sometimes, not less often -- never.
 *
 * It cost a real defect. The first Mongolian parser used `/^[^.]{0,48}\bБҮЛЭГ\s*$/` to find a
 * chapter heading. It found none, on any document, and the heading paths it produced simply read
 * like instruments that have no chapters -- which is exactly what a corpus of Mongolian law would
 * look like if it had none. Nothing threw, no count was short, and it was caught only because a
 * fixture asserted the chapter was in the path.
 *
 * Five of the eight profiled economies publish in a non-Latin script, so this will be reachable
 * again the moment someone writes a pattern for Thai, Lao, Mongolian, Russian or Hindi. This test
 * is the guard, and it is deliberately narrow: `\b` beside an ASCII word is correct and common,
 * and `\b` beside an em dash or a curly quote is harmless. What it refuses is the one combination
 * that is always wrong.
 *
 * If you need a boundary in a non-Latin pattern, the alternatives that do work are an explicit
 * character class (`(?:^|\s)`), a lookahead for what may follow, or anchoring the whole string --
 * which is what `parse/legalinfo.ts` does.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');

/**
 * A letter outside the Latin script: Cyrillic, Thai, Lao, Devanagari, Han, and the rest.
 *
 * Asked as three plain questions rather than with a set-difference class, because this test is
 * the thing that has to be obviously right -- a guard whose own pattern is subtle is a guard that
 * passes for the wrong reason, which is how the first draft of it managed to report the source
 * clean while failing to detect the bug it was written for.
 */
function isNonLatinLetter(ch: string): boolean {
  return /\p{Letter}/u.test(ch) && !/[A-Za-z]/.test(ch) && !/\p{Script=Latin}/u.test(ch);
}

/**
 * Every `\b` in the line, with the character on each side of it.
 *
 * `\b` is two characters of source, so the neighbours sit at the index before it and two after.
 * Nothing here parses a regex literal: a `\b` in this codebase is only ever written inside one.
 */
function offenders(source: string): string[] {
  const found: string[] = [];
  source.split('\n').forEach((line, i) => {
    // Comments explain this bug; they are not patterns. The one in legalinfo.ts is the reason
    // this test exists and must not be what it fails on.
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (let at = code.indexOf('\\b'); at >= 0; at = code.indexOf('\\b', at + 2)) {
      const before = code[at - 1] ?? '';
      const after = code[at + 2] ?? '';
      if (isNonLatinLetter(before) || isNonLatinLetter(after)) {
        found.push(`line ${i + 1}: ${line.trim().slice(0, 110)}`);
        return;
      }
    }
  });
  return found;
}

function everySourceFile(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) everySourceFile(path, out);
    else if (entry.name.endsWith('.ts')) out.push(path);
  }
  return out;
}

describe('a word boundary beside a non-Latin letter', () => {
  it('is what it looks like only for ASCII, and the rest of this test depends on that', () => {
    // The fact itself, asserted so the reason for the rule is not just prose.
    expect(/\bБҮЛЭГ/.test('НЭГДҮГЭЭР БҮЛЭГ')).toBe(false);
    expect(/\bзүйл/.test('1 дүгээр зүйл')).toBe(false);
    expect(/\bມາດຕາ/.test('ມາດຕາ 12')).toBe(false);
    // The same patterns written without it do match.
    expect(/(?:^|\s)БҮЛЭГ/.test('НЭГДҮГЭЭР БҮЛЭГ')).toBe(true);
    expect(/БҮЛЭГ/.test('НЭГДҮГЭЭР БҮЛЭГ')).toBe(true);
    // And ASCII is unaffected, which is why most of this codebase's uses are correct.
    expect(/\brepealed\b/.test('this section is repealed')).toBe(true);
  });

  it('appears nowhere in the source', () => {
    const bad: string[] = [];
    for (const file of everySourceFile(SRC)) {
      for (const hit of offenders(readFileSync(file, 'utf8'))) {
        bad.push(`${relative(SRC, file).replace(/\\/g, '/')} ${hit}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('catches the pattern that caused this, so the guard is known to work', () => {
    // The literal first draft of legalinfo.ts's chapter pattern.
    expect(offenders(String.raw`const CHAPTER = /^[^.]{0,48}\bБҮЛЭГ\s*$/iu;`)).toHaveLength(1);
    expect(offenders(String.raw`const A = /зүйл\b/u;`)).toHaveLength(1);
    // And does not fire on the things that are fine.
    expect(offenders(String.raw`const OK = /\brepealed\b/i;`)).toEqual([]);
    expect(offenders(String.raw`const DASH = /\bAct\b[—–]\d{4}/;`)).toEqual([]);
    expect(offenders(String.raw`const RUPEE = /₹(?=\s?\d)|\bINR\b/i;`)).toEqual([]);
  });
});
