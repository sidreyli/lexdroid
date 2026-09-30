/**
 * NEW or KNOWN, written onto a run's export rows.
 *
 * The template asks of every evidence row whether the instrument it cites was already in the sample
 * kit, or whether the tool found it independently. That column is how they tell discovery
 * from transcription, and it is the whole point of the C5 short note -- "provisions you believe
 * absent from the 2025 baseline".
 *
 * It was never filled. Every one of the 1,010 export rows in the store carried a null tag, because
 * the tag is defined against the kit and no module outside this quarantine may read the kit, so
 * src/export left the column alone and said so in a comment. This is the caller that comment meant.
 *
 * Deliberately last, and deliberately here. Nothing upstream may see the kit: if discovery could,
 * every instrument would be KNOWN by construction and the tag would say nothing about the sealed
 * economy that counts. So
 * the tag is applied after the rows exist, reads nothing but the title and the URL each row already
 * carries, and changes no score, no quote and no citation.
 */
import type { Database } from 'better-sqlite3';
import { discoveryTag, openBaseline, type DiscoveryTag } from './index.js';

/** The kit is keyed by economy name, our rows by code. */
const KIT_NAME: Record<string, string> = {
  AUS: 'Australia',
  MYS: 'Malaysia',
  SGP: 'Singapore',
  IND: 'India',
  CHN: 'China',
  IDN: 'Indonesia',
  LAO: 'Lao PDR',
  MNG: 'Mongolia',
  RUS: 'Russian Federation',
  THA: 'Thailand',
  TLS: 'Timor-Leste',
  KAZ: 'Kazakhstan',
  VNM: 'Viet Nam',
};

export interface TagResult {
  rows: number;
  isNew: number;
  known: number;
  /** Distinct instruments the run cited that the kit does not have. The discovery claim. */
  newInstruments: { title: string; url: string | null }[];
}

/**
 * Tag every export row of a run.
 *
 * Per instrument rather than per row: one Act cited by forty rows is one question about the kit,
 * and asking it forty times would give forty chances to answer differently.
 */
export function tagRun(db: Database, runId: string, baselinePath?: string): TagResult {
  const rows = db
    .prepare(
      `SELECT e.id, e.economy, e.law_name AS title, e.source_url AS url
         FROM export_row e JOIN cell c ON c.id = e.cell_id
        WHERE c.run_id = ?`,
    )
    .all(runId) as { id: number; economy: string; title: string; url: string | null }[];

  const out: TagResult = { rows: 0, isNew: 0, known: 0, newInstruments: [] };
  if (rows.length === 0) return out;

  const baseline = openBaseline(baselinePath);
  const update = db.prepare('UPDATE export_row SET discovery_tag = ? WHERE id = ?');
  const seen = new Map<string, DiscoveryTag>();

  try {
    db.transaction(() => {
      for (const row of rows) {
        // An economy the kit has never heard of has nothing to be KNOWN against, and every row of
        // it is a genuine independent find. That is the sealed live-test economy, and it must not
        // be tagged by accident of a name that happens to collide.
        const economy = KIT_NAME[row.economy] ?? row.economy;
        const key = `${economy}\u0000${row.title}\u0000${row.url ?? ''}`;
        let tag = seen.get(key);
        if (!tag) {
          tag = discoveryTag(baseline, economy, row.title, row.url);
          seen.set(key, tag);
          if (tag === 'NEW') out.newInstruments.push({ title: row.title, url: row.url });
        }
        update.run(tag, row.id);
        out.rows += 1;
        if (tag === 'NEW') out.isNew += 1;
        else out.known += 1;
      }
    })();
  } finally {
    baseline.close();
  }

  // Distinct titles, not distinct rows: the short note names instruments.
  const byTitle = new Map(out.newInstruments.map((i) => [i.title, i]));
  out.newInstruments = [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
  return out;
}
