/**
 * Fill the language of every stored provision that has none, the way storeDocument now does.
 *
 *   npm run -w backend backfill-language -- --economy MNG
 *
 * Provisions stored before storeDocument detected languages carry null, which decide reads as
 * English. Detected among the economy's official languages, falling back to its first -- the same
 * rule, so a later re-parse of the same bytes still finds the document unchanged.
 */
import { openDb } from '../src/db/index.js';
import { detectLanguage } from '../src/parse/language.js';
import { loadProfile } from '../src/profile/index.js';

const i = process.argv.indexOf('--economy');
const economy = i >= 0 ? process.argv[i + 1]?.toUpperCase() : undefined;
if (!economy) throw new Error('--economy <CODE> is required');
const languages = loadProfile(economy).officialLanguages;
if (languages.length === 0) throw new Error(`${economy} declares no official language`);

const db = openDb();
const rows = db
  .prepare(
    `SELECT s.id, s.text FROM section s JOIN document d ON d.id = s.document_id
     JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ? AND s.language IS NULL`,
  )
  .all(economy) as { id: number; text: string }[];
const set = db.prepare('UPDATE section SET language = ? WHERE id = ?');
const counts = new Map<string, number>();
db.transaction(() => {
  for (const r of rows) {
    const lang = detectLanguage(r.text, { candidates: languages }) ?? languages[0]!;
    set.run(lang, r.id);
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
})();
console.log(`${economy}: ${rows.length} provision(s) given a language`, Object.fromEntries(counts));
