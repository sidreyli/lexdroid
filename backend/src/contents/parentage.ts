/**
 * Which Act an instrument is made under, taken from the register rather than from its name.
 *
 * Parentage was inferred from the title, which is a drafting convention -- and the instruments
 * that matter most break it. The Commonwealth Procurement Rules are made under the Public
 * Governance, Performance and Accountability Act and named after neither it nor anything like it,
 * so no Act ever claimed them and the crawl never arrived. Australia's register states the
 * relation itself; reading it replaces a guess with a fact. Where a portal states nothing, the
 * naming convention stays as the fallback it always was.
 */
import type { Db } from '../db/index.js';
import type { Fetcher } from '../fetch/index.js';
import { authorisedTitles, registerIdOf } from '../discover/frl.js';

export interface ParentageProgress {
  /** Acts asked about. */
  asked: number;
  /** Instruments whose parent Act is now recorded. */
  linked: number;
  /** Acts the register answered only partly for. */
  truncated: number;
  /** Acts the register would not answer for at all. */
  failed: number;
  /** Acts the budget ran out before reaching. */
  unasked: number;
}

/** Acts whose parentage we already know, so a second sweep costs nothing. */
function alreadyLinked(db: Db, actId: number): boolean {
  const row = db
    .prepare('SELECT 1 FROM instrument WHERE made_under_instrument_id = ? LIMIT 1')
    .get(actId);
  return row !== undefined;
}

/**
 * Record, for each of these Acts, the instruments the register says are made under it.
 *
 * Asked only about the Acts whose instruments are about to be carried. Sweeping all 1,264
 * Australian Acts would be honest and slow; the Acts that never rank never need an answer.
 */
export async function linkParents(
  db: Db,
  fetcher: Fetcher,
  actIds: number[],
  opts: { log?: (line: string) => void; refresh?: boolean; budgetMs?: number } = {},
): Promise<ParentageProgress> {
  const log = opts.log ?? ((): void => {});
  const progress: ParentageProgress = { asked: 0, linked: 0, truncated: 0, failed: 0, unasked: 0 };
  const deadline = opts.budgetMs ? Date.now() + opts.budgetMs : null;

  const byRegisterId = new Map<string, number>();
  const rows = db
    .prepare("SELECT id, source_url FROM instrument WHERE source_url LIKE '%legislation.gov.au%'")
    .all() as { id: number; source_url: string }[];
  for (const r of rows) {
    const rid = registerIdOf(r.source_url);
    if (rid) byRegisterId.set(rid, r.id);
  }
  if (byRegisterId.size === 0) return progress;

  const act = db.prepare('SELECT id, title, source_url FROM instrument WHERE id = ?');
  const link = db.prepare(
    'UPDATE instrument SET made_under_instrument_id = ?, made_under_basis = ? WHERE id = ? AND id <> ?',
  );

  for (const actId of actIds) {
    // A budget that stops is reported, never rounded off to a complete sweep.
    if (deadline !== null && Date.now() > deadline) { progress.unasked += 1; continue; }
    const row = act.get(actId) as { id: number; title: string; source_url: string } | undefined;
    const registerId = row ? registerIdOf(row.source_url) : null;
    if (!row || !registerId) continue;
    if (!opts.refresh && alreadyLinked(db, actId)) continue;

    progress.asked += 1;
    const answer = await authorisedTitles(fetcher, registerId, { log });
    if (!answer.complete) {
      if (answer.titles.length === 0) progress.failed += 1;
      else progress.truncated += 1;
    }

    const basis =
      `The Federal Register of Legislation records this title as authorised by ` +
      `"${row.title}" (${registerId})`;
    let linked = 0;
    db.transaction(() => {
      for (const t of answer.titles) {
        const childId = byRegisterId.get(t.id.toUpperCase());
        if (childId === undefined) continue;
        linked += link.run(actId, basis, childId, actId).changes;
      }
    })();
    progress.linked += linked;
    if (linked > 0) {
      log(`    ${row.title}: ${linked} of ${answer.titles.length} registered here`);
    }
  }

  return progress;
}
