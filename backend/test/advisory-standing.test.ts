/**
 * What an advisory document can and cannot be the basis for.
 *
 * Widening the register to the regulators puts advisory guidelines in front of the reader for the
 * first time, and they word duties exactly as statutes do -- "an organisation must not transfer".
 * Each economy's profile has always declared what its instrument kinds can do ("Advisory
 * Guidelines state how a regulator reads a binding instrument. Evidence of interpretation, never
 * the source of an obligation on their own") and the decision had never read that declaration.
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

/** One transfer condition, worded the same way whoever published it. */
function transferCondition(): Finding {
  return {
    indicatorId: '6.4', measure: 'transfer-condition',
    dutyBearer: 'an organisation', dutyAct: 'must not transfer', dutyForce: 'forbids',
    roleWords: null, definingWords: 'unless the recipient is bound by comparable protection',
    subjectWords: null, borderWords: 'outside Singapore',
    imposingWords: 'must not transfer', prescribingWords: null,
    dutyBearerKind: 'organisation', scopeUnstated: false,
    placeWords: 'outside Singapore', exceptionWords: null,
    locatedData: 'personal data', informationWords: 'personal data',
    keepingWords: 'must not transfer any personal data to a country outside Singapore',
    authorisingWords: null,
    quote:
      'an organisation must not transfer any personal data to a country outside Singapore unless ' +
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
    amendsAnotherAct: false, headingPath: 'Part III > 26 Transfer outside Singapore',
    citation: `https://x/${instrumentId}`,
  };
}

const surfaced: SurfacedInstrument[] = [{ instrumentId: 1, instrumentTitle: 'X', rank: 1 }];
const coverage = { sectionsRead: 24, sectionsIndexed: 6143, instrumentsConsidered: 6 };
const answer = (e: Evidence) =>
  decide({ indicator: conditional, economy: 'SGP', evidence: [e], surfaced, governing: [e.instrumentId], coverage });

describe('a duty worded in an advisory document', () => {
  it('does not become a requirement, however exactly it is worded', () => {
    const d = answer({ ...carriedBy(1, 'Advisory Guidelines on Key Concepts'), bindingness: 'advisory' });
    expect(d.state).toBe('no-restriction');
    expect(d.basis).toEqual([]);
    // Held with its reason, not discarded: it is good evidence of how the binding rule is read.
    expect(d.excluded.map((h) => h.reason).join(' ')).toContain('advisory');
  });

  it('still counts where the same words are in an instrument that binds', () => {
    const d = answer({ ...carriedBy(2, 'Personal Data Protection Regulations 2021'), bindingness: 'binding' });
    expect(d.state).toBe('restricted');
    expect(d.basis.length).toBe(1);
  });

  it('counts a notice that binds the licensees it is issued to', () => {
    // Singapore's financial-sector measures live in MAS Notices, and the profile ranks them binding-on-licensees.
    const d = answer({ ...carriedBy(3, 'MAS Notice 626'), bindingness: 'binding-on-licensees' });
    expect(d.state).toBe('restricted');
  });

  it('treats a corpus registered before standing was carried as binding', () => {
    // Absent rather than advisory: every earlier run behaved this way and its answers stand.
    const d = answer(carriedBy(4, 'Personal Data Protection Act 2012'));
    expect(d.state).toBe('restricted');
  });
});
