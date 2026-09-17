/**
 * The one framework claim that was asserted rather than shown.
 *
 * `decideFramework` filters its candidates on `establishesFramework` and nothing else, so that
 * boolean is what a framework cell's score turns on. It was also the only one of the reading's
 * four claims with no words behind it: `dedicated` has `dedicatedWords`, a sectoral reach has
 * `sectorWords`, and this had the model's say-so. Of the 49 framework readings taken on
 * 16 September, 39 came back true and 7 of those 39 gave a reason that denied the claim in its own
 * words -- Australia's Copyright Act 1968 answering "the provided text does not contain any
 * provisions regarding the liability of online intermediaries for copyright infringement" while
 * establishing the framework.
 *
 * So the rule has to be quoted, and the quote has to be findable in the instrument.
 */
import { describe, expect, it } from 'vitest';
import { provisionsOf } from '../src/cell/index.js';
import { decide, type FrameworkEvidence } from '../src/decide/index.js';
import type { Indicator } from '../src/rubric/types.js';
import { __frameworkPrompt, quoteIsInSection, type FrameworkInput } from '../src/read/index.js';
import type { RetrievalRecord } from '../src/retrieve/index.js';

const input = (over: Partial<FrameworkInput> = {}): FrameworkInput => ({
  instrumentId: 1,
  title: 'Copyright Act 1968',
  openingText: 'Long title\nAn Act relating to copyright and the protection of certain performances.',
  provisionsText:
    '116AG Limitation on remedies\nIf a carriage service provider satisfies the conditions in this Division, '
    + 'the relief that a court may grant against the provider for the infringement is limited to an order '
    + 'under subsection (3).',
  ...over,
});

describe('the question the framework reader is asked', () => {
  it('makes question 1 answerable only from words the reader has copied', () => {
    const p = __frameworkPrompt(input(), 'copyright-safe-harbour');
    expect(p).toMatch(/frameworkWords: copy the words of the provision that governs that subject/);
    // The ordering is the point: the words come before the boolean they support, as they already
    // do for dedication and for reach.
    expect(p.indexOf('frameworkWords:')).toBeLessThan(p.indexOf('1. Does it establish'));
    expect(p).toMatch(/Answer from the words you just copied/);
  });

  it('refuses a title as the answer, in so many words', () => {
    const p = __frameworkPrompt(input(), 'copyright-safe-harbour');
    expect(p).toMatch(/whatever the instrument is called/);
    expect(p).toMatch(/A heading, a section\nnumber and a table of contents entry are not rules either\./);
  });

  it('refuses a bare term of art, which is what the first run came back with', () => {
    // Asked for the governing rule, Singapore's 8.1 answered "online service provider" and its 8.2
    // "internet intermediary" -- both terms the instrument uses, neither a rule. The length floor
    // catches them, and the prompt now says why they are not answers.
    const p = __frameworkPrompt(input(), 'copyright-safe-harbour');
    expect(p).toMatch(/Copy a whole statement of the rule: who must do what, or who is not liable for what\./);
    expect(p).toMatch(/A term\nthe instrument happens to use is not a rule/);
  });

  it('asks for a short contiguous run of words, because a long one came back spliced', () => {
    // Malaysia's Copyright Act 1987 answered its 8.1 with a rule that opens as section 43C and
    // carries on into 43E and 43F -- the right Act, the right Part, and a quotation of neither.
    // The check refused it, correctly, and the cell went the wrong way on a law it had found.
    const p = __frameworkPrompt(input(), 'copyright-safe-harbour');
    expect(p).toMatch(/Copy one run of consecutive words from a single provision, and stop/);
    expect(p).toMatch(/Do not join words from two provisions/);
  });

  it('shows the instrument its own provisions, which is where the rule is', () => {
    // 116AG is in no opening. The reader that called the Copyright Act 1968 a framework and said
    // in the same answer that it contained no such provisions had only a long title to read.
    const p = __frameworkPrompt(input(), 'copyright-safe-harbour');
    expect(p).toContain('116AG Limitation on remedies');
    expect(p).toMatch(/Provisions of the same instrument returned by a search for this subject/);
  });

  it('says so plainly when the search returned none of this instrument', () => {
    // An instrument the indicator's own search never reached is not one that governs the subject,
    // and the prompt has to say that rather than leave a silent gap where provisions would be.
    const p = __frameworkPrompt(input({ provisionsText: '' }), 'copyright-safe-harbour');
    expect(p).toMatch(/A search for this subject returned no provision of this instrument\./);
    expect(p).not.toMatch(/Provisions of the same instrument/);
  });
});

describe('the rule behind an established framework', () => {
  const haystack = [input().provisionsText, input().openingText].join('\n\n');
  const RULE = 40;

  it('verifies a rule the instrument really states', () => {
    expect(
      quoteIsInSection(
        'the relief that a court may grant against the provider for the infringement is limited',
        haystack,
        RULE,
      ),
    ).toBe(true);
  });

  it('refuses a rule the instrument does not state', () => {
    expect(
      quoteIsInSection('a network service provider shall not be subject to civil liability', haystack, RULE),
    ).toBe(false);
  });

  it('refuses a fragment short enough to match almost anything', () => {
    // Widening the haystack widens what a weak quote can match: with the provisions in the prompt
    // and the ordinary eight-character floor, a quote of "No findings." verified. A provision said
    // to establish a framework is a clause, so it is held to a longer floor than a phrase.
    expect(quoteIsInSection('copyright', haystack, RULE)).toBe(false);
    expect(quoteIsInSection('An Act relating', haystack, RULE)).toBe(false);
    // ...and the same words pass the ordinary floor, which is what makes the longer one necessary.
    expect(quoteIsInSection('An Act relating', haystack)).toBe(true);
  });
});

describe('which provisions an instrument is shown', () => {
  const record = {
    sections: [
      { instrumentId: 1, headingPath: '116AG Limitation on remedies', text: 'Relief is limited.' },
      { instrumentId: 2, headingPath: '26 Liability of network service providers', text: 'Not liable.' },
      { instrumentId: 1, headingPath: '116AH Conditions', text: 'The conditions are these.' },
    ],
  } as unknown as RetrievalRecord;

  it('shows an instrument its own and no other', () => {
    const text = provisionsOf(record, 1);
    expect(text).toContain('116AG Limitation on remedies');
    expect(text).toContain('116AH Conditions');
    // The neighbouring Act's safe harbour is exactly the thing that would make a false positive
    // look right, and it belongs to the reading of that Act, not this one.
    expect(text).not.toContain('Liability of network service providers');
  });

  it('is empty, not absent, when the search returned nothing of it', () => {
    expect(provisionsOf(record, 99)).toBe('');
    expect(provisionsOf(undefined, 1)).toBe('');
  });
});

describe('what the decision does with a framework that was only claimed', () => {
  const i81: Indicator = {
    id: '8.1',
    pillarId: 8,
    pillarName: 'Intermediary Liability and Content Regulation',
    category: 'Lack of safe harbour for copyright infringements',
    exception: null,
    criteriaText: '...',
    shapeBasis: 'test',
    provenance: { document: 'test', locator: 'test' },
    bands: [
      { score: 0, criterion: 'Horizontal framework in place that limits liability', ordinal: 3 },
      { score: 0.5, criterion: 'Sectoral framework in place', ordinal: 2 },
      { score: 1, criterion: 'No framework', ordinal: 1 },
    ],
    shape: 'framework',
  };
  const coverage = { instrumentsConsidered: 1, sectionsIndexed: 0, sectionsRead: 0 };
  const evidence = (frameworkShown: boolean | null): FrameworkEvidence => ({
    instrumentId: 1,
    instrumentTitle: 'Competition and Consumer Act 2010',
    citation: 'https://example.gov.au/act',
    establishesFramework: true,
    frameworkShown,
    horizontal: true,
    dedicated: false,
    dedicatedShown: false,
    sectoralShown: false,
    sector: null,
    quote: 'The regulated entity is not liable in a civil action',
  });
  const at = (frameworkShown: boolean | null): number | null =>
    decide({ indicator: i81, economy: 'AUS', evidence: [], frameworkEvidence: [evidence(frameworkShown)], coverage })
      .score;

  it('counts a framework whose rule is quoted out of the instrument', () => {
    expect(at(true)).toBe(0);
  });

  it('will not count one whose rule is not in the instrument it is attributed to', () => {
    // Australia's 8.2 answered with a real immunity from the Consumer Data Right, which shields a
    // data provider rather than an intermediary. ESCAP scores that cell 1, and so does this.
    expect(at(false)).toBe(1);
  });

  it('leaves a reading taken before the rule was asked for exactly where it was', () => {
    // Every run banked before 17 September stores null here. Scoring those as refusals would move
    // every framework cell in the benchmark without an engine ever running.
    expect(at(null)).toBe(0);
  });
});
