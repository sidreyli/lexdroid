/**
 * A section that says of itself that it summarises the sections after it.
 *
 * Commonwealth drafting puts one at the head of most Parts, and the manual asks for it in the
 * operative voice, because that is what makes a summary readable. So "Carriers must provide other
 * carriers with access to telecommunications transmission towers" is a section called "Simplified
 * outline", and the duty it announces is imposed four clauses later. Read as a provision it is a
 * duty that binds everyone and sits nowhere.
 *
 * It also outranks the duty. A summary says the whole thing in one sentence and a real duty is
 * spread over a Part, so the summary is denser in whatever the query asked for. Australia's
 * passive-sharing cell read clause 30, the outline, and clause 31, the definitions, and never
 * clause 33 -- "A carrier must, if requested to do so by another carrier, give the second carrier
 * access to a telecommunications transmission tower" -- which is the provision the cell is about.
 * 534 of that run's 2,468 Australian reading seats went to sections of this kind.
 *
 * Two places, because they answer different questions: retrieval stops spending seats on them,
 * and Zone 3 holds one that a past run already banked. Held, not ruled out -- the duty is real
 * and is stated elsewhere, so an outline is no evidence that the economy imposes none.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { outlineSections } from '../src/retrieve/index.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

describe('an outline is not a provision', () => {
  function corpus() {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('AUS','Australia','[\"en\"]')").run();
    const instrumentId = Number(
      db
        .prepare(
          `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
             VALUES ('AUS', 'Telecommunications Act 1997', 'act', 'https://x/ta', 'test', '2026-09-07')`,
        )
        .run().lastInsertRowid,
    );
    const documentId = Number(
      db
        .prepare(
          `INSERT INTO document (instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at, from_cache, extraction, section_count)
             VALUES (?, 'https://x/ta.html', 'h1', 'text/html', 1, 200, '2026-09-07', 1, 'html', 4)`,
        )
        .run(instrumentId).lastInsertRowid,
    );
    const sec = (ordinal: number, headingPath: string, label: string | null, text: string) =>
      Number(
        db
          .prepare(
            `INSERT INTO section (document_id, ordinal, heading_path, label, text, char_start, char_end, page, language, anchor)
               VALUES (?, ?, ?, ?, ?, 0, 4, 1, 'en', null)`,
          )
          .run(documentId, ordinal, headingPath, label, text).lastInsertRowid,
      );

    const part = 'Schedule 1 > Part 5—Access to telecommunications transmission towers';
    return {
      db,
      outline: sec(0, `${part} > 30 Simplified outline`, '30', 'Carriers must provide other carriers with access to telecommunications transmission towers.'),
      duty: sec(1, `${part} > 33 Access to telecommunications transmission towers`, '33', 'A carrier must, if requested to do so by another carrier, give the second carrier access to a tower.'),
      guide: sec(2, 'Part 2 > 4 Guide to this Part', '4', 'This Part sets out when a carrier licence is required.'),
      // "Outline" as an ordinary word in a heading about something else must not fire.
      plan: sec(3, 'Part 9 > 91 Outline of proposed works', '91', 'A carrier must give the owner an outline of proposed works.'),
    };
  }

  it('is left out of retrieval, and the duty it summarises is not', () => {
    const { db, outline, duty, guide } = corpus();
    const skipped = outlineSections(db, 'AUS');

    expect(skipped.has(outline)).toBe(true);
    expect(skipped.has(guide)).toBe(true);
    expect(skipped.has(duty)).toBe(false);
  });

  it('does not fire on a heading that uses the word for something else', () => {
    const { db, plan } = corpus();
    expect(outlineSections(db, 'AUS').has(plan)).toBe(false);
  });
});

const passiveSharing: Indicator = {
  id: '5.1',
  pillarId: 5,
  pillarName: 'Telecom Infrastructure and Competition',
  category: 'Lack of passive infrastructure sharing',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'No passive infrastructure sharing obligation', ordinal: 1 },
    { score: 0.5, criterion: 'Passive sharing is not mandated, but it is practiced in the market', ordinal: 2 },
    { score: 0, criterion: 'Passive sharing is mandated', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function towerEvidence(headingPath: string): Evidence {
  const finding = {
    indicatorId: '5.1',
    measure: 'passive-sharing-duty',
    dutyBearer: 'a carrier',
    dutyAct: 'must give',
    dutyForce: 'requires',
    roleWords: null,
    definingWords: 'give the second carrier access to a tower',
    subjectWords: 'telecommunications transmission tower',
    borderWords: null,
    imposingWords: 'must give',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'Carriers must provide other carriers with access to telecommunications transmission towers',
    requirement: 'Towers must be shared.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'non-personal',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: true,
    countriesNamed: [],
    statedPeriod: null,
    authorisation: 'none',
  } as Finding;
  return {
    finding,
    sectionId: 1,
    instrumentId: 1,
    instrumentTitle: 'Telecommunications Act 1997',
    amendsAnotherAct: false,
    headingPath,
    citation: 'https://www.legislation.gov.au/C2004A05145',
  };
}

const surfaced: SurfacedInstrument[] = [
  { instrumentId: 1, instrumentTitle: 'Telecommunications Act 1997', rank: 1 },
];
const coverage = {
  sectionsIndexed: 300,
  sectionsRead: 300,
  queries: 8,
  depth: 40,
  instrumentsConsidered: 12,
} as const;

describe('an outline a past run already banked', () => {
  const part = 'Schedule 1 > Part 5—Access to telecommunications transmission towers';

  it('is held rather than counted, because the duty it states is imposed elsewhere', () => {
    const d = decide({
      indicator: passiveSharing,
      economy: 'AUS',
      evidence: [towerEvidence(`${part} > 30 Simplified outline`)],
      surfaced,
      coverage,
    });

    expect(d.held.map((x) => x.reason).join(' ')).toContain('summarise provisions elsewhere');
    expect(d.basis).toEqual([]);
  });

  it('is held rather than ruled out, so it is no evidence the duty is absent', () => {
    const d = decide({
      indicator: passiveSharing,
      economy: 'AUS',
      evidence: [towerEvidence(`${part} > 30 Simplified outline`)],
      surfaced,
      coverage,
    });

    expect(d.excluded).toEqual([]);
    expect(d.state).toBe('unresolved');
  });

  it('counts the clause that imposes the duty', () => {
    const d = decide({
      indicator: passiveSharing,
      economy: 'AUS',
      evidence: [towerEvidence(`${part} > 33 Access to telecommunications transmission towers`)],
      surfaced,
      coverage,
    });

    expect(d.score).toBe(0);
    expect(d.basis).toHaveLength(1);
  });
});
