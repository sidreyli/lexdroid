/**
 * Reading the one `.env`.
 *
 * There was no loader. `engines.json` says the hosted key comes from `LEXDROID_HOSTED_API_KEY` in
 * the environment, which is right -- a key committed to a file is a key in a backup -- but nothing
 * put it there, so `engine-check` reported "LEXDROID_HOSTED_API_KEY is not set" on a machine with a
 * key sitting in a file at the repository root.
 *
 * What is asserted here is mostly what the loader must *not* do. It handles credentials, so it must
 * not clobber a variable someone set deliberately, must not leak values through its return, and
 * must not fall over on a file that has a comment or a shell-shaped `export` in it.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { envPath, loadEnv, parseEnv } from '../src/env.js';

const dirs: string[] = [];
const touched: string[] = [];

function root(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'lexdroid-env-'));
  dirs.push(dir);
  writeFileSync(join(dir, '.env'), contents, 'utf8');
  return dir;
}

function remember(...names: string[]): void {
  touched.push(...names);
}

afterEach(() => {
  for (const name of touched.splice(0)) delete process.env[name];
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('parsing a .env', () => {
  it('reads a plain assignment', () => {
    expect(parseEnv('FOO=bar').get('FOO')).toBe('bar');
  });

  it('ignores comments and blank lines', () => {
    const out = parseEnv('# a comment\n\nFOO=bar\n   \n# another\n');
    expect([...out.keys()]).toEqual(['FOO']);
  });

  it('accepts the shell-shaped file people paste', () => {
    // `export FOO=bar` is what a key handed over in a chat message usually looks like.
    expect(parseEnv('export FOO=bar').get('FOO')).toBe('bar');
  });

  it('strips surrounding quotes but keeps what is inside them', () => {
    expect(parseEnv('A="one two"').get('A')).toBe('one two');
    expect(parseEnv("B='one two'").get('B')).toBe('one two');
    expect(parseEnv('C="has # hash"').get('C')).toBe('has # hash');
  });

  it('drops a trailing comment from an unquoted value', () => {
    expect(parseEnv('FOO=bar   # why').get('FOO')).toBe('bar');
  });

  it('keeps an empty value rather than inventing one', () => {
    // .env.example ships LEXDROID_HOSTED_API_KEY= with nothing after it. That must read as empty,
    // not as the string "undefined", or hostedConfig would think a key was present.
    expect(parseEnv('LEXDROID_HOSTED_API_KEY=').get('LEXDROID_HOSTED_API_KEY')).toBe('');
  });

  it('skips a line that is not an assignment', () => {
    const out = parseEnv('just some prose\n=novalue\n9INVALID=x\nFOO=bar');
    expect([...out.keys()]).toEqual(['FOO']);
  });

  it('handles CRLF, because the file is edited on Windows', () => {
    expect(parseEnv('A=1\r\nB=2\r\n').get('B')).toBe('2');
  });
});

describe('loading it into the environment', () => {
  it('sets what is not already set', () => {
    remember('LEXDROID_TEST_ONE');
    const set = loadEnv(root('LEXDROID_TEST_ONE=from-file'));
    expect(set).toContain('LEXDROID_TEST_ONE');
    expect(process.env['LEXDROID_TEST_ONE']).toBe('from-file');
  });

  it('never overwrites a variable that is already set', () => {
    // `LEXDROID_HOSTED_API_KEY=... npm run ...` has to beat the file, or a deliberate one-off
    // becomes silently impossible and the wrong key gets used without anything saying so.
    remember('LEXDROID_TEST_TWO');
    process.env['LEXDROID_TEST_TWO'] = 'from-shell';
    const set = loadEnv(root('LEXDROID_TEST_TWO=from-file'));
    expect(set).not.toContain('LEXDROID_TEST_TWO');
    expect(process.env['LEXDROID_TEST_TWO']).toBe('from-shell');
  });

  it('returns the names it set and never the values', () => {
    // The return is logged. A loader that hands back secrets invites them into a log line.
    remember('LEXDROID_TEST_THREE');
    const set = loadEnv(root('LEXDROID_TEST_THREE=sk-do-not-print-me'));
    expect(set).toEqual(['LEXDROID_TEST_THREE']);
    expect(JSON.stringify(set)).not.toContain('sk-do-not-print-me');
  });

  it('is silent when there is no .env at all', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexdroid-env-'));
    dirs.push(dir);
    expect(loadEnv(dir)).toEqual([]);
  });

  it('looks for .env at the root it is given', () => {
    expect(envPath('/somewhere')).toMatch(/[\\/]somewhere[\\/]\.env$/);
  });
});
