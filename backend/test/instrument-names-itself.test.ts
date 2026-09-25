/**
 * A document filed under a title that names no instrument takes the name it gives itself.
 *
 * Discovery has always had this rule. It fired on almost nothing, because the sentence it looked
 * for was written in two voices -- "may be cited as the ..." and "This Act is the ..." -- and a
 * delegated instrument writes it in several others. Measured over the three registers, nought of
 * 663 eligible instruments recovered a name: Australia files legislative instruments under the
 * drafting template they were written from, "Compilation Template" and "Principal Instrument
 * Template", and under upload slugs like "250312-LI-TSY_47_0757-Mergers-general th", while
 * section 1 of each says what it is.
 *
 * The title is not cosmetic. It is embedded, and the shortlist ranks the register by it before a
 * document is read, so an instrument named after a template cannot be found by what it governs.
 */
import { describe, expect, it } from 'vitest';
import { namesAnInstrument, nameBeforeThePublisher, ownName, statedName } from '../src/parse/identity.js';

const opening = (text: string) => [{ text }];

describe('the voices an instrument names itself in', () => {
  it('reads the bare subject, which is how a determination is drafted', () => {
    expect(statedName(opening('1 Name\nThis is the Radiocommunications (Allocation of Transmitter Licences) Determination 2025.')))
      .toBe('Radiocommunications (Allocation of Transmitter Licences) Determination 2025');
  });

  it('reads "This instrument is the ..."', () => {
    expect(statedName(opening('1 Name\nThis instrument is the Customs (Information Technology Requirements) Determination 2021.')))
      .toBe('Customs (Information Technology Requirements) Determination 2021');
  });

  it('reads the plural, which a set of standards uses', () => {
    expect(statedName(opening('1 Name\nThese are the Broadcasting Services (Australian Content) Standards 2016.')))
      .toBe('Broadcasting Services (Australian Content) Standards 2016');
  });

  it('reads a kind the strict patterns never listed', () => {
    expect(statedName(opening('1. This Determination is the Countervailing and Anti-Dumping Duties (Expiry Review) Determination 2021.')))
      .toBe('Countervailing and Anti-Dumping Duties (Expiry Review) Determination 2021');
  });

  it('still reads the two voices it always did', () => {
    expect(statedName(opening('1. This Act may be cited as the Personal Data Protection Act 2010.')))
      .toBe('Personal Data Protection Act 2010');
    expect(statedName(opening('1. This Order is the Customs Duties Order 2017.')))
      .toBe('Customs Duties Order 2017');
  });
});

describe('the guard the looser voices need', () => {
  // A pattern loose enough to read "This is the ..." is loose enough to read the first capitalised
  // words of any sentence. The replacement is only ever an improvement if what replaces the title
  // names an instrument, so a candidate that names none is not a name.
  it('refuses a sentence that happens to start the same way', () => {
    expect(statedName(opening('This is the Commonwealth of Australia Gazette for the week.'))).toBeNull();
    expect(statedName(opening('These are the Minister’s reasons for the decision.'))).toBeNull();
  });

  it('does not treat a drafting template as a name', () => {
    expect(namesAnInstrument('Principal Instrument Template')).toBe(false);
    expect(namesAnInstrument('Compilation Template')).toBe(false);
    expect(namesAnInstrument('[Document title]')).toBe(false);
    expect(namesAnInstrument('Schedule 1')).toBe(false);
  });

  it('counts a determination and a declaration as instruments, which the register does', () => {
    expect(namesAnInstrument('Currency (Royal Australian Mint) Determination 2002')).toBe(true);
    expect(namesAnInstrument('Migration (IMMI 18/015) Declaration 2018')).toBe(true);
  });
});

/**
 * A web page is titled for the site it sits on.
 *
 * `ownName` falls back to the page's own <title> where a document states no name in its opening
 * provisions, and a site template writes "<what this page is> | <who we are>". Registered whole,
 * that is a citation naming a website: 197 entries carried one, 89 of them holding text, one of
 * them an Act at 1,822 sections, and a reviewer following the row was shown the agency where the
 * provision should have been.
 */
describe('a title that carries the publisher after it', () => {
  it('is registered under the part that names the instrument', () => {
    expect(nameBeforeThePublisher('Cybersecurity Act | Cyber Security Agency of Singapore')).toBe('Cybersecurity Act');
    expect(nameBeforeThePublisher('Strategic Goods (Control) Act | Singapore Customs')).toBe('Strategic Goods (Control) Act');
    expect(nameBeforeThePublisher('Guidelines on Use of Telecommunication Riser Ducts | IMDA')).toBe(
      'Guidelines on Use of Telecommunication Riser Ducts',
    );
  });

  it('rejoins a name that carries a pipe of its own rather than cutting it at the first', () => {
    expect(nameBeforeThePublisher('Banking Act | Cap. 19 | MAS')).toBe('Banking Act | Cap. 19');
  });

  it('recovers nothing where no part of it names an instrument', () => {
    // The register then says the wrong thing visibly, which is better than plausibly.
    expect(nameBeforeThePublisher('Privacy policy | ACMA')).toBeNull();
    expect(nameBeforeThePublisher('Newsroom | OAIC')).toBeNull();
    // A bilingual site names itself on both sides, so the tail is the same site's other name.
    expect(
      nameBeforeThePublisher(
        'Malaysian Communications And Multimedia Commission (MCMC) | Suruhanjaya Komunikasi dan Multimedia Malaysia (SKMM) - Guidelines',
      ),
    ).toBeNull();
  });

  it('leaves a title with no publisher on it alone', () => {
    expect(nameBeforeThePublisher('Personal Data Protection Act 2012')).toBeNull();
    // A dash is inside real titles, so it is not a separator this rule reads.
    expect(nameBeforeThePublisher('Communications and Multimedia Act 1998 - Reprint 2006')).toBeNull();
  });

  it('is what ownName offers when the document states no name of its own', () => {
    expect(ownName([], 'Cybersecurity Act | Cyber Security Agency of Singapore')).toBe('Cybersecurity Act');
    expect(ownName([], 'Privacy policy | ACMA')).toBeNull();
    // And a document that does state its own name is unaffected by any of this.
    expect(ownName([{ text: 'This Act may be cited as the Payment Services Act 2019.' }], 'Anything | MAS')).toBe(
      'Payment Services Act 2019',
    );
  });
});
