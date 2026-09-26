/**
 * The questions retrieval asks, in the language the economy's law is written in.
 *
 * `queriesFor` builds its queries from the rubric, which is English. Against a corpus in English
 * or Malay that works; against Mongolian, Russian or Lao it finds nothing lexically -- a trigram of
 * "personal data" never occurs in "персональных данных" -- and reciprocal rank fusion then degrades
 * silently to the dense channel alone, which looks like retrieval working. Worse, the same queries
 * rank the register's titles to decide which instruments a live run reads at all, so a run for
 * Russia would have shortlisted by English words against Cyrillic titles.
 *
 * So each economy whose law is not in English carries a table: every English query, and the same
 * question in the official language. It is generated once, offline, by a declared engine (see
 * scripts/translate-queries.ts), committed beside the rubric so a run is reproducible, and read
 * here. Keyed by the English query itself, so a rubric edit that changes a query leaves that query
 * untranslated -- visibly, in the table's coverage -- rather than asking a stale translation.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface QueryTranslations {
  economy: string;
  /** The language the queries were translated into: "mn", "ru", "lo". */
  language: string;
  /** Which declared engine produced them, and its model -- the Section 3 record. */
  engine: string;
  model: string;
  generatedAt: string;
  /** English query → the same question in the economy's language. */
  queries: Record<string, string>;
  /**
   * The same question again, worded as the operative provision itself would say it -- who must do
   * what, to what, and where -- rather than as the rubric names the category. Asked beside the plain
   * translation because each finds what the other misses: on Russia's pillars 6-7 the plain one
   * alone never reached Article 18(5) of 152-ФЗ for 6.2, and the worded one alone lost 7.2.
   */
  wording?: Record<string, string>;
  /** Which declared engine and model produced the second phrasing, where it differs. */
  wordingEngine?: string;
  wordingModel?: string;
}

const DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', 'data', 'query-translations');
const cache = new Map<string, QueryTranslations | null>();

/** Where the tables live; a test points this elsewhere rather than writing into the committed data. */
export function translationsPath(economy: string): string {
  return join(process.env['LEXDROID_QUERY_TRANSLATIONS_DIR'] ?? DIR, `${economy}.json`);
}

/** The economy's table, or null where it has none -- an English-language economy needs none. */
export function loadTranslations(economy: string): QueryTranslations | null {
  if (cache.has(economy)) return cache.get(economy)!;
  const path = translationsPath(economy);
  const table = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as QueryTranslations) : null;
  cache.set(economy, table);
  return table;
}

/** Forget what was read, for a test or a script that has just written a table. */
export function clearTranslations(): void {
  byLanguage.clear();
  cache.clear();
}

/** The translations of these English queries that the table holds, in the same order. */
export function translatedQueries(economy: string, english: readonly string[]): string[] {
  const table = loadTranslations(economy);
  if (!table) return [];
  const out: string[] = [];
  for (const q of english) {
    for (const t of [table.queries[q]?.trim(), table.wording?.[q]?.trim()]) {
      if (t && !out.includes(t) && !english.includes(t)) out.push(t);
    }
  }
  return out;
}

const byLanguage = new Map<string, string | null>();

/**
 * The economy whose table is in this language, or null. Retrieval is handed the languages an
 * economy legislates in, not its code, so the table is found by the language written inside it.
 * One table per language: MNG is Mongolian, RUS Russian, LAO Lao.
 */
function economyForLanguage(language: string): string | null {
  if (byLanguage.has(language)) return byLanguage.get(language)!;
  const dir = process.env['LEXDROID_QUERY_TRANSLATIONS_DIR'] ?? DIR;
  let found: string | null = null;
  if (existsSync(dir)) {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.json')) continue;
      const code = file.slice(0, -'.json'.length);
      if (loadTranslations(code)?.language === language) {
        found = code;
        break;
      }
    }
  }
  byLanguage.set(language, found);
  return found;
}

/** Whether one of our tables renders the questions into this language. */
export function hasTranslationTable(language: string): boolean {
  return economyForLanguage(language) !== null;
}

/** The questions in this language, where a table holds them; empty where none does. */
export function translatedQueriesIn(language: string, english: readonly string[]): string[] {
  const economy = economyForLanguage(language);
  return economy ? translatedQueries(economy, english) : [];
}
