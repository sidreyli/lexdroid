/**
 * Which of ESCAP's score bands each rule can actually reach.
 *
 *   npm run -w backend audit-bands
 *
 * A band no rule ever returns is a distinction ESCAP draws that we cannot express, and it fails
 * silently: the cell still gets a plausible score from a neighbouring band.
 */
import { loadRubric } from '../src/rubric/index.js';
import { __rules, UNREACHABLE_BANDS } from '../src/decide/index.js';
import { MEASURES } from '../src/rubric/measures.js';
import type { Indicator } from '../src/rubric/types.js';
import type { Evidence } from '../src/decide/index.js';
import type { Finding } from '../src/read/index.js';

import type { RuleContext } from '../src/decide/index.js';

type Rule = (i: Indicator, q: Evidence[], ctx?: RuleContext) => { ordinal: number; reason: string };

// One band in the rubric compares a stated sum with 200 USD, so the sweep carries a rate.
const CTX: RuleContext = {
  economy: 'SGP',
  rates: { base: 'USD', asOf: 'a sweep', source: 'a sweep', fetchedAt: 'a sweep', usdPer: { SGD: 0.75 } },
};

function finding(measure: string, over: Partial<Finding>): Finding {
  return {
    indicatorId: '', measure, dutyBearer: 'every company', dutyAct: 'shall',
    dutyForce: 'requires', placeWords: 'in the economy', exceptionWords: null,
    locatedData: 'records', informationWords: 'records', keepingWords: 'shall keep',
    roleWords: 'a data protection officer', definingWords: 'in the economy',
    subjectWords: 'personal data',
    borderWords: 'imported into the economy',
                                            imposingWords: 'shall',
                                            prescribingWords: null,
    dutyBearerKind: 'organisation',
    quote: 'q', requirement: 'r', sectorScope: 'all', sector: null, dataScope: 'all',
    dataDescription: null, scopeUnstated: false, appliesOnlyToGovernmentData: false,
    mandatory: true, countriesNamed: [], statedPeriod: '7 years',
    authorisation: 'warrant', authorisingWords: 'a warrant', ...over,
  };
}

function ev(f: Finding, n: number): Evidence {
  return {
    finding: f, sectionId: n, instrumentId: n, instrumentTitle: `Act ${n}`,
    headingPath: 'Part 1', citation: 'u', amendsAnotherAct: false,
  };
}

// Every attribute any band text turns on, crossed. Cheap enough to be exhaustive per measure.
const ATTRS: Partial<Finding>[] = [];
for (const sectorScope of ['all', 'specific'] as const)
  for (const dataScope of ['all', 'personal', 'non-personal', 'specific-category'] as const)
    for (const countriesNamed of [[], ['China']])
      for (const mandatory of [true, false])
        for (const appliesOnlyToGovernmentData of [false, true])
          for (const authorisation of ['warrant', 'none'] as const)
            for (const statedPeriod of ['7 years', null])
              ATTRS.push({
                sectorScope, dataScope, countriesNamed, mandatory,
                appliesOnlyToGovernmentData, authorisation, statedPeriod,
                sector: sectorScope === 'specific' ? 'banking' : null,
              });

// And a sum on each side of that line, appended rather than crossed in: nothing else reads it.
ATTRS.push({ definingWords: 'S$100' }, { definingWords: 'S$1,000' });

const rubric = loadRubric();
const problems: string[] = [];

for (const ind of rubric.indicators) {
  const rule = (__rules as Record<string, Rule | undefined>)[ind.id];
  if (!rule) continue;
  const tokens = (MEASURES[ind.id] ?? []).map((m) => m.token);
  if (tokens.length === 0) continue;

  const sets: Evidence[][] = [[]];
  for (const a of ATTRS) {
    for (const t of tokens) {
      // Up to four of the same measure: 1.4 bands on the count and stops at "more than three".
      for (const n of [1, 2, 3, 4]) {
        sets.push(Array.from({ length: n }, (_, k) => ev(finding(t, a), k + 1)));
      }
    }
    for (let i = 0; i < tokens.length; i++)
      for (let j = i + 1; j < tokens.length; j++)
        sets.push([ev(finding(tokens[i]!, a), 1), ev(finding(tokens[j]!, a), 2)]);
  }

  const reached = new Map<number, string>();
  const how = new Map<number, string>();
  const unknown = new Set<number>();
  for (const s of sets) {
    const out = rule(ind, s, CTX);
    if (!ind.bands.some((b) => b.ordinal === out.ordinal)) unknown.add(out.ordinal);
    else if (!reached.has(out.ordinal)) {
      reached.set(out.ordinal, out.reason);
      const f = s[0]?.finding;
      how.set(out.ordinal, f
        ? `${s.length}x ${f.measure} sector=${f.sectorScope} data=${f.dataScope}` +
          `${s.length > 1 && s[1]!.finding.measure !== f.measure ? ` +${s[1]!.finding.measure}` : ''}` +
          `${f.countriesNamed.length ? ' countries' : ''}${f.mandatory ? '' : ' non-mandatory'}` +
          `${f.appliesOnlyToGovernmentData ? ' govdata' : ''}${f.statedPeriod ? '' : ' no-period'}` +
          `${f.authorisation === 'none' ? ' no-authorisation' : ''}`
        : 'nothing');
    }
  }

  const declared = UNREACHABLE_BANDS[ind.id] ?? {};
  const dead = ind.bands.filter((b) => !reached.has(b.ordinal) && !declared[b.ordinal]);
  const mark = unknown.size > 0 ? 'BAD ORDINAL' : dead.length > 0 ? 'DEAD BAND' : 'ok';
  console.log(`\n${ind.id}  [${ind.bands.map((b) => b.score).join(' / ')}]  ${mark}`);
  for (const b of ind.bands) {
    const hit = reached.get(b.ordinal);
    console.log(`   ${hit ? ' ' : '!'} ${b.score}  (${b.ordinal})  ${b.criterion.slice(0, 96)}`);
    if (hit) console.log(`        via: ${hit}   [${how.get(b.ordinal)}]`);
    else if (declared[b.ordinal]) console.log(`        declared out of reach: ${declared[b.ordinal]}`);
  }
  if (unknown.size > 0) {
    problems.push(`${ind.id}: rule returns ordinal ${[...unknown].join(',')} which is not a band`);
  }
  for (const b of dead) problems.push(`${ind.id}: band ${b.ordinal} (score ${b.score}) is never reached`);
}

console.log(`\n\n${problems.length} problem(s):`);
for (const p of problems) console.log('  ' + p);
