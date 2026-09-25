/**
 * Two more measures whose requirement the statute writes in a voice the rubric does not use.
 *
 * This is the rule `test/de-minimis-clearance.test.ts` establishes, applied where measurement found
 * it again. The rubric names a measure with the policy word for it; a legislature writes the duty
 * in the drafting convention of its own statute book, and where the two share no word the question
 * never reaches the provision. The remedy is the same: ask for the measure in each voice, in words
 * that name no economy and no instrument.
 *
 * Payment licensing. One convention licenses the provider -- the gloss finds it. The other forbids
 * anyone but an authorised institution to hold the value: section 22 of Australia's Payment Systems
 * (Regulation) Act 1998, "Holder of stored value must be an ADI or be authorised or exempted under
 * this Part", an offence of 200 penalty units. It never says "licence". It was not in the top 600
 * on any question the cell asked, although its instrument was already named as governing and its
 * section 23 -- the power to grant the authority -- was read. The cell answered "no payment
 * licensing requirement found" with twenty findings before it. With the authorisation question
 * asked, section 22 is 5th of the depth.
 *
 * Passive sharing. Sharing is the policy word; access on request is the drafting one. Clause 33 of
 * Schedule 1 to Australia's Telecommunications Act 1997 -- "A carrier (the first carrier) must, if
 * requested to do so by another carrier (the second carrier), give the second carrier access to a
 * [tower]" -- was never retrieved, and the register named an offshore-energy Act as governing the
 * question instead, because four of the cell's five questions carry the word "infrastructure" and
 * three Acts carry it in their titles. With the access question asked, the Telecommunications Act
 * governs the cell and Schedule 1 is in the depth.
 *
 * The gate was never the obstacle for either: `LICENCE` already accepts a word meaning
 * authorisation. Nothing asked the question.
 */
import { describe, expect, it } from 'vitest';
import { MEASURES, MEASURE_NAMES } from '../src/rubric/measures.js';
import { queriesFor } from '../src/retrieve/index.js';
import type { Indicator } from '../src/rubric/types.js';

const paymentLicence = MEASURES['12.4.4']!.find((m) => m.token === 'payment-licence')!;
const passiveSharing = MEASURES['5.1']!.find((m) => m.token === 'passive-sharing-duty')!;

const indicator = (id: string, pillarId: number, pillarName: string, category: string, bands: string[]): Indicator => ({
  id,
  pillarId,
  pillarName,
  category,
  exception: null,
  criteriaText: '...',
  bands: bands.map((criterion, i) => ({ score: i === 0 ? 1 : 0, criterion, ordinal: i + 1 })),
  shape: 'provision',
  shapeBasis: 'test',
  provenance: { document: 'test', locator: 'test' },
});

const payments = indicator('12.4.4', 12, 'Online Sales and Transactions', 'Online payment limitations: licensing requirements', [
  'Licensing requirements with restrictive conditions',
  'No restriction',
]);
const sharing = indicator('5.1', 5, 'Telecom Regulations & Competition', 'Lack of passive infrastructure sharing', [
  'No passive infrastructure sharing obligation',
  'Passive sharing is mandated',
]);

describe('a requirement asked for in each voice a statute writes it in', () => {
  it('asks payment licensing as a licence and as an authorisation to hold the value', () => {
    const asked = [paymentLicence.gloss, ...(paymentLicence.alsoAsked ?? [])].join(' ').toLowerCase();
    expect(asked).toMatch(/licence/);
    expect(asked).toMatch(/authorised|authority/);
    expect(asked).toMatch(/stored value|payment facility/);
  });

  it('asks passive sharing as sharing and as access on request', () => {
    const asked = [passiveSharing.gloss, ...(passiveSharing.alsoAsked ?? [])].join(' ').toLowerCase();
    expect(asked).toMatch(/shar/);
    expect(asked).toMatch(/access/);
    expect(asked).toMatch(/on request|requested/);
  });

  it('names no economy and no instrument in any of them', () => {
    // A question fitted to one statute book finds one statute book, which is the whole objection
    // to writing the answer into the query. Both lines were drafted from the drafting convention,
    // not from the provision: neither carries "transmission tower", "eligible underground
    // facility" or "deposit-taking institution", the words the two Australian provisions use.
    for (const q of [
      paymentLicence.gloss,
      ...(paymentLicence.alsoAsked ?? []),
      passiveSharing.gloss,
      ...(passiveSharing.alsoAsked ?? []),
    ]) {
      expect(q).not.toMatch(/Australia|Singapore|Malaysia/i);
      expect(q).not.toMatch(/Payment Systems \(Regulation\)|Telecommunications Act|deposit-taking|transmission tower|eligible underground/i);
    }
  });

  it('carries both voices into the questions each cell asks', () => {
    expect(queriesFor(payments)).toContain(paymentLicence.alsoAsked![0]);
    expect(queriesFor(sharing)).toContain(passiveSharing.alsoAsked![0]);
  });

  it('still asks the measure itself, not only the second voice', () => {
    expect(queriesFor(payments)).toContain(paymentLicence.gloss.replace(/\s+/g, ' ').trim());
    expect(queriesFor(sharing)).toContain(passiveSharing.gloss.replace(/\s+/g, ' ').trim());
  });

  it('needed no change to the gate, which already accepted a word meaning authorisation', () => {
    // Stated as a test because it is the reason this is a retrieval fix and not a decision one.
    // Section 22 would have qualified the moment it was read; it was never read.
    const licence = MEASURE_NAMES['payment-licence']!;
    expect(licence.test('be an authorised deposit-taking institution')).toBe(true);
    expect(licence.test('the holder of the stored value')).toBe(false);
  });

  it('does not accept the bare noun "authority", and should not', () => {
    // The gate takes "authorised" and refuses "authority", which looks like an oversight and is
    // not. The noun names a permission in one breath and a regulator in the next -- section 23 of
    // the same Act grants an authority, and the Australian Communications and Media Authority is
    // an authority -- so accepting it would let a regulator's name make out a licensing measure.
    // That is the failure the subject and establishment guards were added to close for 5.7, and
    // widening here would reopen it. The provision that answers this cell says "authorised", and
    // the words a reader copies from it are what the gate sees.
    const licence = MEASURE_NAMES['payment-licence']!;
    expect(licence.test('there is no authority or exemption in force')).toBe(false);
    expect(licence.test('the Australian Communications and Media Authority')).toBe(false);
  });
});
