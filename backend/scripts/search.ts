/**
 * Ask the corpus a question from the command line.
 *
 *   npm run -w backend search -- --economy SGP "requirement to store personal data locally"
 *
 * The shortlist stage in Zone 1 does exactly this, per cell, from queries assembled out of the
 * rubric. Having it as a command is how a person checks whether the corpus can answer a question
 * at all before any model is asked to read anything -- which is the check v1 never had.
 */
import { openDb } from '../src/db/index.js';
import { searchLexical, searchDense, loadVectors, fuse } from '../src/index/index.js';

interface Row { heading_path: string; title: string; source_url: string; anchor_label: string | null }

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (n: string): string | null => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  const economy = (flag('economy') ?? 'SGP').toUpperCase();
  const limit = Number(flag('limit') ?? 8);
  const query = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')).join(' ').trim();
  if (!query) {
    console.error('Usage: npm run -w backend search -- --economy SGP "your question"');
    process.exit(1);
  }

  const db = openDb();
  const describe = db.prepare(
    `SELECT s.heading_path, s.label AS anchor_label, i.title, i.source_url
     FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
     WHERE s.id = ?`,
  );
  const name = (id: number): string => {
    const r = describe.get(id) as Row | undefined;
    return r ? `${r.title} -- ${r.heading_path}` : `section ${id}`;
  };

  console.log(`${economy}: ${query}\n`);

  const lexical = searchLexical(db, query, { economy, limit: limit * 3 });
  console.log(`lexical (${lexical.length} hit(s))`);
  for (const h of lexical.slice(0, limit)) console.log(`  ${String(h.rank).padStart(2)}. ${name(h.sectionId)}`);

  const vectors = loadVectors(db, { economy });
  if (vectors.ids.length === 0) {
    console.log(`\ndense: nothing embedded for ${economy}. Run "npm run -w backend zone1 -- --economy ${economy} --embed".`);
    return;
  }
  const dense = await searchDense(query, vectors, { limit: limit * 3 });
  console.log(`\ndense (${vectors.ids.length} section(s) in the index)`);
  for (const h of dense.slice(0, limit)) console.log(`  ${String(h.rank).padStart(2)}. ${name(h.sectionId)}`);

  console.log(`\nfused`);
  for (const [i, h] of fuse([lexical, dense]).slice(0, limit).entries()) {
    console.log(`  ${String(i + 1).padStart(2)}. [${h.channels.join('+').padEnd(13)}] ${name(h.sectionId)}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
