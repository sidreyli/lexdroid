/**
 * Translate retrieval's questions into an economy's language, once, with a declared engine.
 *
 *   npm run -w backend translate-queries -- --economy MNG                 engine-b, missing only
 *   npm run -w backend translate-queries -- --economy RUS --engine engine-a    the local engine
 *   npm run -w backend translate-queries -- --economy LAO --all            redo every query
 *   npm run -w backend translate-queries -- --economy MNG --report         coverage and hits, no engine
 *   npm run -w backend translate-queries -- --economy RUS --wording        the second phrasing: as a provision says it
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
// The second phrasing, kept beside the plain translation rather than in place of it.
const wording = process.argv.includes('--wording');
const reportOnly = process.argv.includes('--report');
const BATCH = Number(arg('--batch') ?? 10);

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
const table: QueryTranslations = existing && !(redoAll && !wording)
  ? existing
  : { economy, language, engine: engineId, model: '', generatedAt: '', queries: {} };
if (wording) table.wording = redoAll ? {} : (table.wording ?? {});
/** The field this pass fills. */
const target = (): Record<string, string> => (wording ? table.wording! : table.queries);

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

  const missing = english.filter((q) => !target()[q]);
  console.log(`${economy}: ${english.length} English queries, ${missing.length} to translate into ${lang.name} with ${engineId} (${engine.model})`);

  const system =
    `You translate short search queries for a database of ${profile.name}'s legislation into ${lang.name}. ` +
    'Each query describes a legal requirement or policy measure. Translate its meaning into the wording a statute, ' +
    'decree or regulation of that country would actually use, so that the query matches the text of the law. ' +
    // With --wording, the second phrasing. Measured on Russia's 6.2: the plain translation of a
    // category label ("Требования к локальному хранению...") never reached Article 18(5) of 152-ФЗ;
    // the words of the duty itself ("хранение персональных данных ... с использованием баз данных,
    // находящихся на территории Российской Федерации") did. Each alone lost an indicator the other
    // found, so both are kept and both are asked.
    (wording
      ? 'Write it as the words the operative provision itself would contain -- who must do what, to what, and where -- ' +
        'not as the name of a policy category. Leave out headings and labels such as "Local storage requirements." ' +
        'and descriptions of scoring bands. '
      : '') +
    `${lang.note} Keep numbers and proper names. Do not explain, do not add anything, do not leave English words in. ` +
    'Return exactly one translation per query, in the same order.';
  const schema = {
    type: 'object',
    properties: { translations: { type: 'array', items: { type: 'string' } } },
    required: ['translations'],
  };

  /** Written after every batch, so a rate limit or a dropped connection costs one batch, not the run. */
  const save = (): void => {
    if (wording) table.wordingEngine = engineId;
    else table.engine = engineId;
    table.generatedAt = new Date().toISOString();
    table.queries = Object.fromEntries(english.filter((q) => table.queries[q]).map((q) => [q, table.queries[q]!]));
    if (table.wording) table.wording = Object.fromEntries(english.filter((q) => table.wording![q]).map((q) => [q, table.wording![q]!]));
    mkdirSync(dirname(translationsPath(economy)), { recursive: true });
    writeFileSync(translationsPath(economy), JSON.stringify(table, null, 1) + '\n');
  };

  /**
   * A hosted engine's rate limit is a wait, not a failure: back off and ask again.
   *
   * The completion limit is kept near what a batch needs. Groq's free tier allows 8,000 tokens a
   * minute and counts each request's max_tokens against it up front, so asking for 6,000 made
   * almost every request wait; a batch too long for 2,000 is split by translate() instead.
   */
  const ask = async (prompt: string) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await generate(prompt, system, { schema, temperature: 0, maxOutputTokens: 2000, ...(engine.hosted ? {} : { model: engine.model }) });
      } catch (err) {
        // A rate limit, a dropped connection or a server error is the host's state, not our
        // request: wait and ask again. The first background run died on one ECONNRESET.
        const limited = err instanceof Error && /429|ECONNRESET|ETIMEDOUT|EPIPE|socket|answered 5\d\d|not answering/i.test(err.message);
        if (!limited || attempt >= 8) throw err;
        const pause = 15_000 * (attempt + 1);
        console.log(`  rate-limited; waiting ${pause / 1000}s`);
        await new Promise((r) => setTimeout(r, pause));
      }
    }
  };

  /** A translation is kept only if it is in the language asked for; a mostly-Latin answer is an echo of the English. */
  const accept = (t: string): boolean => {
    const letters = (t.match(/\p{L}/gu) ?? []).length;
    const latin = (t.match(/[A-Za-z]/g) ?? []).length;
    return t.length > 0 && lang.script.test(t) && latin <= letters * 0.3;
  };
  let rejected = 0;

  /**
   * Translate a batch, halving it where the engine cannot fit its answer into one response -- a
   * batch of twenty Russian queries ran past the completion limit and came back as a 400 rather
   * than a translation. A single query that still fails is skipped and named.
   */
  const translate = async (batch: string[]): Promise<number> => {
    const prompt = `Translate each of these ${batch.length} queries.

${JSON.stringify(batch, null, 1)}`;
    let out: string[] | null = null;
    try {
      const answer = await ask(prompt);
      if (wording) table.wordingModel = answer.model;
      else table.model = answer.model;
      const parsed = JSON.parse(answer.text) as { translations?: string[] };
      out = Array.isArray(parsed.translations) && parsed.translations.length === batch.length ? parsed.translations : null;
    } catch (err) {
      if (!(err instanceof SyntaxError) && !(err instanceof Error && /json_validate_failed|400/.test(err.message))) throw err;
    }
    if (!out) {
      if (batch.length === 1) {
        console.log(`  could not translate: ${batch[0]!.slice(0, 80)}`);
        return 0;
      }
      const half = Math.ceil(batch.length / 2);
      return (await translate(batch.slice(0, half))) + (await translate(batch.slice(half)));
    }
    let kept = 0;
    batch.forEach((q, k) => {
      const t = (out![k] ?? '').replace(/ໍາ/g, 'ຳ').replace(/\s+/g, ' ').trim();
      if (accept(t)) {
        target()[q] = t;
        kept += 1;
      } else if (rejected++ < 5) {
        console.log(`  rejected: "${q.slice(0, 60)}" -> "${t.slice(0, 80)}"`);
      }
    });
    save();
    return kept;
  };

  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const kept = await translate(batch);
    console.log(`  batch ${i / BATCH + 1}/${Math.ceil(missing.length / BATCH)}: ${kept} of ${batch.length} kept`);
  }

  save();
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
