/**
 * The shelf, not just the book.
 *
 * A budgeted crawl opens a page only if the link to it looks like it leads to law, and the words
 * it looked for were the words instruments are named by: "legislation", "regulation", "guideline".
 * A regulator does not name the section of its site after the instruments in it. The MCMC keeps
 * its industry codes on a page called "Registers", reached through a menu called "Legal", beside
 * one called "Instrument", and the crawl refused all three -- it reached that site's Acts at all
 * only because one navigation link happened to be captioned "Legislation".
 *
 * What was behind those three links was the Malaysian Communications and Multimedia Content Code
 * 2022, which is the instrument ESCAP cites for Malaysia's 8.2, and which was therefore absent
 * from the corpus in every status. A cell cannot report that: it searched, found nothing, and
 * said so. Measured on the MCMC on 17 September 2026, over the same sixty-page budget: 86
 * instruments named before, 111 after, the three editions of the Content Code among them.
 */
import { describe, expect, it } from 'vitest';
import { leadsToLaw, standingFromHeading } from '../src/discover/crawl.js';
import { instrumentTitle } from '../src/discover/titles.js';

describe('the pages a crawl opens looking for instruments', () => {
  it('follows the names a regulator gives the place it keeps its law', () => {
    // The three links on the way to the Content Code, exactly as the MCMC writes them.
    expect(leadsToLaw('/en/legal', 'Legal')).toBe(true);
    expect(leadsToLaw('/en/legal/registers', 'Registers')).toBe(true);
    expect(leadsToLaw('/en/legal/instrument', 'Instrument')).toBe(true);
  });

  it('still follows the names instruments themselves are given', () => {
    expect(leadsToLaw('/en/legal/acts', 'Legislation')).toBe(true);
    expect(leadsToLaw('/regulations', 'Regulations')).toBe(true);
    expect(leadsToLaw('/codes-of-practice', 'Codes of Practice')).toBe(true);
  });

  it('follows a plural, which is how a site lists more than one instrument', () => {
    // The closing \b belongs to the alternation, not to the branch, so every stem in the list
    // matched its bare form and nothing else: "regulat" caught neither "regulation" nor
    // "regulations", and "act" did not catch "acts". These are the links that were refused.
    for (const word of ['Acts', 'Rules', 'Orders', 'Regulations', 'Guidelines', 'Standards']) {
      expect(leadsToLaw(`/${word.toLowerCase()}`, word)).toBe(true);
    }
    expect(leadsToLaw('/licensing', 'Licensing')).toBe(true);
    expect(leadsToLaw('/regulatory-framework', 'Regulatory Framework')).toBe(true);
  });

  it('does not let a stem match the ordinary word it opens', () => {
    // Which is what the closing \b was for, and why the endings are written out instead of
    // dropping it: a crawl that follows "action", "actually" and "ordering" spends its budget
    // on the rest of the website.
    expect(leadsToLaw('/take-action', 'Take Action')).toBe(false);
    expect(leadsToLaw('/actuarial', 'Actuarial')).toBe(false);
  });

  it('still refuses the rest of a regulator\'s website', () => {
    // Widening what leads to law spends a fixed budget, so what leads away has to keep holding.
    expect(leadsToLaw('/en/news/press-releases', 'Press Releases')).toBe(false);
    expect(leadsToLaw('/en/media/videos', 'Videos')).toBe(false);
    expect(leadsToLaw('/en/careers', 'Careers')).toBe(false);
    expect(leadsToLaw('/about-us', 'About Us')).toBe(false);
  });

  it('refuses a registration form, which is not a register', () => {
    // "regist" is the word that opens the register, and it is also the word on every sign-up
    // link. The path is what separates them, and it is why LEADS_AWAY is tested on the path.
    expect(leadsToLaw('/subscribe/register', 'Register for updates')).toBe(false);
    expect(leadsToLaw('/login/register', 'Register')).toBe(false);
  });

  it('reads standing off the heading the register writes, and only off that', () => {
    // Reaching the instrument is still not enough: `frameworkCandidates` admits only what is
    // recorded 'in-force', and the crawl recorded every one of the MCMC's 120 instruments as
    // 'unknown'. So the Content Code was fetched, parsed and embedded, and remained invisible to
    // the indicator that needed it. The portal answers the question in its own heading.
    expect(standingFromHeading('Social Regulation - Register Of Current Voluntary Industry Codes')).toEqual({
      status: 'in-force',
      statusBasis: 'Social Regulation - Register Of Current Voluntary Industry Codes',
    });
    expect(standingFromHeading('Repealed Determinations')).toEqual({
      status: 'repealed',
      statusBasis: 'Repealed Determinations',
    });
  });

  it('says nothing where the heading says nothing, rather than guessing', () => {
    // The filter exists because the crawl once registered Monetary Authority press releases as
    // Acts, and all five instruments examined for Singapore's 8.1 were press releases. Inferring
    // "in force" from a title, a date or a file name would put that back.
    expect(standingFromHeading('Guidelines')).toEqual({});
    expect(standingFromHeading('Content Code 2022')).toEqual({});
    expect(standingFromHeading(null)).toEqual({});
    expect(standingFromHeading('')).toEqual({});
    // A heading that says both says neither usefully.
    expect(standingFromHeading('Current and Repealed Codes')).toEqual({});
  });

  it('names the Content Code from the link the register writes', () => {
    // Reaching the page is only half of it: the anchor text has to read as an instrument, and
    // this one carries its edition in the brackets a title's tail is stripped of.
    const named = instrumentTitle('Content Code (Third Edition)');
    expect(named).not.toBeNull();
    expect(named?.title).toBe('Content Code (Third Edition)');
  });

  it('opens the section a government files its law under, when that word is "documents"', () => {
    // The same defect one word further on, and the whole of what stopped this adapter reaching
    // Russia. `publication.pravo.gov.ru` is the official publication venue -- permissive,
    // server-rendered, publishing nothing but law -- and it files all of it under
    // /documents/<body>/..., so every path was refused and the register came back empty. That is
    // the failure this file exists for: a page never opened holds instruments no ranking,
    // reading or rule can recover, and the cell reports that it searched and found nothing.
    expect(leadsToLaw('/documents/block/government', 'Правительство')).toBe(true);
    expect(leadsToLaw('/documents/government/daily', 'Документы за день')).toBe(true);
    expect(leadsToLaw('/document/0001202609170019', 'О внесении изменений')).toBe(true);
  });

  it('still refuses the parts of a site that carry no law, however many links they hold', () => {
    // Widening what is opened spends the sixty-page budget, so the words that lead away still
    // have to win. A newsroom is a newsroom whether or not it calls its pages documents.
    expect(leadsToLaw('/news/media-release', 'Media release')).toBe(false);
    expect(leadsToLaw('/about-us/careers', 'Careers')).toBe(false);
    expect(leadsToLaw('/search?q=data', 'Search')).toBe(false);
    expect(leadsToLaw('/media/documents', 'Press documents')).toBe(false);
  });
});
