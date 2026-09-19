/**
 * A connection that drops without an answer is asked again, not counted as a refusal.
 *
 * The defect this exists for: registering India's 847 Central Acts walks the India Code API one
 * page of 100 at a time. The fourth page came back `read ECONNRESET`, the whole portal walk threw,
 * and the three pages already gathered were discarded -- "found 0, added 0". The same URL served
 * 1.3MB on the very next attempt, three times out of three.
 *
 * A reset is not a decision the host made about us. It said nothing. The retry ladder above it
 * only ever covered responses the host actually sent -- 429, 503, an empty 200 -- so a fault in
 * the transport skipped it entirely and went straight to the refusal count.
 *
 * What must stay true is the other half: a host that has genuinely stopped listening is still
 * abandoned rather than ground against, which is what the silent-host test in fetch.test.ts pins.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { openDb } from '../src/db/index.js';

// A successful fetch writes the document into the cache, and the cache is keyed by URL alone. Kept
// on the default path these tests would both read each other's answers and leave records behind in
// the working store's cache, so they get one of their own and take it with them.
const CACHE = mkdtempSync(join(tmpdir(), 'lexdroid-transport-'));
process.env['LEXDROID_CACHE_DIR'] = CACHE;
afterAll(() => rmSync(CACHE, { recursive: true, force: true }));

const { Fetcher, TransportFault } = await import('../src/fetch/index.js');

/** A fetcher whose network is a script of outcomes, one per attempt. */
function scripted(outcomes: ('drop' | 'ok')[]) {
  const db = openDb(':memory:');
  const fetcher = new Fetcher({ db, sourceMode: 'fetch', transportRetryMs: [0, 0] });
  let attempts = 0;
  (fetcher as unknown as { send: (url: string) => Promise<unknown> }).send = async (url: string) => {
    const outcome = outcomes[attempts] ?? 'ok';
    attempts += 1;
    if (outcome === 'drop') throw new Error('read ECONNRESET');
    return { status: 200, mediaType: 'application/json', body: Buffer.from('{"ok":true}'), finalUrl: url };
  };
  (fetcher as unknown as { ensureRobots: () => Promise<unknown> }).ensureRobots = async () => ({
    disallow: [], allow: [], crawlDelayMs: 0, fetched: true,
  });
  return { db, fetcher, attempts: () => attempts };
}

describe('a connection that drops before the host answers', () => {
  it('is asked again, and the answer is the one the caller gets', async () => {
    const { db, fetcher, attempts } = scripted(['drop', 'ok']);
    const res = await fetcher.fetch('https://indiacode.gov.in/server/api/discover/search/objects?page=3');
    expect(res.status).toBe(200);
    expect(res.body.toString()).toContain('ok');
    expect(attempts()).toBe(2);
    db.close();
  });

  it('survives more than one drop in a row, up to the retries it has', async () => {
    const { db, fetcher, attempts } = scripted(['drop', 'drop', 'ok']);
    await expect(fetcher.fetch('https://indiacode.gov.in/twice')).resolves.toMatchObject({ status: 200 });
    expect(attempts()).toBe(3);
    db.close();
  });

  it('gives up once the retries run out, and says it was the transport', async () => {
    const { db, fetcher, attempts } = scripted(['drop', 'drop', 'drop']);
    await expect(fetcher.fetch('https://indiacode.gov.in/gone')).rejects.toBeInstanceOf(TransportFault);
    expect(attempts()).toBe(3);
    db.close();
  });

  it('does not count a drop it recovered from against the host', async () => {
    // The refusal streak is what trips the breaker. A page that dropped once and then served is
    // not evidence the host is unwell, and must not bring the crawl closer to being abandoned.
    const { db, fetcher } = scripted(['drop', 'ok', 'drop', 'ok', 'drop', 'ok', 'drop', 'ok']);
    for (const page of [0, 1, 2, 3]) {
      await expect(fetcher.fetch(`https://indiacode.gov.in/page${page}`)).resolves.toMatchObject({ status: 200 });
    }
    expect(db.prepare("SELECT * FROM host_cooldown WHERE host = 'indiacode.gov.in'").get()).toBeUndefined();
    db.close();
  });
});
