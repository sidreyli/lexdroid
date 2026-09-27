/**
 * A subject that is only a pointer to the class its own Division applies to is as narrow as the
 * Division's heading.
 */
import { describe, expect, it } from 'vitest';
import { decide, type Evidence } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';
import type { Indicator } from '../src/rubric/types.js';

const indicator102: Indicator = {
  id: '10.2',
  pillarId: 10,
  pillarName: 'Quantitative Trade Restrictions',
  category: 'Import restrictions',
  exception: null,
  criteriaText: '...',
  bands: [
    { score: 1, criterion: 'Import restrictions that potentially block trade (e.g., quotas) OR at least two measures of category (2)', ordinal: 1 },
    { score: 0.5, criterion: 'Import restrictions that add regulatory compliance costs to trade', ordinal: 2 },
    { score: 0, criterion: 'No restriction', ordinal: 3 },
  ],
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
};

function permit(sectionId: number, subjectWords: string, headingPath: string, title: string, borderWords = 'imported into the territory'): Evidence {
  const quote = `${subjectWords} must not be brought or imported into the territory unless the goods are covered by an import permit ${borderWords}`;
  const finding = {
    indicatorId: '10.2', measure: 'import-compliance', dutyBearer: null, dutyAct: 'must not be brought or imported', dutyForce: 'forbids',
    roleWords: null, definingWords: 'covered by an import permit', subjectWords, borderWords,
    imposingWords: 'must not be brought or imported', prescribingWords: null, dutyBearerKind: null, scopeUnstated: false,
    placeWords: 'the territory', exceptionWords: null, locatedData: null, informationWords: null, keepingWords: null,
    authorisingWords: null, quote, requirement: 'import-compliance', sectorScope: 'all', sector: null, dataScope: 'non-personal',
    dataDescription: null, appliesOnlyToGovernmentData: false, mandatory: true, countriesNamed: [], statedPeriod: null,
    authorisation: 'unstated',
  } as unknown as Finding;
  return {
    finding, sectionId, instrumentId: sectionId, instrumentTitle: title, headingPath,
    citation: `https://example.gov/${sectionId}`, amendsAnotherAct: false, figureReplaceable: false,
  };
}

const rates = { base: 'USD' as const, asOf: '2026-01-01', source: 'test', fetchedAt: '2026-01-01', usdPer: {} };
const coverage = { sectionsRead: 2, sectionsIndexed: 2, instrumentsConsidered: 2 };
const everyImport = permit(1, 'the goods', 'Part IV—The importation of goods > Division 1—Prohibited imports', 'Goods Entry Act');

describe('a class of goods left to its heading', () => {
  it('is the class the heading names, and animal products are not ICT goods', () => {
    const animals = permit(2, 'goods included in a class of goods to which this Division applies', 'Part 2—Conditionally non-prohibited goods > Division 1—Animals and animal products', 'Biosecurity Determination');
    const d = decide({ indicator: indicator102, economy: 'XXX', rates, surfaced: [], coverage, evidence: [everyImport, animals] });
    expect(d.score).toBe(0.5);
  });

  it('counts where the heading names ICT goods', () => {
    const equipment = permit(3, 'goods included in a class of goods to which this Division applies', 'Part 3 > Division 2—Radiocommunications equipment', 'Equipment Determination');
    const d = decide({ indicator: indicator102, economy: 'XXX', rates, surfaced: [], coverage, evidence: [everyImport, equipment] });
    expect(d.score).toBe(1);
  });
});

describe('the words said to cross the border', () => {
  const standard = (borderWords: string) =>
    permit(4, 'ผลิตภัณฑ์อุตสาหกรรม', 'มาตรา 16', 'Industrial Product Standard Act', borderWords);

  it('have to name the frontier, not the factory gate', () => {
    const d = decide({ indicator: indicator102, economy: 'XXX', rates, surfaced: [], coverage, evidence: [everyImport, standard('ออกจากสถานที่ผลิต')] });
    expect(d.score).toBe(0.5);
  });

  it('may name it in Thai, or in Malay, or as a transaction coming inward', () => {
    for (const words of ['นำของเข้า ส่งของออก', 'Pengimportan ke dalam Malaysia', 'inward transactions']) {
      const d = decide({ indicator: indicator102, economy: 'XXX', rates, surfaced: [], coverage, evidence: [everyImport, standard(words)] });
      expect(d.score, words).toBe(1);
    }
  });
});
