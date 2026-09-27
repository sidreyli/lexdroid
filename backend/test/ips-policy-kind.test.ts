/**
 * A Russian decree or resolution that states policy is registered as advisory, not as binding law.
 *
 * Russia's 7.2 was cleared by the Doctrine of Information Security, the Foundations of State Policy
 * on international information security and a proposal to sign the UN Convention against Cybercrime.
 * Their act types are binding; what they bind is nobody.
 */
import { describe, expect, it } from 'vitest';
import { kindFor } from '../src/discover/ips.js';

describe('the kind a Russian row is registered as', () => {
  it('is advisory for a decree approving a doctrine or the foundations of policy', () => {
    expect(kindFor('Указ Президента Российской Федерации от 05.12.2016 № 646 "Об утверждении Доктрины информационной безопасности Российской Федерации"', 'order').kind).toBe('guideline');
    expect(kindFor('Указ Президента Российской Федерации от 12.04.2021 № 213 "Об утверждении Основ государственной политики Российской Федерации в области международной информационной безопасности"', 'order').kind).toBe('guideline');
  });

  it('is advisory for a resolution proposing that a treaty be signed', () => {
    expect(kindFor('Постановление Правительства Российской Федерации от 21.10.2025 № 1630 "О представлении Президенту Российской Федерации предложения о подписании Конвенции Организации Объединенных Наций против киберпреступности"', 'regulation').kind).toBe('guideline');
  });

  it('stays binding for a decree or resolution that makes rules', () => {
    expect(kindFor('Постановление Правительства Российской Федерации от 16.01.2023 № 24 "Об утверждении Правил принятия решения уполномоченным органом по защите прав субъектов персональных данных о запрещении или об ограничении трансграничной передачи персональных данных"', 'regulation').kind).toBe('regulation');
    expect(kindFor('Федеральный закон от 27.07.2006 № 152-ФЗ "О персональных данных"', 'act').kind).toBe('act');
  });
});
