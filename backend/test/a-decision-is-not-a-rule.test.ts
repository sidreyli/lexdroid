/**
 * A document that decides a case, filed beside the Act it was decided under.
 *
 * An agency that adjudicates publishes its adjudications, and where the gazette is the statute
 * book they are filed with the law: "Notice of Affirmative Final Determination of an Anti-Dumping
 * Duty Investigation with regard to Imports of ..." is numbered like an instrument, sits in the
 * same register, and is written in the Act's own vocabulary because it is applying the Act. So it
 * answers the questions the Act answers and outranks it, being short and dense where a statute is
 * long and general. Its sections are tariff codes and the margins found against named exporters.
 *
 * In the run of 19 September 2026 these took 248 of Malaysia's 3,356 reading seats against none
 * of Australia's 12,865, and the trade-defence cell read twenty-eight of them and never the
 * Countervailing and Anti-Dumping Duties Act 1993 they are made under. That cell counts measures,
 * so a decision read as a rule does not merely waste the seat: four notices about one consignment
 * are four measures.
 *
 * Two places, as with an outline: retrieval stops spending seats on them, and Zone 3 holds one a
 * past run already banked. Held rather than ruled out, because the rule the decision applies is
 * real and is in the instrument it was made under.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { caseSections } from '../src/retrieve/index.js';
import { determinesAParticularCase } from '../src/discover/titles.js';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const DECIDES_A_CASE =
  'Notice of Affirmative Final Determination of an Anti-Dumping Duty Investigation with regard to Imports of Cold Rolled Coils';
const STATES_A_RULE = 'Countervailing and Anti-Dumping Duties Act 1993';

describe('what a title says about whether a document decides or states', () => {
  it('reads a step taken in a named proceeding as a decision', () => {
    expect(determinesAParticularCase(DECIDES_A_CASE)).toBe(true);
    expect(
      determinesAParticularCase(
        'Notice of Initiation of Administrative Review of Anti-Dumping Duty with regard to Imports of Flat Rolled Product',
      ),
    ).toBe(true);
  });

  it('keeps a rule made generally, however much of the same vocabulary it uses', () => {
    expect(determinesAParticularCase(STATES_A_RULE)).toBe(false);
    expect(determinesAParticularCase('Countervailing and Anti-Dumping Duties Regulations 1997')).toBe(false);
    // Names the step and the proceeding, and no particular case: this is the law for everyone.
    expect(
      determinesAParticularCase(
        'Countervailing and Anti-Dumping Duties (Expedited Review of Anti-Dumping Duties) Determination 2000',
      ),
    ).toBe(false);
    // Names a proceeding and a case, and no step: a report is not a determination.
    expect(determinesAParticularCase('A Report on a Public Inquiry on the Access List Determination')).toBe(false);
  });

  it('is about the shape of a title and not about any subject matter', () => {
    expect(
      determinesAParticularCase(
        'Notice of Termination of Proceedings in the matter of the application by the licensee',
      ),
    ).toBe(true);
    expect(determinesAParticularCase('Customs (Prohibition of Imports) Order 2023')).toBe(false);
  });
});

describe('a decision is left out of retrieval and the Act it applies is not', () => {
  function corpus() {
    const db = openDb(':memory:');
    db.prepare(`INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','["ms","en"]')`).run();
    const instrument = (title: string, kind: string) =>
      Number(
        db
          .prepare(
            `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
               VALUES ('MYS', ?, ?, 'https://x/' || ?, 'test', '2026-09-07')`,
          )
          .run(title, kind, title.slice(0, 12)).lastInsertRowid,
      );
    const section = (instrumentId: number, text: string) => {
      const documentId = Number(
        db
          .prepare(
            `INSERT INTO document (instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at, from_cache, extraction, section_count)
               VALUES (?, 'https://x/' || ? || '.pdf', 'h' || ?, 'application/pdf', 1, 200, '2026-09-07', 1, 'pdf-text', 1)`,
          )
          .run(instrumentId, instrumentId, instrumentId).lastInsertRowid,
      );
      return Number(
        db
          .prepare(
            `INSERT INTO section (document_id, ordinal, heading_path, label, text, char_start, char_end, page, language, anchor)
               VALUES (?, 0, 'x', '1', ?, 0, 4, 1, 'en', null)`,
          )
          .run(documentId, text).lastInsertRowid,
      );
    };
    return {
      db,
      decision: section(
        instrument(DECIDES_A_CASE, 'notice'),
        'An anti-dumping duty of 26.39% is imposed on the subject merchandise.',
      ),
      act: section(
        instrument(STATES_A_RULE, 'act'),
        'The Minister may impose an anti-dumping duty where a determination is made.',
      ),
    };
  }

  it('skips the decision and keeps the Act', () => {
    const { db, decision, act } = corpus();
    const skipped = caseSections(db, 'MYS');
    expect(skipped.has(decision)).toBe(true);
    expect(skipped.has(act)).toBe(false);
  });
});

const tradeDefence: Indicator = {
  id: '1.4',
  pillarId: 1,
  pillarName: 'Tariffs and Trade Defence',
  category: 'Trade defence measures',
  exception: null,
  criteriaText: '0.25 for each measure, up to 1',
  bands: [
    { score: 1, criterion: 'More than three measures', ordinal: 1 },
    { score: 0.75, criterion: 'Three measures', ordinal: 2 },
    { score: 0.5, criterion: 'Two measures', ordinal: 3 },
    { score: 0.25, criterion: 'One measure', ordinal: 4 },
    { score: 0, criterion: 'No measure', ordinal: 5 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function dutyEvidence(instrumentTitle: string): Evidence {
  const finding = {
    indicatorId: '1.4',
    measure: 'trade-defence-measure',
    dutyBearer: 'an importer',
    dutyAct: 'shall pay',
    dutyForce: 'requires',
    roleWords: null,
    definingWords: 'an anti-dumping duty of 26.39% is imposed',
    subjectWords: 'mobile handsets',
    borderWords: 'subject merchandise',
    imposingWords: 'is imposed',
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: 'An anti-dumping duty of 26.39% is imposed on the subject merchandise',
    requirement: 'An anti-dumping duty applies.',
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
    instrumentTitle,
    instrumentKind: 'notice',
    amendsAnotherAct: false,
    headingPath: 'Part I > 1 Determination',
    citation: 'https://x/notice.pdf',
  };
}

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: STATES_A_RULE, rank: 1 }];
const coverage = {
  sectionsIndexed: 300,
  sectionsRead: 300,
  queries: 8,
  depth: 40,
  instrumentsConsidered: 12,
} as const;

describe('a decision a past run already banked', () => {
  it('is held, because the rule it applies is in the instrument it was made under', () => {
    const d = decide({
      indicator: tradeDefence,
      economy: 'MYS',
      evidence: [dutyEvidence(DECIDES_A_CASE)],
      surfaced,
      coverage,
    });

    expect(d.held.map((x) => x.reason).join(' ')).toContain('decide a particular proceeding');
    expect(d.basis).toEqual([]);
  });

  it('is held rather than ruled out, so it is no evidence the economy has no measure', () => {
    const d = decide({
      indicator: tradeDefence,
      economy: 'MYS',
      evidence: [dutyEvidence(DECIDES_A_CASE)],
      surfaced,
      coverage,
    });

    expect(d.excluded).toEqual([]);
    expect(d.held).toHaveLength(1);
  });

  it('counts the same words where the instrument states the rule', () => {
    const d = decide({
      indicator: tradeDefence,
      economy: 'MYS',
      evidence: [dutyEvidence(STATES_A_RULE)],
      surfaced,
      coverage,
    });

    expect(d.basis).toHaveLength(1);
  });
});
