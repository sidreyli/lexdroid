/**
 * What each indicator scores when nothing qualifies.
 *
 *   npm run -w backend audit-rules
 *
 * An indicator whose top band is the absence of something scores its maximum on an empty evidence
 * set, so a retrieval miss and a real finding of absence are the same output. This prints which.
 */
import { loadRubric } from '../src/rubric/index.js';
import { __rules, NOT_IN_LAW } from '../src/decide/index.js';
import { MEASURES } from '../src/rubric/measures.js';

const rubric = loadRubric();
const rows: string[][] = [];

for (const ind of rubric.indicators) {
  const rule = (__rules as Record<string, unknown>)[ind.id] as
    | ((i: typeof ind, q: never[]) => { ordinal: number })
    | undefined;

  let empty = '-';
  if (NOT_IN_LAW[ind.id]) {
    empty = 'declared';
  } else if (ind.shape === 'framework') {
    empty = String(ind.bands[0]?.score ?? '?');
  } else if (rule) {
    const ordinal = rule(ind, []).ordinal;
    empty = String(ind.bands.find((b) => b.ordinal === ordinal)?.score ?? '?');
  } else {
    empty = 'unresolved';
  }

  rows.push([
    ind.id,
    String(ind.pillarId),
    ind.shape,
    NOT_IN_LAW[ind.id] ? 'declared' : rule ? 'rule' : ind.shape === 'framework' ? 'framework' : 'NO RULE',
    (MEASURES as Record<string, unknown>)[ind.id] ? 'vocab' : 'NO VOCAB',
    empty,
    ind.bands[0]?.criterion.slice(0, 58) ?? '',
  ]);
}

const head = ['ind', 'pil', 'shape', 'rule', 'vocab', 'empty', 'top band'];
const width = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
const line = (r: string[]): string => r.map((c, i) => c.padEnd(width[i]!)).join('  ');
console.log(line(head));
console.log(width.map((w) => '-'.repeat(w)).join('  '));
for (const r of rows) console.log(line(r));

const risky = rows.filter((r) => r[5] !== '0' && r[5] !== 'unresolved' && r[5] !== 'declared');
console.log(`\n${risky.length} indicator(s) score above zero on an empty evidence set:`);
for (const r of risky) console.log(`  ${r[0]} -> ${r[5]}   "${r[6]}"`);
