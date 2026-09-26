/**
 * Retrieval asks its questions in the economy's own language as well as in English.
 *
 * Measured before this existed: of the 300 English queries the rubric produces for Mongolia, 5
 * found anything at all in the Mongolian corpus. A trigram of "personal data" never occurs in
 * "хувь хүний мэдээлэл", and fusion then quietly leaves the dense channel to answer alone.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { englishQueriesFor, queriesFor } from '../src/retrieve/index.js';
import { clearTranslations, translatedQueries } from '../src/retrieve/translations.js';
import { indicatorsOfPillar, loadRubric } from '../src/rubric/index.js';

const indicator = indicatorsOfPillar(6, loadRubric())[0]!;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'lexdroid-translations-'));
  process.env['LEXDROID_QUERY_TRANSLATIONS_DIR'] = dir;
  const english = englishQueriesFor(indicator, 'Mongolia');
  writeFileSync(
    join(dir, 'MNG.json'),
    JSON.stringify({
      economy: 'MNG', language: 'mn', engine: 'engine-b', model: 'test', generatedAt: '2026-09-26',
      // Only the first two are translated: a rubric edit leaves the rest untranslated, visibly.
      queries: { [english[0]!]: 'хувь хүний мэдээлэл хамгаалах', [english[1]!]: 'мэдээллийг хилийн чанадад шилжүүлэх' },
    }),
  );
  clearTranslations();
});
afterAll(() => {
  delete process.env['LEXDROID_QUERY_TRANSLATIONS_DIR'];
  clearTranslations();
  rmSync(dir, { recursive: true, force: true });
});

describe('queries in the economy\'s language', () => {
  it('asks the English queries and then their translations', () => {
    const english = englishQueriesFor(indicator, 'Mongolia');
    const asked = queriesFor(indicator, 'Mongolia', ['mn']);
    expect(asked.slice(0, english.length)).toEqual(english);
    expect(asked.slice(english.length)).toEqual(['хувь хүний мэдээлэл хамгаалах', 'мэдээллийг хилийн чанадад шилжүүлэх']);
  });

  it('asks English alone where the economy has no table', () => {
    expect(queriesFor(indicator, 'Singapore', ['en'])).toEqual(englishQueriesFor(indicator, 'Singapore'));
    expect(translatedQueries('SGP', ['anything'])).toEqual([]);
  });

  it('is unchanged for a caller that names no economy', () => {
    expect(queriesFor(indicator, 'Mongolia')).toEqual(englishQueriesFor(indicator, 'Mongolia'));
  });
});

describe('a second phrasing, as a provision says it', () => {
  it('is asked after the plain translation of the same question, and a repeat is asked once', () => {
    writeFileSync(
      join(dir, 'RUS.json'),
      JSON.stringify({
        economy: 'RUS', language: 'ru', engine: 'engine-b', model: 'test', generatedAt: '2026-09-26',
        queries: { a: 'требования к локальному хранению', b: 'трансграничная передача' },
        wording: { a: 'хранение персональных данных на территории Российской Федерации', b: 'трансграничная передача' },
      }),
    );
    clearTranslations();
    expect(translatedQueries('RUS', ['a', 'b'])).toEqual([
      'требования к локальному хранению',
      'хранение персональных данных на территории Российской Федерации',
      'трансграничная передача',
    ]);
  });
});
