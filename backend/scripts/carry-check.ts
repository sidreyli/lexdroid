/** What a named run would carry into each pillar, counted before a pod is rented. */
import Database from 'better-sqlite3';
import { carriedReadings } from '../src/read/carry.js';
import { indicatorsOfPillar, loadRubric } from '../src/rubric/index.js';
import { READING_MODEL } from '../src/read/index.js';

const RUN = process.argv[2]!;
const db = new Database('backend/data/lexdroid.db', { readonly: true });
const rubric = loadRubric();
let total = 0;
let findings = 0;
for (const pillar of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
  const ids = indicatorsOfPillar(pillar, rubric).map((i) => i.id);
  const carried = carriedReadings(db, RUN, pillar, ids, READING_MODEL);
  let f = 0;
  for (const r of carried.values()) f += r.findings.length;
  total += carried.size;
  findings += f;
  console.log(`  pillar ${String(pillar).padStart(2)}  ${String(carried.size).padStart(5)} reading(s)  ${String(f).padStart(4)} finding(s)`);
}
console.log(`\n  ${total} reading(s) carried in total, holding ${findings} finding(s)`);
db.close();
