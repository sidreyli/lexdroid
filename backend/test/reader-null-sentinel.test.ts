/**
 * The word a reader writes when it means the field is empty.
 *
 * The schema offers null for every optional field and the reader mostly takes it. Measured across
 * the store on 21 September 2026, 2,810 findings answered with the word instead -- 2,317 "null",
 * 441 "none" -- and 2,610 of those were the party bound. A string is truthy, so the sentinel was
 * carried into verification as though it were a claim about the provision's words, checked against
 * the text, and not found there. Every one of those findings was thrown away.
 *
 * It cost a cell in the run of 20 September 2026. Section 191 of Singapore's Copyright Act 2021 --
 * "Relevant matters in deciding whether use is fair", the four-factor test -- was retrieved at
 * dense rank 1 and lexical rank 1, was read, and was quoted correctly, in the cell whose top band
 * is an exception following the fair use model. It was rejected for a duty bearer of "Null". Fair
 * use binds nobody, which is what makes it an exception; the rubric marks the measure `permits`
 * and Zone 3 already excuses a permission from naming a party bound. Verification ran first.
 */
import { describe, expect, it } from 'vitest';
import { rejectionFor, __coerce, type Finding } from '../src/read/index.js';

const FAIR_USE =
  'In deciding whether a use of a work is fair, all relevant matters must be considered, ' +
  'including the purpose and character of the use, the nature of the work, the amount used, ' +
  'and the effect of the use upon the potential market for the work.';

const ALLOWED = new Set(['4.5']);

function finding(over: Partial<Finding> = {}): Finding {
  return {
    indicatorId: '4.5',
    measure: 'fair-use-exception',
    dutyBearer: null,
    dutyAct: '',
    dutyForce: 'permits',
    roleWords: null,
    definingWords: 'whether a use of a work is fair',
    subjectWords: 'a work',
    borderWords: null,
    imposingWords: null,
    prescribingWords: null,
    dutyBearerKind: 'organisation',
    scopeUnstated: false,
    placeWords: null,
    exceptionWords: null,
    locatedData: null,
    informationWords: null,
    keepingWords: null,
    authorisingWords: null,
    quote: FAIR_USE,
    requirement: 'Fair use is assessed against the listed matters.',
    sectorScope: 'all',
    sector: null,
    dataScope: 'all',
    dataDescription: null,
    appliesOnlyToGovernmentData: false,
    mandatory: false,
    countriesNamed: [],
    statedPeriod: null,
    authorisation: 'unstated',
    ...over,
  } as Finding;
}

describe('a field answered with a word meaning empty', () => {
  it('reads as empty, for every spelling the reader uses', () => {
    for (const word of ['null', 'Null', 'NULL', 'none', 'None', 'nil', 'N/A', 'not applicable', 'unstated', '(none)']) {
      const f = __coerce({ indicatorId: '4.5', quote: FAIR_USE, measure: 'fair-use-exception', dutyBearer: word });
      expect(f?.dutyBearer, word).toBeNull();
    }
  });

  it('leaves a word that means "I do not know" alone, which is a different answer', () => {
    // "X" is a placeholder, not a statement that there is no such party, and it stays a rejection.
    expect(__coerce({ indicatorId: '4.5', quote: FAIR_USE, dutyBearer: 'X' })?.dutyBearer).toBe('X');
  });

  it('does not swallow a real answer that merely contains one of the words', () => {
    const f = __coerce({ indicatorId: '4.5', quote: FAIR_USE, dutyBearer: 'a person who uses none of the work' });
    expect(f?.dutyBearer).toBe('a person who uses none of the work');
  });
});

describe('verifying a permission', () => {
  it('keeps the fair use test, which names no party because there is none', () => {
    expect(rejectionFor(finding(), FAIR_USE, ALLOWED)).toBeNull();
  });

  it('keeps it when the reader wrote the word instead of the null', () => {
    const coerced = __coerce({
      indicatorId: '4.5',
      measure: 'fair-use-exception',
      quote: FAIR_USE,
      dutyBearer: 'Null',
      dutyAct: 'None',
      definingWords: 'whether a use of a work is fair',
      sectorScope: 'all',
      dataScope: 'all',
    })!;
    expect(coerced.dutyBearer).toBeNull();
    expect(rejectionFor(coerced, FAIR_USE, ALLOWED)).toBeNull();
  });

  it('still refuses a party the provision does not name', () => {
    // The rule is unchanged for an answer that is a claim: only the sentinels stopped being one.
    expect(rejectionFor(finding({ dutyBearer: 'every telecommunications carrier' }), FAIR_USE, ALLOWED)).toMatch(
      /party said to bear the duty/,
    );
  });

  it('keeps an act too short for the check to run, which claims nothing either', () => {
    // `inProvision` needs three characters to match anything at all, so a shorter act fails it
    // whatever the provision says. 890 findings were turned away that way, 811 of them for the
    // copula "is" -- on provisions that grant rather than command, where there is no act to name
    // and "is" is the only verb there. Section 190 of Singapore's Copyright Act 2021, "It is a
    // permitted use of a work to make a fair use of the work", is one of them.
    const permits = 'It is a permitted use of a work to make a fair use of the work.';
    for (const act of ['is', 'be', 'do', '']) {
      expect(
        rejectionFor(
          finding({ dutyAct: act, quote: permits, definingWords: 'a fair use of the work' }),
          permits,
          ALLOWED,
        ),
        act,
      ).toBeNull();
    }
  });

  it('still refuses an act long enough to be a claim and absent from the provision', () => {
    // The floor is the whole difference: three characters is where a claim starts.
    const permits = 'It is a permitted use of a work to make a fair use of the work.';
    const f = finding({ dutyAct: 'pay', quote: permits, definingWords: 'a fair use of the work' });
    expect(rejectionFor(f, permits, ALLOWED)).toMatch(
      /act said to be imposed/,
    );
  });

  it('still refuses an act the provision does not impose', () => {
    expect(rejectionFor(finding({ dutyAct: 'must transfer the work abroad' }), FAIR_USE, ALLOWED)).toMatch(
      /act said to be imposed/,
    );
  });
});
