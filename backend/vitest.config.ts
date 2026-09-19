/**
 * The suite gets its own fetch cache.
 *
 * `CACHE_DIR` is read at import time, so an assignment inside a test file lands after the module
 * it needs to affect has already been evaluated. Here is early enough, and it covers every test
 * rather than the two that happen to build a Fetcher today.
 *
 * A fresh one for every run, not one fixed directory. The cache is keyed by URL and the fixtures
 * are served on ephemeral ports, so a fixed directory only moved the collision the separate cache
 * was made to stop: a test handed a port an earlier run had used was answered from disk, never
 * asked for robots.txt, and failed about one run in three.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: { LEXDROID_CACHE_DIR: mkdtempSync(join(tmpdir(), 'lexdroid-test-cache-')) },
  },
});
