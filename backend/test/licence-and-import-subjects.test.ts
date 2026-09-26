/**
 * A licence answers 9.4 only when it is a licence to provide online content, and an import ban or
 * quota answers pillar 10 only on goods it names as ICT.
 */
import { describe, expect, it } from 'vitest';
import { MEASURE_DOMAIN, SUBJECT_DOMAIN, TITLE_CARRIES_DOMAIN } from '../src/rubric/measures.js';

describe('an online content licence', () => {
  const d = SUBJECT_DOMAIN['9.4']!;
  it('names the online service it licenses', () => {
    expect(d.test('online social games')).toBe(true);
    expect(d.test('applications service provider')).toBe(true);
    expect(d.test('บริการแพลตฟอร์มดิจิทัล')).toBe(true);
  });
  it('is not every licence a regulated trade holds', () => {
    expect(d.test('Licence in the org.au Namespace')).toBe(false);
    expect(d.test('teleport infrastructure')).toBe(false);
    expect(d.test('licence')).toBe(false);
  });
  it('may be named by the title of the rules that impose it', () => {
    expect(TITLE_CARRIES_DOMAIN.has('content-licence')).toBe(true);
    expect(TITLE_CARRIES_DOMAIN.has('strict-content-licence')).toBe(true);
  });
});

describe('an ICT import ban or quota', () => {
  it('names ICT goods', () => {
    expect(MEASURE_DOMAIN['ict-import-ban']!.test('telecommunication equipment')).toBe(true);
    expect(MEASURE_DOMAIN['import-quota']!.test('handsets')).toBe(true);
  });
  it('is not a customs power over every good', () => {
    expect(MEASURE_DOMAIN['ict-import-ban']!.test('the goods specified in Schedule 2')).toBe(false);
    expect(MEASURE_DOMAIN['import-quota']!.test('goods of the kind to which the order relates')).toBe(false);
  });
});
