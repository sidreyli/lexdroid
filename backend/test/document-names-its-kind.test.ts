import { describe, it, expect } from 'vitest';
import { statedKind } from '../src/parse/identity.js';

const s = (...texts: string[]): { text: string }[] => texts.map((text) => ({ text }));

describe('the kind a document states for itself', () => {
  it('reads the gazette print of an amending Act as an Act', () => {
    // Malaysia's Act A1727, served from the regulator's media library and filed as guidance.
    expect(
      statedKind(
        s(
          'An Act to amend the Personal Data Protection Act 2010.',
          '1. (1) This Act may be cited as the Personal Data Protection (Amendment) Act 2024. (2) This Act comes into operation on a date to be appointed by the Minister.',
        ),
        'Amendment Of Personal Data Protection Act 2024',
      ),
    ).toBe('act');
  });

  it('reads an Order as an Order, and Regulations as Regulations', () => {
    expect(
      statedKind(s('1. This Order is the Strategic Goods (Control) Order 2025 and comes into operation on 1 December 2025.'), 'Strategic Goods (Control) Order 2025'),
    ).toBe('order');
    expect(
      statedKind(s('1. These may be cited as the Online Safety (Fees) Regulations 2025.'), 'Online Safety (Fees) Regulations 2025'),
    ).toBe('regulation');
  });

  it('refuses a page that prints several instruments’ openings', () => {
    // The central bank's legislation page, which lists each Act by its long title in turn.
    expect(
      statedKind(
        s(
          'Legislation To enable the Bank to meet the objectives of a central bank, it is vested with comprehensive legal powers.',
          'Central Bank of Malaysia Act 2009. This Act may be cited as the Central Bank of Malaysia Act 2009.',
          'Financial Services Act 2013. This Act may be cited as the Financial Services Act 2013.',
        ),
        'Regulations',
      ),
    ).toBeNull();
  });

  it('refuses a description of another Act that reads like a long title', () => {
    // Singapore Customs' one-sentence page: "The X Act 2000 is an Act to provide for ...".
    expect(
      statedKind(
        s('Home Know Customs Acts and Legislation Chemical Weapons (Prohibition) Act. Links to the Act and key regulations. The Chemical Weapons (Prohibition) Act 2000 is an Act to provide for the prohibition of chemical weapons.'),
        'Chemical Weapons (Prohibition) Act | Singapore Customs',
      ),
    ).toBeNull();
  });

  it('refuses ordinary prose that fits the citation voice', () => {
    // A portal user manual: "The primary purpose of this Act is to protect the personal data ...".
    expect(
      statedKind(
        s('1.0 INTRODUCTION Act gazetted to regulate the processing of personal data. The primary purpose of this Act is to protect the personal data of individuals from being misused by irresponsible parties.'),
        'SPDP User Manual: Data Breach Notification (DBN)',
      ),
    ).toBeNull();
  });

  it('says nothing where the document names no kind, leaving the listing standing', () => {
    expect(statedKind(s('A report on the state of the communications industry in 2024.'), 'Industry Report 2024')).toBeNull();
    expect(statedKind([], 'Anything')).toBeNull();
  });
});
