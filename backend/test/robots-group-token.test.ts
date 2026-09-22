/**
 * Which robots.txt group governs us.
 *
 * The group addressed to our own product token wins over the wildcard group, which is what lets a
 * site give us rules of our own. Deciding that with `ROBOTS_TOKEN.includes(agent)` asks the
 * question backwards -- whether "lexdroid" contains the site's word -- and the empty string is a
 * substring of everything. A bare "User-agent:" line therefore captured us into a group with no
 * rules and discarded the wildcard group the site wrote for everyone, which is the one case where
 * getting this wrong means crawling a site that asked us not to.
 */
import { describe, expect, it } from 'vitest';
import { parseRobots, robotsPermits, ROBOTS_TOKEN } from '../src/fetch/index.js';

describe('the robots.txt group that governs us', () => {
  it('keeps the wildcard rules when a bare User-agent line precedes them', () => {
    const robots = parseRobots(['User-agent:', 'Disallow: /nothing-here', '', 'User-agent: *', 'Disallow: /'].join('\n'));
    expect(robots.disallow).toEqual(['/']);
    expect(robotsPermits(robots, '/anything')).toBe(false);
  });

  it('is not captured by an agent name that merely spells part of our token', () => {
    // "droid" and "lex" are substrings of "lexdroid"; neither names us.
    const robots = parseRobots(
      ['User-agent: droid', 'Disallow: /decoy', '', 'User-agent: lex', 'Disallow: /decoy2', '', 'User-agent: *', 'Disallow: /private'].join('\n'),
    );
    expect(robots.disallow).toEqual(['/private']);
  });

  it('still prefers the group that names our token exactly', () => {
    const robots = parseRobots([`User-agent: ${ROBOTS_TOKEN}`, 'Disallow: /ours', '', 'User-agent: *', 'Disallow: /'].join('\n'));
    expect(robots.disallow).toEqual(['/ours']);
    expect(robotsPermits(robots, '/elsewhere')).toBe(true);
  });

  it('reads the token out of a versioned agent line', () => {
    const robots = parseRobots([`User-agent: ${ROBOTS_TOKEN}/0.1`, 'Disallow: /ours', '', 'User-agent: *', 'Disallow: /'].join('\n'));
    expect(robots.disallow).toEqual(['/ours']);
  });
});
