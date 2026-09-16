/**
 * The suite gets its own fetch cache.
 *
 * `CACHE_DIR` is read at import time, so an assignment inside a test file lands after the module
 * it needs to affect has already been evaluated. Here is early enough, and it covers every test
 * rather than the two that happen to build a Fetcher today.
 */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { LEXDROID_CACHE_DIR: join(tmpdir(), 'lexdroid-test-cache') },
  },
});
