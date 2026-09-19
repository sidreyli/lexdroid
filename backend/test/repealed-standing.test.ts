/**
 * What an instrument the register no longer carries can be the basis for.
 *
 * The store has said this since the schema was written -- "'in-force' is the only status a row may
 * cite. A draft, a repealed provision, or an amending act cited in place of its principal act each
 * score zero in ESCAP's marking" -- and nothing enforced it, because `Evidence` carried the
 * instrument's title and id but never its status.
 *
 * It showed. Malaysia's 8.4 cites the Juvenile Courts Act 1947 -- whose own title in the register
 * reads "(Repealed by Act 611)" -- in the basis a reviewer reads, in five separate runs. Across the
 * store the Price Control Act 1946 (repealed by Act 723) supplied evidence to five indicators and
 * the Copyright Act 1969 (repealed by Act 332) to two.
 *
 * Amending is deliberately not on the list, though the schema names it. Where the status comes from
 * a catalogue label it says the instrument amends another, which is a fact about its relationship
 * to the principal and not a statement that its own text is spent: Malaysia's register publishes a
 * 223-section restatement under that label, and it is the only patent regulations the corpus holds.
 * Excluding it scored a cell worse for a reason that was really a gap in the corpus, so the label
 * has to be told apart from the fact before it can be acted on.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence, type SurfacedInstrument } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const conditional: Indicator = {
  id: '6.4', pillarId: 6, pillarName: 'Cross-border Data Policies',
  category: 'Conditional flow regimes',
  exception: 'Not score data localization measure applied to government data.',
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Conditions for all sectors or personal data', ordinal: 1 },
    { score: 0.5, criterion: 'Conditions for specific data or non-personal data', ordinal: 2 },
    { score: 0, criterion: 'No condition', ordinal: 3 },
  ],
  shape: 'provision', shapeBasis: 'test', provenance: { document: 'test', locator: 'test' },
};

function transferCondition(): Finding {
  return {
    indicatorId: '6.4', measure: 'transfer-condition',
    dutyBearer: 'an organisation', dutyAct: 'must not transfer', dutyForce: 'forbids',
    roleWords: null, definingWords: 'unless the recipient is bound by comparable protection',
    subjectWords: null, borderWords: 'outside Malaysia',
    imposingWords: 'must not transfer', prescribingWords: null,
    dutyBearerKind: 'organisation', scopeUnstated: false,
    placeWords: 'outside Malaysia', exceptionWords: null,
    locatedData: 'personal data', informationWords: 'personal data',
    keepingWords: 'must not transfer any personal data to a place outside Malaysia',
    authorisingWords: null,
    quote:
      'an organisation must not transfer any personal data to a place outside Malaysia unless ' +
      'the recipient is bound by comparable protection',
    requirement: 'Transfers abroad are conditional.',
    sectorScope: 'all', sector: null, dataScope: 'personal', dataDescription: null,
    appliesOnlyToGovernmentData: false, mandatory: true, countriesNamed: [],
    statedPeriod: null, authorisation: 'unstated',
  };
}

function carriedBy(instrumentId: number, instrumentTitle: string): Evidence {
  return {
    finding: transferCondition(), sectionId: instrumentId * 100, instrumentId, instrumentTitle,
    amendsAnotherAct: false, headingPath: 'Part III > 26 Transfer outside Malaysia',
    citation: `https://x/${instrumentId}`,
  };
}

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'X', rank: 1 }];
const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };
const answer = (e: Evidence) =>
  decide({ indicator: conditional, economy: 'MYS', evidence: [e], surfaced, governing: [e.instrumentId], coverage });

describe('a duty stated in an instrument that is no longer law', () => {
  it('is not a basis, however plainly the provision imposes it', () => {
    const d = answer({
      ...carriedBy(1, 'JUVENILE COURTS ACT 1947 (Repealed by Act 611)'),
      instrumentStatus: 'repealed',
    });
    expect(d.state).toBe('no-restriction');
    expect(d.basis).toEqual([]);
    // Excluded with its reason rather than discarded: a reviewer sees the provision and why it
    // did not count, which is what the exception's own findings do.
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('repealed');
  });

  it('is not a basis when the register records it as a draft', () => {
    const d = answer({ ...carriedBy(2, 'A Bill not yet passed'), instrumentStatus: 'draft' });
    expect(d.state).toBe('no-restriction');
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('draft');
  });

  it('counts where the same words are in an instrument in force', () => {
    const d = answer({
      ...carriedBy(3, 'PERSONAL DATA PROTECTION ACT 2010'),
      instrumentStatus: 'in-force',
    });
    expect(d.state).toBe('restricted');
    expect(d.basis.length).toBe(1);
  });

  it('counts where the register did not say, because unknown is not a denial', () => {
    // 704 applying readings sit under `unknown`. Refusing them would discard evidence rather than
    // discount it; the way to shrink that number is to register a status.
    const d = answer({ ...carriedBy(4, 'A code of practice'), instrumentStatus: 'unknown' });
    expect(d.state).toBe('restricted');
  });

  it('is not a basis where the Act is in force and the provision itself is repealed', () => {
    // An Act in force prints the sections it has repealed, marked "[Deleted]" or "(Repealed)".
    // The instrument's status says nothing about them: it is in force, and the words under that
    // heading are the words of a rule that no longer applies.
    const d = answer({
      ...carriedBy(6, 'PERSONAL DATA PROTECTION ACT 2010'),
      instrumentStatus: 'in-force',
      sectionRepealed: true,
    });
    expect(d.state).toBe('no-restriction');
    expect(d.basis).toEqual([]);
    expect(d.excluded.map((x) => x.reason).join(' ')).toContain('repealed or deleted');
  });

  it('counts a provision the parser did not mark, which is nearly all of them', () => {
    const d = answer({
      ...carriedBy(7, 'PERSONAL DATA PROTECTION ACT 2010'),
      instrumentStatus: 'in-force',
      sectionRepealed: false,
    });
    expect(d.state).toBe('restricted');
  });

  it('counts a corpus registered before the status was carried', () => {
    const d = answer(carriedBy(5, 'COMMUNICATIONS AND MULTIMEDIA ACT 1998'));
    expect(d.state).toBe('restricted');
  });

  it('still counts an instrument the register labels as amending another', () => {
    const d = answer({
      ...carriedBy(6, 'PATENTS (AMENDMENT) REGULATIONS 2022'),
      instrumentStatus: 'amending',
    });
    expect(d.state).toBe('restricted');
  });
});
