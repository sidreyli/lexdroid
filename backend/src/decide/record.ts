/**
 * The decision, rebuilt from what a run wrote down.
 *
 * A score that cannot be re-derived from the record is not computed, it is remembered. Verify
 * checks the recorded score against this; the basis backfill uses it to fill in what the answer
 * stood on for runs recorded before that was kept. Both need the same assembly, and two copies of
 * it would drift into two different re-derivations of the same run.
 *
 * Nothing here searches or reads: it rebuilds Zone 3's input out of Zone 1 and Zone 2's records.
 */
import type { Db } from '../db/index.js';
import { citationUrl } from '../export/index.js';
import { loadRubric } from '../rubric/index.js';
import { decide, type Decision, type Evidence, type FrameworkEvidence, type SurfacedInstrument } from './index.js';
import type { FxRates } from './currency.js';
import { amendsAnotherAct, citesADefinition, inheritsAPower } from '../parse/identity.js';
import { loadProfile } from '../profile/index.js';
import type { InstrumentType } from '../profile/types.js';
import { loadConfirmations, noConfirmations, confirmedFlag, type ConfirmationSet } from '../read/confirmations.js';

export interface RecordedCell {
  id: number;
  economy_code: string;
  indicator_id: string;
  sections_read: number | null;
  sections_indexed: number | null;
  surfaced: number | null;
  governing: string | null;
  score: number | null;
  band_ordinal: number | null;
}

/** The instrument ids recorded with the cell, or none where a store predates the column. */
export function parseGoverning(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : [];
  } catch {
    return [];
  }
}

/**
 * Whether this run's stored scores were computed against the second reading's verdicts.
 *
 * Asked of the run rather than assumed, because the answer differs by run and getting it wrong
 * makes every score look wrong. A run recorded before the pass was consulted wrote no confirmation
 * state at all, and must be re-derived the way it was decided or the check is of the wrong thing.
 */
export function scoredWithConfirmations(db: Db, runId: string): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(a.confirmations_asked) AS recorded
         FROM cell c JOIN cell_answer a ON a.cell_id = c.id WHERE c.run_id = ?`,
    )
    .get(runId) as { recorded: number } | undefined;
  return (row?.recorded ?? 0) > 0;
}

export interface RebuildOptions {
  /**
   * The verdicts to rebuild against, where the caller knows better than the stored state does.
   *
   * The re-score that follows a confirmation pass is the case: it is about to write the state this
   * would otherwise be read from, so it must say what it is writing rather than ask.
   */
  confirmations?: ConfirmationSet;
}

export function recordedDecider(
  db: Db,
  runId: string,
  rates: FxRates | null,
  opts: RebuildOptions = {},
): { cells: RecordedCell[]; rebuild: (cell: RecordedCell) => Decision | null } {
  const confirmations =
    opts.confirmations ?? (scoredWithConfirmations(db, runId) ? loadConfirmations(db) : noConfirmations());
  const cells = db
    .prepare(
      `SELECT c.id, c.economy_code, c.indicator_id, c.sections_read, c.sections_indexed, c.surfaced,
              c.governing, a.score, a.band_ordinal
         FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
        WHERE c.run_id = ? ORDER BY c.indicator_id`,
    )
    .all(runId) as RecordedCell[];

  // A pillar's whole evidence, not one cell's. Reading is pillar-scoped and the decision sees all
  // of it -- which instrument governs a question is settled by what the pillar found in it -- so a
  // per-cell rebuild produces a smaller input and can land on a different answer. Australia's
  // de minimis cell is where that showed: recorded as answered, re-derived as unanswerable.
  const evidenceForPillar = db.prepare(
    `SELECT r.attributes, r.section_id, s.heading_path, s.text, s.anchor, s.page,
            d.url AS doc_url, d.media_type,
            i.id AS instrument_id, i.title, i.kind AS instrument_kind, i.status AS instrument_status
       FROM reading r
       JOIN cell c ON c.id = r.cell_id
       JOIN section s ON s.id = r.section_id
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE c.run_id = ? AND c.economy_code = ? AND c.indicator_id LIKE ? AND r.applies = 1
      ORDER BY r.id`,
  );
  const pillarCache = new Map<string, Evidence[]>();

  const frameworkFor = db.prepare(
    `SELECT f.instrument_id, f.establishes_framework, f.framework_shown, f.horizontal, f.dedicated,
            f.dedicated_shown, f.sectoral_shown, f.sector, f.quote, i.title, i.source_url, i.kind
       FROM framework_reading f JOIN instrument i ON i.id = f.instrument_id
      WHERE f.cell_id = ? ORDER BY f.id`,
  );

  // Which instruments the search surfaced, and how high. Rebuilt from the shortlist rather than
  // re-run: the point is to re-derive the decision, not to redo the search and decide over a
  // different list.
  const surfacedFor = db.prepare(
    `SELECT i.id AS instrumentId, i.title AS instrumentTitle, MIN(se.rank) AS rank
       FROM shortlist_entry se
       JOIN section s ON s.id = se.section_id
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE se.cell_id = ? GROUP BY i.id ORDER BY rank`,
  );

  const currentTo = new Map<number, string | null>(
    (db.prepare('SELECT id, COALESCE(current_to, last_amended_on) AS current_to FROM instrument').all() as
      { id: number; current_to: string | null }[]).map((r) => [r.id, r.current_to]),
  );

  const byId = new Map(loadRubric().indicators.map((i) => [i.id, i]));

  const profiles = new Map<string, Map<string, InstrumentType['bindingness']>>();
  const bindingnessFor = (economy: string, kind: InstrumentType['kind']) => {
    let m = profiles.get(economy);
    if (!m) {
      m = new Map(loadProfile(economy).instrumentTypes.map((t) => [t.kind, t.bindingness]));
      profiles.set(economy, m);
    }
    const bindingness = m.get(kind);
    return bindingness ? { bindingness } : {};
  };

  const rebuild = (cell: RecordedCell): Decision | null => {
    const indicator = byId.get(cell.indicator_id);
    if (!indicator) return null;

    const pillar = cell.indicator_id.split('.')[0] ?? '';
    const key = `${cell.economy_code}/${pillar}`;
    let evidence = pillarCache.get(key);
    if (!evidence) {
      evidence = [];
      for (const r of evidenceForPillar.all(runId, cell.economy_code, `${pillar}.%`) as {
        attributes: string; section_id: number; heading_path: string; text: string;
        anchor: string | null; page: number | null; doc_url: string; media_type: string | null;
        instrument_id: number; title: string; instrument_kind: InstrumentType['kind'];
        instrument_status: Evidence['instrumentStatus'];
      }[]) {
        let findings: unknown = [];
        try {
          findings = JSON.parse(r.attributes);
        } catch {
          findings = [];
        }
        if (!Array.isArray(findings)) continue;
        for (const finding of findings as Evidence['finding'][]) {
          // The same provision reported twice for the same measure is one measure, as it was when
          // the run built this list.
          if (
            evidence.some(
              (e) =>
                e.sectionId === r.section_id &&
                e.finding.indicatorId === finding.indicatorId &&
                e.finding.measure === finding.measure,
            )
          ) {
            continue;
          }
          evidence.push({
            finding,
            sectionId: r.section_id,
            instrumentId: r.instrument_id,
            instrumentTitle: r.title,
            headingPath: r.heading_path,
            amendsAnotherAct: amendsAnotherAct(r.text),
            definesATerm: citesADefinition(r.text, finding.definingWords ?? finding.quote),
            inheritsAPower: inheritsAPower(r.text, finding.quote),
            citation: citationUrl(r.doc_url, r.anchor, { page: r.page, mediaType: r.media_type }),
            // What this economy says an instrument of that kind can do. The live run reads it from
            // the profile and this rebuild did not, so a guideline that binds nobody was counted
            // here and discounted there -- one cell, and the only one the two paths disagreed on.
            ...(r.instrument_status ? { instrumentStatus: r.instrument_status } : {}),
            ...bindingnessFor(cell.economy_code, r.instrument_kind),
            // The second reading's verdict, from the same set the live run scored against. Without
            // it this rebuild answers a different question from the one it is checking.
            ...confirmedFlag(confirmations.verdict(r.section_id, finding.indicatorId, finding.measure)),
          });
        }
      }
      pillarCache.set(key, evidence);
    }

    const frameworkEvidence: FrameworkEvidence[] = (frameworkFor.all(cell.id) as {
      instrument_id: number; establishes_framework: number; framework_shown: number | null;
      horizontal: number | null;
      dedicated: number | null; dedicated_shown: number | null; sectoral_shown: number | null;
      sector: string | null; quote: string | null; title: string; source_url: string;
      kind: InstrumentType['kind'] | null;
    }[]).map((f) => ({
      instrumentId: f.instrument_id,
      instrumentTitle: f.title,
      citation: f.source_url,
      establishesFramework: f.establishes_framework === 1,
      frameworkShown: f.framework_shown === null ? null : f.framework_shown === 1,
      horizontal: f.horizontal === 1,
      dedicated: f.dedicated === 1,
      dedicatedShown: f.dedicated_shown === 1,
      sectoralShown: f.sectoral_shown === 1,
      sector: f.sector,
      bindingness: f.kind ? bindingnessFor(cell.economy_code, f.kind).bindingness ?? null : null,
      quote: f.quote ?? '',
    }));

    const surfaced = surfacedFor.all(cell.id) as SurfacedInstrument[];
    for (const s of surfaced) s.currentTo = currentTo.get(s.instrumentId) ?? null;

    return decide({
      indicator,
      economy: cell.economy_code,
      evidence,
      frameworkEvidence,
      surfaced,
      // The register's verdict as the run had it. Re-deriving against today's register would be
      // re-running the shortlist rather than checking the score.
      governing: parseGoverning(cell.governing),
      coverage: {
        sectionsRead: cell.sections_read ?? 0,
        sectionsIndexed: cell.sections_indexed ?? 0,
        instrumentsConsidered: cell.surfaced ?? 0,
      },
      rates,
    });
  };

  return { cells, rebuild };
}
