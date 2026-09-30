/**
 * Trade done online is found wherever in the subject its words fall, in every language it is read in.
 *
 * Each half of the test is an alternation, and set after `.*` without a group only its English
 * branch was searched for; every other language's word had to open the subject. Lao PDR's Decree
 * on Electronic Commerce, "ການຄ້າທາງເອເລັກໂຕຣນິກ", opens on its trade word, and its licensing
 * provisions were held as not shown to be about selling online.
 */
import { describe, expect, it } from 'vitest';
import { MEASURE_DOMAIN } from '../src/rubric/measures.js';

const onlineTrade = MEASURE_DOMAIN['ecommerce-licence']!;

describe('the domain of a licence to sell online', () => {
  it('finds both halves wherever they fall', () => {
    expect(onlineTrade.test('ການຄ້າທາງເອເລັກໂຕຣນິກ')).toBe(true);
    expect(onlineTrade.test('ບໍລິການຕະຫຼາດທາງເອເລັກໂຕຣນິກ')).toBe(true);
    expect(onlineTrade.test('การค้าผ่านแพลตฟอร์ม')).toBe(true);
    expect(onlineTrade.test('розничная торговля через интернет')).toBe(true);
    expect(onlineTrade.test('selling goods online')).toBe(true);
  });

  it('still asks for both', () => {
    expect(onlineTrade.test('ການຄ້າ')).toBe(false);
    expect(onlineTrade.test('ເອເລັກໂຕຣນິກ')).toBe(false);
    expect(onlineTrade.test('a bank')).toBe(false);
  });
});
