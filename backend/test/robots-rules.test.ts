/**
 * What a robots.txt actually says, as RFC 9309 defines it.
 *
 * The old parser flattened the whole file: every Disallow in it applied to us, whoever it was
 * addressed to, so one site's "User-agent: SemrushBot / Disallow: /" shut us out of a legislation
 * portal that welcomes crawlers. It also read rules as plain prefixes, so a rule written with a
 * wildcard matched nothing, and it took the first crawl-delay it saw rather than ours.
 */
import { describe, expect, it } from 'vitest';
import { parseRobots, robotsPermits, ROBOTS_TOKEN } from '../src/fetch/index.js';

const permits = (text: string, path: string) => robotsPermits(parseRobots(text), path);

describe('which group of rules is ours', () => {
  it('ignores a group addressed to some other crawler', () => {
    const text = 'User-agent: SemrushBot\nDisallow: /\n\nUser-agent: *\nDisallow: /search\n';
    expect(permits(text, '/rev/act-1965')).toBe(true);
    expect(permits(text, '/search?q=a')).toBe(false);
  });

  it('takes the group that names us over the one for everybody', () => {
    const text = `User-agent: *\nDisallow: /\n\nUser-agent: ${ROBOTS_TOKEN}\nDisallow: /admin\n`;
    expect(permits(text, '/rev/act-1965')).toBe(true);
    expect(permits(text, '/admin/users')).toBe(false);
  });

  it('reads a group that lists several agents on consecutive lines as one group', () => {
    const text = `User-agent: OtherBot\nUser-agent: ${ROBOTS_TOKEN}\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n`;
    expect(permits(text, '/public')).toBe(true);
    expect(permits(text, '/private')).toBe(false);
  });

  it('takes the delay from our own group, not from the file', () => {
    const text = `User-agent: SlowBot\nCrawl-delay: 30\n\nUser-agent: *\nCrawl-delay: 6\n`;
    expect(parseRobots(text).crawlDelayMs).toBe(6000);
  });

  it('honours a delay however long it is', () => {
    // There is no ceiling any more. A site that asks for two minutes is asking for two minutes,
    // and capping it at ten seconds was us deciding how much of their bandwidth we were entitled
    // to. A run that is too slow is a run we shorten, not a rule we ignore.
    expect(parseRobots('User-agent: *\nCrawl-delay: 120\n').crawlDelayMs).toBe(120_000);
  });
});

describe('what a rule matches', () => {
  it('matches a prefix', () => {
    expect(permits('User-agent: *\nDisallow: /cgi-bin\n', '/cgi-bin/search.pl')).toBe(false);
  });

  it('reads * as any run of characters', () => {
    const text = 'User-agent: *\nDisallow: /*.pdf\n';
    expect(permits(text, '/acts/copyright.pdf')).toBe(false);
    expect(permits(text, '/acts/copyright.html')).toBe(true);
  });

  it('reads a trailing $ as the end of the path', () => {
    const text = 'User-agent: *\nDisallow: /print$\n';
    expect(permits(text, '/print')).toBe(false);
    expect(permits(text, '/printable/act-1965')).toBe(true);
  });

  it('lets the longest rule win, so an Allow can carve out of a Disallow', () => {
    const text = 'User-agent: *\nDisallow: /rev\nAllow: /rev/act\n';
    expect(permits(text, '/rev/order-5')).toBe(false);
    expect(permits(text, '/rev/act-1965')).toBe(true);
  });

  it('judges the query string too, because that is where a portal puts the document id', () => {
    // sso.agc.gov.sg serves a whole Act from /Details/Print?id=... and disallows exactly that.
    const text = 'User-agent: *\nDisallow: /*?*print=\n';
    expect(permits(text, '/rev/act-1965?print=1')).toBe(false);
    expect(permits(text, '/rev/act-1965?view=whole')).toBe(true);
  });

  it('allows everything where the file states no rule for us at all', () => {
    expect(permits('User-agent: BadBot\nDisallow: /\n', '/anything')).toBe(true);
  });
});
