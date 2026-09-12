/**
 * Deciding what to fetch, before fetching it.
 *
 * Both tests here are regressions against defects that made the stage useless in opposite ways.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { shortlistInstruments } from '../src/shortlist/index.js';

function seed(db: ReturnType<typeof openDb>): void {
  db.prepare(`INSERT INTO economy (code, name, official_languages) VALUES ('XXX', 'Test', '["en"]')`).run();
  const ins = db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, status, language, source_url, discovered_via, discovered_at)
     VALUES ('XXX', ?, ?, 'in-force', 'en', ?, 'test', '2026-09-06')`,
  );
  ins.run('Cybersecurity Act 2018', 'act', 'https://x/1');
  ins.run('Application of English Law Act 1993', 'act', 'https://x/2');
  ins.run('Civil Law Act 1909', 'act', 'https://x/3');
  ins.run('Revised Edition of the Laws Act 1983', 'act', 'https://x/4');
  // 5,841 of Singapore's 6,365 instruments are subsidiary. Enough of them here to starve a
  // retrieval depth that is spent before the kind filter is applied.
  for (let i = 0; i < 60; i += 1) ins.run(`Cybersecurity (Fees) Regulations ${i}`, 'regulation', `https://x/r${i}`);
}

describe('shortlisting the register', () => {
  it('does not let a word that matches half the register outrank the instrument', async () => {
    // "law" appears in a large fraction of Singapore's titles. Counting every matched term equally
    // put the Application of English Law Act 1993 and the Civil Law Act 1909 above the
    // Cybersecurity Act 2018 for a cybersecurity query. Rarity weighting fixes that without a
    // hand-maintained stopword list, in any language.
    const db = openDb(':memory:');
    seed(db);
    const out = await shortlistInstruments(db, {
      economy: 'XXX',
      queries: ['cybersecurity law'],
      limit: 4,
      kind: 'act',
      model: 'none', // no embeddings seeded, so only the lexical channel runs
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.title).toBe('Cybersecurity Act 2018');
    db.close();
  });

  it('applies the kind filter while ranking, not after it', async () => {
    // Applied afterwards, the whole depth is spent on subsidiary legislation and then discarded:
    // a search restricted to Acts came back with two candidates out of 524.
    const db = openDb(':memory:');
    seed(db);
    const out = await shortlistInstruments(db, {
      economy: 'XXX',
      queries: ['cybersecurity'],
      limit: 10,
      depthPerQuery: 5, // smaller than the number of regulations that would otherwise fill it
      kind: 'act',
      model: 'none',
    });
    expect(out.map((c) => c.kind)).toEqual(out.map(() => 'act'));
    expect(out.some((c) => c.title === 'Cybersecurity Act 2018')).toBe(true);
    db.close();
  });
  it('does not let having headings outrank a better title', async () => {
    // Fusion adds a vote per channel, so an instrument carrying contents scored in twice as many
    // runs as one without. Contents exist almost only for instruments already read, so summing gave
    // "already read" a two-to-one advantage unrelated to relevance: measured at nought unread
    // instruments in the shortlist for all three economies.
    const db = openDb(':memory:');
    seed(db);
    db.prepare(
      `INSERT INTO instrument (economy_code, title, kind, status, language, source_url, discovered_via, discovered_at)
       VALUES ('XXX', 'Cybersecurity Advisory Council Act 2015', 'act', 'in-force', 'en', 'https://x/9', 'test', '2026-09-06')`,
    ).run();
    const withHeadings = db
      .prepare("SELECT id FROM instrument WHERE title = 'Cybersecurity Advisory Council Act 2015'")
      .get() as { id: number };
    db.prepare(
      `INSERT INTO instrument_contents (instrument_id, headings, heading_count, source_url, extractor, fetched_at)
       VALUES (?, ?, 2, 'https://x/9', 'test', '2026-09-12')`,
    ).run(withHeadings.id, JSON.stringify(['Cybersecurity duties of the Council', 'Cybersecurity reporting']));

    const out = await shortlistInstruments(db, {
      economy: 'XXX',
      queries: ['cybersecurity'],
      limit: 4,
      kind: 'act',
      model: 'none',
    });
    expect(out[0]!.title).toBe('Cybersecurity Act 2018');
    db.close();
  });
});

describe('the share of the list held for Acts', () => {
  it('keeps an Act on a list its own subsidiary legislation would fill', async () => {
    // Singapore's Payment Services Act 2019 ranked 111th for "a licence to provide payment
    // services" while its own Regulations ranked 4th, and 5,841 subsidiary instruments took the
    // rest. ESCAP's bands turn on what binds, so an Act and a notification made under it are not
    // interchangeable candidates.
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO economy (code, name, official_languages) VALUES ('XXX', 'Test', '["en"]')`).run();
    const ins = db.prepare(
      `INSERT INTO instrument (economy_code, title, kind, status, language, source_url, discovered_via, discovered_at)
       VALUES ('XXX', ?, ?, 'in-force', 'en', ?, 'test', '2026-09-06')`,
    );
    ins.run('Payment Services Act 2019', 'act', 'https://x/act');
    // Each carries one more of the query's words than the Act does, which is why they outrank it.
    for (let i = 0; i < 40; i += 1) {
      ins.run(`Payment Services Licence (Exemption No ${i}) Regulations 2019`, 'regulation', `https://x/r${i}`);
    }

    const asOnePool = await shortlistInstruments(db, {
      economy: 'XXX', queries: ['payment services licence'], limit: 6, primaryShare: 0, model: 'none',
    });
    expect(asOnePool.every((c) => c.kind === 'regulation')).toBe(true);

    const held = await shortlistInstruments(db, {
      economy: 'XXX', queries: ['payment services licence'], limit: 6, model: 'none',
    });
    expect(held[0]?.title).toBe('Payment Services Act 2019');
    // And the rest of the list is still whatever ranked, not padded with Acts that did not.
    expect(held.filter((c) => c.kind === 'regulation').length).toBe(5);
  });
});
