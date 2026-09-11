import { describe, expect, it } from 'vitest';
import { quoteIsInSection } from '../src/read/index.js';
import { quoteAppearsIn } from '../src/verify/index.js';
import { locateQuote } from '../src/util/locate.js';

/** Australian drafting stars a defined term wherever it is used. */
const STARRED =
  'The *infrastructure CEO must, by instrument in writing, designate the infrastructure project ' +
  'for the purposes of this Division.';

/** A definition wraps its own subject in quotation marks. */
const DEFINITION =
  '"data protection officer", in relation to an organisation, means the individual designated ' +
  'under section 11(3) to be responsible for ensuring the organisation complies with this Act.';

const AIRPORT =
  'An authorised airport employee of an airport licensee for an airport may by written notice ' +
  'require any person using the airport to provide, within a reasonable period, any documents or ' +
  'information which the employee reasonably believes are within the knowledge, or in or under ' +
  'the custody or control, of that person.';

describe('what the citation gate compares', () => {
  it('does not fail a quote for the star that marks a defined term', () => {
    const quote = 'The infrastructure CEO must, by instrument in writing, designate the infrastructure project';
    expect(quoteIsInSection(quote, STARRED)).toBe(true);
    expect(quoteAppearsIn(STARRED, quote)).toBe(true);
    expect(locateQuote(STARRED, quote)).not.toBeNull();
  });

  it('does not fail a quote for the marks round the term a definition defines', () => {
    const quote = 'data protection officer, in relation to an organisation, means the individual designated';
    expect(quoteIsInSection(quote, DEFINITION)).toBe(true);
    expect(quoteAppearsIn(DEFINITION, quote)).toBe(true);
  });

  it('does not fail a quote for the full stop the reader adds to close it', () => {
    expect(quoteIsInSection('designate the infrastructure project.', STARRED)).toBe(true);
  });

  it('still fails a quote whose words are different', () => {
    expect(quoteIsInSection('The infrastructure CEO may, by instrument in writing, designate', STARRED)).toBe(false);
    expect(quoteIsInSection('designate the infrastructure programme', STARRED)).toBe(false);
  });

  it('keeps a number intact: losing a bracket would change the section cited', () => {
    expect(quoteIsInSection('responsible for ensuring the organisation complies', DEFINITION)).toBe(true);
    expect(quoteIsInSection('designated under section 113 to be responsible', DEFINITION)).toBe(false);
  });
});

describe('a quotation that skips over words', () => {
  it('is accepted when the short pieces sit between long ones and everything is in order', () => {
    const quote =
      'An authorised airport employee ... may ... require any person ... to provide ... ' +
      'any documents or information which ... are within the knowledge';
    expect(quoteIsInSection(quote, AIRPORT)).toBe(true);
    expect(quoteAppearsIn(AIRPORT, quote)).toBe(true);
  });

  it('locates the passage it quotes, from the first piece to the last', () => {
    const quote = 'An authorised airport employee ... may ... require any person ... to provide';
    const at = locateQuote(AIRPORT, quote)!;
    expect(AIRPORT.slice(at.start, at.end).startsWith('An authorised airport employee')).toBe(true);
    expect(AIRPORT.slice(at.start, at.end).endsWith('to provide')).toBe(true);
  });

  it('will not let an ellipsis stitch two verbs into a duty', () => {
    const s = 'The Commissioner has the powers conferred by this Act and may require information.';
    expect(quoteIsInSection('The Commissioner... has... powers to require information', s)).toBe(false);
  });

  it('refuses a quotation carrying too few words between its gaps', () => {
    expect(quoteIsInSection('employee ... may ... provide', AIRPORT)).toBe(false);
    expect(quoteIsInSection('an ... the ... of ... a', AIRPORT)).toBe(false);
  });

  it('refuses one with no piece long enough to identify the passage', () => {
    expect(quoteIsInSection('employee ... notice ... person ... period ... control ... that', AIRPORT)).toBe(false);
  });

  it('refuses one whose pieces are present but out of order', () => {
    const quote = 'any documents or information which ... An authorised airport employee ... may';
    expect(quoteIsInSection(quote, AIRPORT)).toBe(false);
  });

  it('will not find a short piece buried inside a longer word', () => {
    const s = 'The mayoral committee of an airport licensee must keep a record of every direction given.';
    expect(quoteIsInSection('The mayoral committee ... may ... keep a record of every direction', s)).toBe(false);
    expect(quoteIsInSection('The mayoral committee ... must ... keep a record of every direction', s)).toBe(true);
  });
});
