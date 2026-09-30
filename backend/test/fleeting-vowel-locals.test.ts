/**
 * Russian genitive-plural nouns drop a vowel before their final consonant when the singular ends in
 * a cluster ("закупка" -> "закупок", "поставка" -> "поставок", "котировка" -> "котировок"), and one
 * common noun runs the opposite way, keeping the vowel only in its undeclined form ("кошелёк" but
 * "кошелька", "кошельков", ...). Several `_LOCAL` word lists were trimmed to a stem that matched only
 * one side of that pair, so a real, common statutory phrase never named the domain it plainly is.
 * Each form below is copied from an actual quote read out of Russia's corpus, not
 * invented for the test.
 */
import { describe, expect, it } from 'vitest';
import { MEASURE_DOMAIN, MEASURE_NAMES, SUBJECT_DOMAIN } from '../src/rubric/measures.js';

describe('procurement domain survives the genitive plural', () => {
  const procurement = SUBJECT_DOMAIN['2.1']!;

  it('matches "закупок" (44-ФЗ s.31, offshore-company procurement ban)', () => {
    expect(procurement.test('участник закупок не является офшорной компанией')).toBe(true);
  });

  it('matches "котировок" (a request-for-quotations procurement method)', () => {
    expect(procurement.test('победитель в проведении запроса котировок цен на товары')).toBe(true);
  });

  it('still matches the undeclined forms it always matched', () => {
    expect(procurement.test('осуществление закупок товаров, работ, услуг')).toBe(true);
    expect(procurement.test('электронный аукцион и открытый конкурс')).toBe(true);
  });
});

describe('trade domain survives the genitive plural', () => {
  const onlineTrade = MEASURE_DOMAIN['ecommerce-licence']!;

  it('matches "поставок" alongside an online word', () => {
    expect(onlineTrade.test('оплата в счет предстоящих поставок товаров через интернет-платформу')).toBe(true);
  });
});

describe('payment domain survives the fleeting vowel running the other way', () => {
  const payment = SUBJECT_DOMAIN['12.4.1']!;

  it('matches the genitive "кошелька" (an e-wallet, as the statute actually names it)', () => {
    expect(payment.test('идентификатора платежной системы ("электронного кошелька")')).toBe(true);
  });

  it('still matches the nominative it always matched', () => {
    expect(payment.test('электронный кошелёк пользователя')).toBe(true);
  });
});

describe('remedy words survive the fleeting vowel running the other way', () => {
  const remedy = MEASURE_NAMES['trade-secret-protection']!;

  it('matches the declined "убытков" (compensation of losses, genitive plural)', () => {
    expect(remedy.test('право требовать возмещения убытков, причиненных неправомерными действиями')).toBe(true);
  });

  it('matches the bare nominative "убыток", which the old stem never covered', () => {
    expect(remedy.test('не образуется прибыль (убыток), учитываемая в целях налогообложения')).toBe(true);
  });
});
