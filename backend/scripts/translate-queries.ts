/**
 * Translate retrieval's questions into an economy's language, once, with a declared engine.
 *
 *   npm run -w backend translate-queries -- --economy MNG                 engine-b (Groq), missing only
 *   npm run -w backend translate-queries -- --economy RUS --engine engine-a    the local engine
 *   npm run -w backend translate-queries -- --economy LAO --all            redo every query
 *   npm run -w backend translate-queries -- --economy MNG --report         coverage and hits, no engine
 *
 * Writes backend/data/query-translations/<CODE>.json, which retrieval reads (src/retrieve/
 * translations.ts). The engine is one of the two declared in data/engines.json, so no proprietary
 * API takes part (Section 3), and the table records which one produced it.
 *
 * After writing, it asks each English query and each translation of the economy's current corpus
 * and prints how many find anything. English against a Cyrillic or Lao corpus should find almost
 * nothing, and the translations should find most of what the corpus holds on the subject; a
 * translation that finds nothing is worth reading.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from '../src/db/index.js';
import { loadEnv } from '../src/env.js';
import { findEngine } from '../src/engines/registry.js';
import { generate } from '../src/engines/ollama.js';
import { searchLexical } from '../src/index/index.js';
import { loadProfile } from '../src/profile/index.js';
import { englishQueriesFor } from '../src/retrieve/index.js';
import { clearTranslations, loadTranslations, translationsPath, type QueryTranslations } from '../src/retrieve/translations.js';
import { indicatorsOfPillar, loadRubric } from '../src/rubric/index.js';

loadEnv();
const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const economy = arg('--economy');
if (!economy) throw new Error('--economy <CODE> is required');
const engineId = arg('--engine') ?? 'engine-b';
const redoAll = process.argv.includes('--all');
const reportOnly = process.argv.includes('--report');
const BATCH = Number(arg('--batch') ?? 20);

const profile = loadProfile(economy);
const language = profile.officialLanguages[0]!;
const LANGUAGE: Record<string, { name: string; script: RegExp; note: string }> = {
  mn: {
    name: 'Mongolian (Cyrillic script)',
    script: /[Ѐ-ӿ]/u,
    note: 'Use the terms Mongolian legislation uses (e.g. хувь хүний мэдээлэл, хууль, журам, тушаал, зөвшөөрөл).',
  },
  ru: {
    name: 'Russian',
    script: /[Ѐ-ӿ]/u,
    note: 'Use the terms Russian federal legislation uses (e.g. персональные данные, трансграничная передача, лицензия, оператор связи).',
  },
  lo: {
    name: 'Lao',
    script: /[຀-໿]/u,
    note: 'Use the terms Lao legislation uses (e.g. ຂໍ້ມູນສ່ວນບຸກຄົນ, ກົດໝາຍ, ການອະນຸຍາດ). Write ຳ as the single character, not ໍ + າ.',
  },
};
const lang = LANGUAGE[language];
if (!lang) throw new Error(`${economy} publishes in ${language}; there is no translation setting for it and English retrieval needs none`);

// Every English query the rubric produces for this economy, as retrieval will ask it.
const rubric = loadRubric();
const english = [
  ...new Set(rubric.pillars.flatMap((p) => indicatorsOfPillar(p.id, rubric)).flatMap((ind) => englishQueriesFor(ind, profile.name))),
];

const existing = loadTranslations(economy);
const table: QueryTranslations = existing && !redoAll
  ? existing
  : { economy, language, engine: engineId, model: '', generatedAt: '', queries: {} };

if (!reportOnly) {
  const engine = findEngine(engineId);
  if (!engine?.declared) throw new Error(`${engineId} is not a declared engine in data/engines.json`);
  if (engine.hosted) {
    if (!process.env['LEXDROID_HOSTED_API_KEY']) {
      throw new Error(`${engineId} is hosted and LEXDROID_HOSTED_API_KEY is not set (put it in .env, never in a committed file)`);
    }
    process.env['LEXDROID_HOSTED_BASE_URL'] = engine.hosts[0] ?? '';
    process.env['LEXDROID_HOSTED_MODEL'] = engine.model;
    process.env['LEXDROID_HOSTED_PROVIDER'] = engine.provider;
  } else {
    delete process.env['LEXDROID_HOSTED_BASE_URL'];
    delete process.env['LEXDROID_HOSTED_MODEL'];
  }

  const missing = english.filter((q) => !table.queries[q]);
  console.log(`${economy}: ${english.length} English queries, ${missing.length} to translate into ${lang.name} with ${engineId} (${engine.model})`);

  const system =
    `You translate short search queries for a database of ${profile.name}'s legislation into ${lang.name}. ` +
    'Each query describes a legal requirement or policy measure. Translate its meaning into the wording a statute, ' +
    'decree or regulation of that country would actually use, so that the query matches the text of the law. ' +
    `${lang.note} Keep numbers and proper names. Do not explain, do not add anything, do not leave English words in. ` +
    'Return exactly one translation per query, in the same order.';
  const schema = {
    type: 'object',
    properties: { translations: { type: 'array', items: { type: 'string' } } },
    required: ['translations'],
  };

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const prompt = `Translate each of these ${batch.length} queries.\n\n${JSON.stringify(batch, null, 1)}`;
    const answer = await generate(prompt, system, { schema, temperature: 0, maxOutputTokens: 6000, ...(engine.hosted ? {} : { model: engine.model }) });
    let out: string[];
    try {
      out = (JSON.parse(answer.text) as { translations: string[] }).translations;
    } catch {
      console.log(`  batch ${i / BATCH + 1}: the engine returned something that is not the JSON asked for; skipped`);
      continue;
    }
    if (out.length !== batch.length) {
      console.log(`  batch ${i / BATCH + 1}: ${out.length} translations for ${batch.length} queries; skipped rather than misaligned`);
      continue;
    }
    let kept = 0;
    batch.forEach((q, k) => {
      const t = (out[k] ?? '').replace(/ໍາ/g, 'ຳ').replace(/\s+/g, ' ').trim();
      // A translation must be in the language asked for; an echo of the English is not one.
      if (t && lang.script.test(t) && !/[A-Za-z]{4}/.test(t)) {
        table.queries[q] = t;
        kept += 1;
      }
    });
    table.model = answer.model;
    console.log(`  batch ${i / BATCH + 1}/${Math.ceil(missing.length / BATCH)}: ${kept} of ${batch.length} kept`);
  }

  table.engine = engineId;
  table.generatedAt = new Date().toISOString();
  const ordered = Object.fromEntries(english.filter((q) => table.queries[q]).map((q) => [q, table.queries[q]!]));
  table.queries = ordered;
  mkdirSync(dirname(translationsPath(economy)), { recursive: true });
  writeFileSync(translationsPath(economy), JSON.stringify(table, null, 1) + '\n');
  clearTranslations();
  console.log(`wrote ${translationsPath(economy)}`);
}

// What each language finds in the corpus as it stands.
const db = openDb();
const hits = (q: string): number => searchLexical(db, q, { economy, limit: 5 }).length;
const covered = english.filter((q) => table.queries[q]);
const englishFinds = english.filter((q) => hits(q) > 0).length;
const localFinds = covered.filter((q) => hits(table.queries[q]!) > 0).length;
console.log(`\n${economy} coverage: ${covered.length} of ${english.length} queries translated`);
console.log(`  English queries that find anything in the corpus:     ${englishFinds} of ${english.length}`);
console.log(`  translated queries that find anything in the corpus:  ${localFinds} of ${covered.length}`);
const silent = covered.filter((q) => hits(table.queries[q]!) === 0).slice(0, 8);
if (silent.length) {
  console.log('  translations that find nothing (worth reading, or the corpus lacks the subject):');
  for (const q of silent) console.log(`    ${q.slice(0, 70)}  →  ${table.queries[q]!.slice(0, 70)}`);
}
