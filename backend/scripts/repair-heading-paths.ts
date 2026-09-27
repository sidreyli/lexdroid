/**
 * Give a numbered sub-paragraph back the headings it sits under.
 *
 *   npm run -w backend repair-heading-paths -- [--economy MYS] [--apply]
 *
 * Both retrieval channels are built from the heading path as well as the text: the embedding input
 * is `heading_path + "\n" + text` for the reason stated where it is built -- a subsection reads as
 * nonsense without it -- and `section_fts` indexes it as a second column at half weight. For most
 * of the corpus the parser fills it with the chain a reader would quote, "Part II FORMATION AND
 * ADMINISTRATION OF COMPANIES > 14. (1) A person who desires to form a company shall apply".
 *
 * For the documents that number their paragraphs to three and four levels it fills it with the
 * paragraph's own first line and nothing else, and those are the policy documents a registry or a
 * regulator publishes its actual requirements in. MYNIC's Registrant Policy lists who may hold a
 * .com.my domain name at 8.2.1.1 to 8.2.1.22 -- "A company incorporated under the Companies Act
 * 2016", "A foreign company registered with the Companies Commission of Malaysia pursuant to
 * section 332" -- and not one of those 22 clauses says "domain name" anywhere in itself. The words
 * that make them domain rules are in 8.2.1, "To be eligible for a domain name in the '.com.my',
 * '.net.my' and '.org.my' 3LD, applicants must meet at least one of the following criteria". So a
 * question about registering a domain locally could not reach them: none of the 22 was read for
 * any cell in the last Malaysian run, and 12.7 was answered instead from 10.1.1, "it can be
 * registered by any person or organization" -- the first half of a sentence whose second half is
 * "based on the eligibility criteria requirements in Paragraph 8".
 *
 * The chain is recoverable from the labels alone, which is why this is a repair and not a reparse:
 * 8.2.1.1 sits under 8.2.1 sits under 8.2 sits under 8, and each of those is a section of the same
 * document. Only a path with no chain in it is rewritten, so a parser that built one keeps it.
 *
 * `text`, `char_start` and `char_end` are not touched, so the offsets D3 checks still reproduce.
 * The lexical rows are rebuilt per document and the vectors of the sections that changed are
 * dropped, for `zone1 --embed` to make again.
 */
import { openDb, indexSections } from '../src/db/index.js';

const argv = process.argv.slice(2);
const flag = (n: string): string | null => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? (argv[i + 1] ?? null) : null;
};
const apply = argv.includes('--apply');
const economy = flag('economy')?.toUpperCase() ?? null;

const db = openDb();

interface Row {
  id: number;
  document_id: number;
  ordinal: number;
  label: string | null;
  heading_path: string;
}

const rows = db
  .prepare(
    `SELECT s.id, s.document_id, s.ordinal, s.label, s.heading_path
       FROM section s
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      ${economy ? 'WHERE i.economy_code = ?' : ''}
      ORDER BY s.document_id, s.ordinal`,
  )
  .all(...(economy ? [economy] : [])) as Row[];

/** The heading this section contributes to a chain: the last link of whatever it already carries. */
const ownLink = (headingPath: string): string => {
  const parts = headingPath.split(' > ');
  return (parts[parts.length - 1] ?? headingPath).trim();
};

/** 8.2.1.1 -> ['8', '8.2', '8.2.1']. Numbered labels only: "Part II" and "s 8A" name no parent. */
const ancestorLabels = (label: string): string[] => {
  if (!/^\d+(\.\d+)+$/.test(label)) return [];
  const parts = label.split('.');
  return parts.slice(0, -1).map((_, n) => parts.slice(0, n + 1).join('.'));
};

const byDocument = new Map<number, Row[]>();
for (const r of rows) {
  const list = byDocument.get(r.document_id) ?? [];
  list.push(r);
  byDocument.set(r.document_id, list);
}

const changes: { id: number; documentId: number; from: string; to: string }[] = [];

for (const [documentId, sections] of byDocument) {
  const byLabel = new Map<string, Row>();
  for (const s of sections) if (s.label) byLabel.set(s.label, s);
  for (const s of sections) {
    // A path that already names an ancestor was built by a parser that knew the structure.
    if (!s.label || s.heading_path.includes(' > ')) continue;
    const chain: string[] = [];
    for (const parentLabel of ancestorLabels(s.label)) {
      const parent = byLabel.get(parentLabel);
      // Only an ancestor that comes before it in the document: a later 8.2 is a different 8.2.
      if (parent && parent.ordinal < s.ordinal) chain.push(ownLink(parent.heading_path));
    }
    if (chain.length === 0) continue;
    const to = [...chain, ownLink(s.heading_path)].join(' > ');
    if (to !== s.heading_path) changes.push({ id: s.id, documentId, from: s.heading_path, to });
  }
}

console.log(
  `${changes.length} section(s) whose heading path names no ancestor and whose labels give one` +
    (apply ? '' : '  (dry run)'),
);

const documents = new Set(changes.map((c) => c.documentId));
console.log(`across ${documents.size} document(s)\n`);
for (const c of changes.slice(0, 12)) {
  console.log(`  #${c.id}`);
  console.log(`     was: ${c.from.slice(0, 110)}`);
  console.log(`     now: ${c.to.slice(0, 160)}`);
}
if (changes.length > 12) console.log(`  ... and ${changes.length - 12} more`);

if (!apply || changes.length === 0) {
  if (!apply) console.log('\nNothing written. Pass --apply to write, then run zone1 --embed.');
  process.exit(0);
}

const setPath = db.prepare('UPDATE section SET heading_path = ? WHERE id = ?');
const dropVector = db.prepare('DELETE FROM section_embedding WHERE section_id = ?');
let dropped = 0;
db.transaction(() => {
  for (const c of changes) {
    setPath.run(c.to, c.id);
    dropped += dropVector.run(c.id).changes;
  }
})();
console.log(`\n${changes.length} heading path(s) rewritten, ${dropped} vector(s) dropped`);

let indexed = 0;
for (const documentId of documents) indexed += indexSections(db, documentId);
console.log(`${indexed} section(s) re-indexed across ${documents.size} document(s)`);
console.log('\nRun `zone1 --embed` to rebuild the vectors that were dropped.');
