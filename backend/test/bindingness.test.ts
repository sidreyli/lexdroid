/**
 * What an economy says a kind of instrument can bind, and the two ways that answer went missing.
 *
 * The profile declares a bindingness per instrument kind, and the decision consults it in exactly
 * one place: an advisory instrument states how a binding one is read rather than imposing a duty
 * itself. Two holes followed from that, and both were silent.
 *
 * The first is the undeclared kind. `bindingness.get(kind)` returns undefined for a kind no
 * profile lists, the spread that would have set the field adds nothing, and the advisory test
 * below is false -- so the instrument is treated exactly as a binding one, and nothing anywhere
 * records that nobody chose that. Three registers emitted `rule` and `order` rows while every
 * profile declared only `regulation`, which put 5,571 instruments and 26 cited provisions through
 * that path. The rank 2 tier of all three profiles already named Rules and Orders in its own
 * prose; only the kind codes were absent.
 *
 * The second is the value that was declared and never read. `binding-on-licensees` existed in the
 * profile schema and in the evidence type and appeared in no branch of any rule, so declaring an
 * instrument with it meant precisely what declaring it binding meant. Four of the five framework
 * indicators carry a middle band written for that exact distinction -- "only to specific sectors
 * (sectoral law)", "sectoral framework in place" -- against a top band asking for a comprehensive
 * or horizontal framework, and reach was being read off the instrument's words alone. An
 * instrument that binds the licensees of a sector needs no confining words: the licence is the
 * confinement.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decide, reaches, type FrameworkEvidence } from '../src/decide/index.js';
import type { Indicator } from '../src/rubric/types.js';
import { InstrumentType } from '../src/profile/types.js';
import { loadProfile } from '../src/profile/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const profileDir = join(here, '..', 'data', 'profiles');
const economies = readdirSync(profileDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace(/\.json$/, ''));

const evidence = (over: Partial<FrameworkEvidence> = {}): FrameworkEvidence => ({
  instrumentId: 1,
  instrumentTitle: 'An Act',
  citation: 'https://example.gov/act',
  establishesFramework: true,
  frameworkShown: true,
  horizontal: true,
  dedicated: true,
  dedicatedShown: true,
  sectoralShown: false,
  sector: null,
  bindingness: 'binding',
  quote: 'This Act applies to every person.',
  ...over,
});

describe('an instrument that binds only the licensees of a sector', () => {
  it('does not reach across sectors, though its own words never name one', () => {
    expect(reaches(evidence({ bindingness: 'binding-on-licensees', sectoralShown: false }))).toBe(false);
  });

  it('is still sectoral when the reader called it horizontal', () => {
    // `horizontal` is the reader's assertion. Reach is not decided from it.
    expect(reaches(evidence({ bindingness: 'binding-on-licensees', horizontal: true }))).toBe(false);
  });

  it('leaves a binding instrument reaching, which is the case this must not break', () => {
    expect(reaches(evidence({ bindingness: 'binding' }))).toBe(true);
  });

  it('treats an undeclared kind as unanswered rather than as sectoral', () => {
    // Null is "the profile did not say". It must not quietly become the new default confinement,
    // or the first hole above turns into a different silent answer instead of no answer.
    expect(reaches(evidence({ bindingness: null }))).toBe(true);
  });

  it('still lets words in the instrument confine a binding one', () => {
    expect(reaches(evidence({ bindingness: 'binding', sectoralShown: true }))).toBe(false);
  });
});

describe('an advisory instrument', () => {
  it('is not a candidate for a framework at all, narrow or otherwise', () => {
    // The provision path rules advisory evidence out; this path did not ask. A guidance note is
    // not a narrow framework, so it is dropped from candidacy rather than demoted to the middle
    // band -- demotion would still put "a framework exists, sectorally" on the record.
    const indicator: Indicator = {
      id: '7.1',
      pillarId: 7,
      pillarName: 'Domestic Data Protection & Privacy',
      category: 'Lack of comprehensive legal framework for data protection',
      exception: null,
      criteriaText: '',
      bands: [
        { score: 0, criterion: 'Comprehensive data protection framework', ordinal: 3 },
        { score: 0.5, criterion: 'Sectoral law', ordinal: 2 },
        { score: 1, criterion: 'No data protection legal framework', ordinal: 1 },
      ],
      shape: 'framework',
      shapeBasis: '',
      provenance: { document: '', locator: '' },
    };
    const coverage = { instrumentsConsidered: 1, sectionsIndexed: 0, sectionsRead: 0 };
    const advisoryOnly = decide({
      indicator,
      economy: 'MYS',
      coverage,
      evidence: [],
      frameworkEvidence: [evidence({ bindingness: 'advisory' })],
    });
    expect(advisoryOnly.score).toBe(1);
    expect(advisoryOnly.frameworkBasis).toEqual([]);
  });
});

describe('the bindingness vocabulary', () => {
  it('is compared somewhere, for every value that is not the fall-through', () => {
    // A value the schema offers and no rule reads is a distinction the profile implies and the
    // decision does not make: declaring an instrument with it changes nothing, and the author has
    // no way to find that out. Presence of the literal is not enough to show it -- the value
    // appears in its own type declaration, which is how this went unnoticed. It has to be
    // compared against.
    const src = readFileSync(join(here, '..', 'src', 'decide', 'index.ts'), 'utf8');
    const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const compared = (v: string) => body.includes(`=== '${v}'`) || body.includes(`!== '${v}'`);
    // 'binding' is the fall-through: what an instrument is when it is neither advisory nor
    // confined to the licensees of a sector. It is read by being what remains, so it is the one
    // value that legitimately needs no comparison of its own.
    const mustCompare = InstrumentType.shape.bindingness.options.filter((v) => v !== 'binding');
    expect(mustCompare.filter((v) => !compared(v))).toEqual([]);
  });
});

describe('every profile', () => {
  it('declares a bindingness for every kind the register can hold', () => {
    // The store's `instrument.kind` and the profile's `instrumentTypes[].kind` are the same
    // vocabulary. A kind the store can write and the profile does not name is an instrument whose
    // force nobody stated, and it is read as binding.
    const kinds = InstrumentType.shape.kind.options;
    for (const economy of economies) {
      const declared = new Set(loadProfile(economy).instrumentTypes.map((t) => t.kind));
      expect({ economy, missing: kinds.filter((k) => !declared.has(k)) }).toEqual({ economy, missing: [] });
    }
  });
});
