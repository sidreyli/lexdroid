/**
 * Politeness, and the two failures that look like success.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { CacheMiss, Fetcher, parseRobots, USER_AGENT } from '../src/fetch/index.js';

describe('robots.txt', () => {
  it('reads the crawl delay a site asks for', () => {
    // sso.agc.gov.sg asks for six seconds. Our own floor is one, so the site's number has to win.
    const r = parseRobots('user-agent: *\ndisallow: /search\ncrawl-delay: 6\n');
    expect(r.crawlDelayMs).toBe(6000);
    expect(r.disallow).toEqual(['/search']);
  });

  it('applies only the rules addressed to everyone', () => {
    const r = parseRobots(
      'User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow: /private\nAllow: /private/public\n',
    );
    expect(r.disallow).toEqual(['/private']);
    expect(r.allow).toEqual(['/private/public']);
  });

  it('ignores comments and blank lines', () => {
    const r = parseRobots('# a comment\n\nuser-agent: *   # inline\ndisallow: /tmp\n');
    expect(r.disallow).toEqual(['/tmp']);
  });
});

describe('the user agent', () => {
  it('carries our name as well as a browser string', () => {
    // The CDN in front of Singapore Statutes Online answers 403 to any agent that does not look
    // like a browser. We append rather than disguise, so the site's own logs identify us.
    expect(USER_AGENT).toContain('LexDroid');
    expect(USER_AGENT).toContain('Mozilla/5.0');
  });
});

describe('cache-only mode', () => {
  it('refuses to reach the network instead of falling back to it', async () => {
    // This is what makes "the second engine fetched zero documents" a structural fact rather than
    // a promise, and the live test checks it directly.
    const db = openDb(':memory:');
    const fetcher = new Fetcher({ db, sourceMode: 'cache-only' });
    await expect(fetcher.fetch('https://example.gov/never-seen')).rejects.toBeInstanceOf(CacheMiss);

    const log = db.prepare('SELECT outcome FROM fetch_log').all() as { outcome: string }[];
    expect(log).toHaveLength(1);
    expect(log[0]!.outcome).toBe('skipped-cache-only');
    expect(fetcher.stats.network).toBe(0);
    db.close();
  });
});

describe('a success that is not the document', () => {
  it('recognises the shapes a throttled response arrives in', async () => {
    // Singapore Statutes Online answers 202 with a 2.4 KB AWS WAF challenge once a burst of
    // requests trips its rate rule. Stored as a document that becomes a law with no sections, and
    // then a cell reports "no restriction" from a page that was never served.
    const { __softBlockShapes } = await import('../src/fetch/index.js');
    expect(__softBlockShapes({ status: 202, body: Buffer.alloc(2432, 'x') })).toBe(true);
    expect(__softBlockShapes({ status: 200, body: Buffer.alloc(0) })).toBe(true);
    expect(__softBlockShapes({ status: 429, body: Buffer.from('slow down') })).toBe(true);
    expect(__softBlockShapes({ status: 200, body: Buffer.from('<script src="https://x.awswaf.com/challenge.js">') })).toBe(true);

    expect(__softBlockShapes({ status: 200, body: Buffer.alloc(50_000, 'x') })).toBe(false);
    expect(__softBlockShapes({ status: 404, body: Buffer.from('not found') })).toBe(false);
  });
});

describe('when robots.txt cannot be read', () => {
  it('slows down rather than falling back to the floor', async () => {
    // A throttled host will not serve robots.txt either. Treating "unknown" as "one second is
    // fine" is how a run crawling at the six seconds Singapore Statutes Online asks for silently
    // switched to one and got itself rate limited for the rest of the run.
    const { __unknownRobotsDelayMs } = await import('../src/fetch/index.js');
    expect(__unknownRobotsDelayMs).toBeGreaterThan(6000);
  });
});

describe('compression', () => {
  it('asks for it, and unwraps what comes back', async () => {
    // Measured on sso.agc.gov.sg 2026-09-06: one Act is 404,381 bytes uncompressed and 31,406
    // gzipped. Not asking meant taking thirteen times the bandwidth off a government server for
    // identical text -- impolite, and the slowest part of reading a corpus.
    const { __decompress } = await import('../src/fetch/index.js');
    const { gzipSync, deflateSync, brotliCompressSync } = await import('node:zlib');
    const law = Buffer.from('<div class="prov1">26. No person shall transfer personal data...</div>');

    expect(__decompress(gzipSync(law), 'gzip').equals(law)).toBe(true);
    expect(__decompress(deflateSync(law), 'deflate').equals(law)).toBe(true);
    expect(__decompress(brotliCompressSync(law), 'br').equals(law)).toBe(true);
    expect(__decompress(law, undefined).equals(law)).toBe(true);
    expect(__decompress(law, 'identity').equals(law)).toBe(true);

    // A challenge page mislabelled as gzip must survive as its own bytes, so that isSoftBlock can
    // recognise it. Throwing here would turn a throttle into a crashed run.
    const challenge = Buffer.from('<script src="https://x.awswaf.com/challenge.js">');
    expect(__decompress(challenge, 'gzip').equals(challenge)).toBe(true);
  });
});

describe('a host that will not serve us', () => {
  it('is given up on rather than ground against for hours', async () => {
    // Each refused document costs 30 + 90 + 240 seconds before the retry ladder gives up on it.
    // Without a limit, a host that has decided to refuse turns a 467-document queue into two days
    // of failing politely, and files every one of those documents as if the document were at
    // fault. The threshold has to be small enough that the run stops while it still means anything.
    const { __giveUpAfter, HostSuspended } = await import('../src/fetch/index.js');
    expect(__giveUpAfter).toBeGreaterThan(0);
    expect(__giveUpAfter).toBeLessThanOrEqual(5);

    // It has to be its own error: "we never asked" is a different fact from "we asked and failed",
    // and only one of them is a gap in the corpus.
    const e = new HostSuspended('sso.agc.gov.sg', 3);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('HostSuspended');
    expect(e.host).toBe('sso.agc.gov.sg');
  });
});

describe('a cooldown that outlives the process', () => {
  it('will not ask a host that suspended us in an earlier run', async () => {
    // The in-process breaker protects one run. Six runs launched from a shell loop each got a
    // fresh breaker and each walked into the same wall, which is how a deliberately careful
    // crawler spends an afternoon being the least welcome thing on a government server.
    const { Fetcher, HostSuspended } = await import('../src/fetch/index.js');
    const db = openDb(':memory:');
    const until = new Date(Date.now() + 60_000).toISOString();
    db.prepare('INSERT INTO host_cooldown (host, until, refusals, recorded_at) VALUES (?, ?, ?, ?)')
      .run('example.gov', until, 3, new Date().toISOString());

    const fetcher = new Fetcher({ db, sourceMode: 'fetch' });
    expect(fetcher.hostCooldown('example.gov')).not.toBeNull();
    await expect(fetcher.fetch('https://example.gov/never-fetched')).rejects.toBeInstanceOf(HostSuspended);
    expect(fetcher.stats.network).toBe(0);
    db.close();
  });

  it('asks again once the cooldown has passed', async () => {
    const { Fetcher } = await import('../src/fetch/index.js');
    const db = openDb(':memory:');
    db.prepare('INSERT INTO host_cooldown (host, until, refusals, recorded_at) VALUES (?, ?, ?, ?)')
      .run('example.gov', new Date(Date.now() - 60_000).toISOString(), 3, new Date().toISOString());

    const fetcher = new Fetcher({ db, sourceMode: 'fetch' });
    // An expired row must not keep a host off limits for ever -- that would be the growing-penalty
    // bug again, one level up.
    expect(fetcher.hostCooldown('example.gov')).toBeNull();
    db.close();
  });
});

describe('a request that never completes', () => {
  it('is a fact about the document, not the end of the job', async () => {
    // The measured failure. The Singapore contents crawl read 197 of 524 Acts and then died on a
    // headers timeout: the host had refused twice, the give-up threshold was three, and an
    // unhandled rejection killed the process before the third refusal could stop it in order.
    // The 197 survived only because they were committed as they were read; the run summary and
    // the entire embedding stage that should have followed never ran.
    //
    // A transport fault therefore gets its own class, so a caller can record the document as
    // unread and go on -- the same treatment a robots refusal or a throttled response already
    // gets, and the treatment every other stage already gave arbitrary errors.
    const { TransportFault } = await import('../src/fetch/index.js');
    const e = new TransportFault('https://sso.agc.gov.sg/Act/CoA1967', new Error('Headers Timeout Error'));
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('TransportFault');
    expect(e.url).toBe('https://sso.agc.gov.sg/Act/CoA1967');
    expect(e.message).toContain('Headers Timeout Error');
  });

  it('still counts against the host, so a silent host is stopped like a refusing one', async () => {
    // A host that has decided to stop answering does not always say so. If timeouts did not count
    // toward the refusal streak, the breaker would never trip on the quiet failure mode and the
    // crawler would keep asking a server that has stopped listening.
    const { Fetcher, HostSuspended, __giveUpAfter } = await import('../src/fetch/index.js');
    const db = openDb(':memory:');
    // A drop is now retried close in before it counts, so the real pauses are replaced with
    // nothing: what is under test is that the retries run out and the breaker still trips.
    const fetcher = new Fetcher({ db, sourceMode: 'fetch', transportRetryMs: [0, 0] });

    // Stand in for the network: every request faults, the way an unreachable host behaves.
    (fetcher as unknown as { send: () => Promise<never> }).send = () => {
      throw new Error('Headers Timeout Error');
    };
    (fetcher as unknown as { ensureRobots: () => Promise<unknown> }).ensureRobots = async () => ({
      disallow: [], allow: [], crawlDelayMs: 0, fetched: true,
    });

    let suspended = false;
    for (let i = 0; i < __giveUpAfter + 2; i += 1) {
      try {
        await fetcher.fetch(`https://example.gov/doc${i}`);
      } catch (err) {
        if (err instanceof HostSuspended) suspended = true;
      }
    }
    expect(suspended).toBe(true);

    // And written down, so the next process does not start over and ask again.
    const row = db.prepare("SELECT * FROM host_cooldown WHERE host = 'example.gov'").get();
    expect(row).toBeTruthy();
    db.close();
  });
});
