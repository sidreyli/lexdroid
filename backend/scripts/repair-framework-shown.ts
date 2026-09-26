/**
 * Check a run's banked framework readings again, under the checks as they now stand.
 *
 *   node ../node_modules/tsx/dist/cli.mjs scripts/repair-framework-shown.ts --run <id> [--apply]
 *
 * Whether a framework's rule is shown, and whether its purpose is, are decided when it is read and
 * banked as a flag. A check corrected afterwards -- the subject named in the provision's own
 * language -- leaves every banked flag answering the old question, and a re-read would ask the
 * engine the same thing again to fix what is only our check. So the words the reader quoted are
 * put through the checks once more, against the instrument they were read in. No model.
 *
 * The rule is looked for anywhere in the instrument rather than in the provisions the reading was
 * shown, which only widens where a rule may be found and never what counts as one. Read-only unless
 * --apply is passed.
 */
import { openDb } from '../src/db/index.js';
import { FRAMEWORK_OF } from '../src/cell/index.js';
import { dedicatedWordsShown, frameworkWordsShown, openingOf } from '../src/read/index.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

const runId = arg('run');
if (!runId) {
  console.error('usage: repair-framework-shown --run <id> [--apply]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const db = openDb();

const rows = db
  .prepare(
    `SELECT f.id, f.instrument_id, c.economy_code AS economy, c.indicator_id AS indicator, i.title,
            f.framework_words, f.framework_shown, f.dedicated_words, f.dedicated_shown
       FROM framework_reading f JOIN cell c ON c.id = f.cell_id JOIN instrument i ON i.id = f.instrument_id
      WHERE c.run_id = ?`,
  )
  .all(runId) as {
  id: number;
  instrument_id: number;
  economy: string;
  indicator: string;
  title: string;
  framework_words: string | null;
  framework_shown: number | null;
  dedicated_words: string | null;
  dedicated_shown: number | null;
}[];

const fullText = db.prepare(
  `SELECT s.heading_path, s.text FROM section s JOIN document d ON d.id = s.document_id
    WHERE d.instrument_id = ? ORDER BY d.id, s.ordinal`,
);

const changes: { id: number; framework: number; dedicated: number; label: string }[] = [];
for (const r of rows) {
  const subject = FRAMEWORK_OF[r.indicator];
  if (!subject) continue;
  const opening = openingOf(db, r.instrument_id);
  const text = (fullText.all(r.instrument_id) as { heading_path: string; text: string }[])
    .map((s) => `${s.heading_path}\n${s.text}`)
    .join('\n\n');
  const framework = frameworkWordsShown(r.framework_words, subject, text) ? 1 : 0;
  const dedicated = dedicatedWordsShown(r.dedicated_words, subject, opening) ? 1 : 0;
  if (framework === (r.framework_shown ?? 0) && dedicated === (r.dedicated_shown ?? 0)) continue;
  changes.push({
    id: r.id,
    framework,
    dedicated,
    label: `${r.economy} ${r.indicator}  rule ${r.framework_shown ?? '-'} -> ${framework}, purpose ${r.dedicated_shown ?? '-'} -> ${dedicated}  ${r.title.slice(0, 80)}`,
  });
}

console.log(`${rows.length} framework reading(s) in run ${runId}; ${changes.length} answer differently now\n`);
for (const c of changes) console.log(`  ${c.label}`);

if (!apply) {
  console.log('\nread-only. pass --apply to write.');
  process.exit(0);
}
const write = db.prepare('UPDATE framework_reading SET framework_shown = ?, dedicated_shown = ? WHERE id = ?');
db.transaction(() => {
  for (const c of changes) write.run(c.framework, c.dedicated, c.id);
})();
console.log(`\nwrote ${changes.length}.`);
