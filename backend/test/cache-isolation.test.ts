/**
 * The suite does not write to the cache the run uses.
 *
 * The fetcher's tests serve fixtures from a local server on an ephemeral port, and the cache is
 * keyed by URL, so those fixtures were being written into the real cache as
 * `http://127.0.0.1:<port>/a-page` -- 1,046 records beside the fetched corpus. Ports get reused,
 * and a test handed a port some earlier test had cached was answered from disk without the fetcher
 * ever asking for robots.txt. That is what made the robots tests fail about one run in three while
 * passing every time they were run alone.
 *
 * This is the guard rather than the fix: the fix is LEXDROID_CACHE_DIR in vitest.config.ts, and
 * this fails if it is removed.
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CACHE_DIR } from '../src/fetch/index.js';

describe('the cache a test writes to', () => {
  it('is not the one a run reads from', () => {
    const real = resolve(import.meta.dirname, '..', 'data', 'cache');
    expect(resolve(CACHE_DIR)).not.toBe(real);
  });

  it('is somewhere a test is allowed to write', () => {
    // Set, not merely different: an unset variable would take the default, which is the real one.
    expect(process.env['LEXDROID_CACHE_DIR']).toBeTruthy();
    expect(resolve(CACHE_DIR)).toBe(resolve(process.env['LEXDROID_CACHE_DIR']!));
  });
});
