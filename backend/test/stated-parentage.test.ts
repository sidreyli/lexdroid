import { describe, expect, it } from 'vitest';
import { openDb, type Db } from '../src/db/index.js';
import { linkStatedParents } from '../src/discover/index.js';

function store(): Db {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('IND','India','[\"en\"]')").run();
  return db;
}

let next = 1;
function add(db: Db, title: string, kind: string, madeUnder: string | null = null): number {
  const id = next++;
  db.prepare(
    `INSERT INTO instrument (id, economy_code, title, kind, made_under_name, source_url,
                             discovered_via, discovered_at)
     VALUES (?, 'IND', ?, ?, ?, ?, 'portal:1', '2026-09-19')`,
  ).run(id, title, kind, madeUnder, `https://indiacode.gov.in/${id}`);
  return id;
}

function parentOf(db: Db, id: number) {
  return db.prepare('SELECT made_under_instrument_id p, made_under_basis b FROM instrument WHERE id = ?')
    .get(id) as { p: number | null; b: string | null };
}

describe('the Act a register says an instrument was made under', () => {
  it('is linked to the registered Act of that name', () => {
    const db = store();
    const act = add(db, 'The Environment (Protection) Act, 1986', 'act');
    const rule = add(db, 'The Environment (Protection) Rules, 1986', 'rule', 'The Environment (Protection) Act, 1986');
    const out = linkStatedParents(db, 'IND');
    expect(out).toEqual({ stated: 1, linked: 1 });
    expect(parentOf(db, rule).p).toBe(act);
    expect(parentOf(db, rule).b).toContain('made under "The Environment (Protection) Act, 1986"');
  });

  it('matches the name however the register cased it', () => {
    const db = store();
    const act = add(db, 'The Companies Act, 2013', 'act');
    const rule = add(db, 'Some Rules', 'rule', '  the companies act, 2013 ');
    expect(linkStatedParents(db, 'IND').linked).toBe(1);
    expect(parentOf(db, rule).p).toBe(act);
  });

  it('leaves the name unlinked rather than guessing at a near match', () => {
    // "made under the Companies Act" against a register holding the Companies Act 2013 and the
    // Companies Act 1956 is a choice between two real Acts, and picking one puts the wrong
    // instrument at the head of a cell's evidence.
    const db = store();
    add(db, 'The Companies Act, 2013', 'act');
    add(db, 'The Companies Act, 1956', 'act');
    const rule = add(db, 'Some Rules', 'rule', 'The Companies Act');
    const out = linkStatedParents(db, 'IND');
    expect(out).toEqual({ stated: 1, linked: 0 });
    expect(parentOf(db, rule).p).toBeNull();
    // The name is still on the row for a reviewer to read.
    expect(db.prepare('SELECT made_under_name n FROM instrument WHERE id = ?').get(rule))
      .toEqual({ n: 'The Companies Act' });
  });

  it('counts an instrument whose named Act the register does not itself publish', () => {
    const db = store();
    add(db, 'Some Rules', 'rule', 'A State Act the central register does not hold');
    expect(linkStatedParents(db, 'IND')).toEqual({ stated: 1, linked: 0 });
  });

  it('never links an instrument to itself', () => {
    const db = store();
    const act = add(db, 'The Companies Act, 2013', 'act', 'The Companies Act, 2013');
    linkStatedParents(db, 'IND');
    expect(parentOf(db, act).p).toBeNull();
  });

  it('does nothing at all where no register named a parent', () => {
    const db = store();
    add(db, 'The Companies Act, 2013', 'act');
    expect(linkStatedParents(db, 'IND')).toEqual({ stated: 0, linked: 0 });
  });

  it('leaves a link another pass already made', () => {
    const db = store();
    const act = add(db, 'The Companies Act, 2013', 'act');
    const other = add(db, 'The Environment (Protection) Act, 1986', 'act');
    const rule = add(db, 'Some Rules', 'rule', 'The Companies Act, 2013');
    db.prepare('UPDATE instrument SET made_under_instrument_id = ? WHERE id = ?').run(other, rule);
    expect(linkStatedParents(db, 'IND').linked).toBe(0);
    expect(parentOf(db, rule).p).toBe(other);
    expect(act).toBeGreaterThan(0);
  });
});
