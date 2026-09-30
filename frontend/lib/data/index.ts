/**
 * Every read the interface makes goes through this module. It reads the working store
 * directly, and falls back to the checked-in snapshot when there is no database yet.
 */
import "server-only";
import cellsJson from "./fixtures/cells.json";
import economiesJson from "./fixtures/economies.json";
import exportRowsJson from "./fixtures/export-rows.json";
import rubricJson from "./fixtures/rubric.json";
import runEventsJson from "./fixtures/run-events.json";
import runsJson from "./fixtures/runs.json";
import {
  liveCells,
  liveEconomies,
  liveExportRows,
  liveRubric,
  liveRunEvents,
  liveRuns,
  liveVerdicts,
} from "./store";
import type { ReviewDecision } from "@/lib/review";
import { clip, pillarsAsked } from "@/lib/format";
import type {
  Cell,
  CoverageCell,
  Economy,
  ExportRow,
  Indicator,
  QueueItem,
  QueueRun,
  PillarMean,
  PillarScores,
  IndicatorScores,
  Scoreboard,
  CellDetail,
  EconomyIndicatorRow,
  EconomyPillar,
  EconomyScores,
  Rubric,
  Run,
  RunEvent,
} from "./types";

// The live store where there is a database, and the checked-in snapshot where there is not,
// so a fresh clone still renders something before its first run.
const rubric = (): Rubric => (liveRubric() ?? rubricJson) as unknown as Rubric;
const economies = (): Economy[] => (liveEconomies() ?? economiesJson) as unknown as Economy[];
const cells = (): Cell[] => (liveCells() ?? cellsJson) as unknown as Cell[];
const exportRows = (): ExportRow[] => (liveExportRows() ?? exportRowsJson) as unknown as ExportRow[];
const runs = (): Run[] => (liveRuns() ?? runsJson) as unknown as Run[];
const runEvents = (): RunEvent[] => (liveRunEvents() ?? runEventsJson) as unknown as RunEvent[];

/** Every verdict ever recorded, oldest first. The newest on a row is the one that stands. */
export function getVerdicts(): ReviewDecision[] {
  return liveVerdicts() as unknown as ReviewDecision[];
}

export function getVerdict(rowId: number): ReviewDecision | undefined {
  return [...getVerdicts()].reverse().find((v) => v.rowId === rowId);
}

export function getRubric(): Rubric {
  return rubric();
}

export function getIndicator(id: string): Indicator | undefined {
  return rubric().indicators.find((i) => i.id === id);
}

export function getEconomies(): Economy[] {
  return economies();
}

export function getEconomy(code: string): Economy | undefined {
  return economies().find((e) => e.code === code.toUpperCase());
}

export function getRuns(): Run[] {
  return runs();
}

export function getRun(id: string): Run | undefined {
  return runs().find((r) => r.id === id);
}

export function getRunEvents(runId: string): RunEvent[] {
  return runEvents().filter((e) => e.runId === runId);
}

/**
 * The answer that counts for one economy and indicator: the newest complete run.
 * A run still going or failed never contributes a score.
 */
export function getCurrentCells(): Cell[] {
  const best = new Map<string, Cell>();
  for (const c of cells()) {
    if (c.runStatus !== "complete") continue;
    const key = `${c.economy}:${c.indicatorId}`;
    const held = best.get(key);
    if (!held || c.runStartedAt > held.runStartedAt) best.set(key, c);
  }
  return [...best.values()];
}

/** Every earlier answer for the same economy and indicator, newest first. */
export function getCellHistory(economy: string, indicatorId: string): Cell[] {
  return cells()
    .filter((c) => c.economy === economy && c.indicatorId === indicatorId)
    .sort((a, b) => b.runStartedAt.localeCompare(a.runStartedAt));
}

export function getCell(economy: string, indicatorId: string): Cell | undefined {
  return getCurrentCells().find(
    (c) => c.economy === economy && c.indicatorId === indicatorId,
  );
}

/**
 * All 61 indicators against every economy, including the pairs nothing has
 * attempted. The untouched ones are most of the grid and are the point of it.
 */
export function getCoverage(): CoverageCell[] {
  const current = getCurrentCells();
  const out: CoverageCell[] = [];
  for (const economy of economies()) {
    for (const indicator of rubric().indicators) {
      const cell = current.find(
        (c) => c.economy === economy.code && c.indicatorId === indicator.id,
      );
      out.push({
        economy: economy.code,
        indicatorId: indicator.id,
        pillarId: indicator.pillarId,
        state: cell?.state ?? "not-attempted",
        score: cell?.score ?? null,
        cell: cell ?? null,
      });
    }
  }
  return out;
}

export function getExportRows(): ExportRow[] {
  return exportRows();
}

export function getExportRow(id: number): ExportRow | undefined {
  return exportRows().find((r) => r.id === id);
}

/** Rows a reviewer still has to look at, failed gates first. */
/**
 * Every row, a run at a time and the newest run first, so the queue can fold each run into a
 * block and j and k walk the blocks in the order they are shown. Inside a run, rows a check
 * failed come first. Several runs over the same economy produce much the same rows; kept in
 * one flat list they read as duplicates.
 */
export function getReviewQueue(): ExportRow[] {
  const failed = (r: ExportRow) => r.gates.filter((g) => !g.passed).length;
  const started = new Map(runs().map((r) => [r.id, r.startedAt]));
  const when = (r: ExportRow) => started.get(r.runId) ?? "";
  return [...exportRows()].sort(
    (a, b) =>
      when(b).localeCompare(when(a)) ||
      b.runId.localeCompare(a.runId) ||
      failed(b) - failed(a) ||
      a.economy.localeCompare(b.economy) ||
      compareIndicatorIds(a.indicatorId, b.indicatorId) ||
      a.id - b.id,
  );
}

/** "10.1" sorts after "6.2", which a plain string comparison gets backwards. */
export function compareIndicatorIds(a: string, b: string): number {
  const [ap, ai] = a.split(".").map(Number);
  const [bp, bi] = b.split(".").map(Number);
  return ap - bp || ai - bi;
}

/** The list the queue rail renders: enough to choose a finding, and nothing more. */
export function getQueueItems(): QueueItem[] {
  const names = new Map(economies().map((e) => [e.code, e.name]));
  const categories = new Map(rubric().indicators.map((i) => [i.id, i.category]));
  const latest = new Map(getVerdicts().map((v) => [v.rowId, v]));
  const byRun = new Map(runs().map((r) => [r.id, r]));
  const runOf = (id: string): QueueRun => {
    const run = byRun.get(id);
    return {
      id,
      startedAt: run?.startedAt ?? null,
      when: run
        ? new Date(run.startedAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : `Run ${id.slice(0, 8)}`,
      economies: run ? run.economies.map((c) => names.get(c) ?? c).join(", ") : "",
      pillars: run ? pillarsAsked(run.pillars) : "",
      model: run?.model ?? null,
    };
  };
  return getReviewQueue().map((r) => ({
    id: r.id,
    economy: r.economy,
    economyName: names.get(r.economy) ?? r.economy,
    indicatorId: r.indicatorId,
    category: categories.get(r.indicatorId) ?? "",
    lawName: r.lawName,
    article: r.article,
    state: r.state,
    score: r.score,
    hasQuote: r.quoteCharStart !== null,
    failedGates: r.gates.filter((g) => !g.passed).length,
    verdict: latest.get(r.id)?.action ?? null,
    quote: r.verbatimSnippet?.trim() ? clip(r.verbatimSnippet.trim(), 80) : null,
    run: runOf(r.runId),
  }));
}

/**
 * Scores per economy, per pillar and per indicator. A pillar mean is withheld until
 * every indicator in it is answered, and the overall figure averages only those pillars.
 */
export function getScoreboard(): Scoreboard {
  const current = getCurrentCells();
  const at = new Map(current.map((c) => [`${c.economy}:${c.indicatorId}`, c]));
  const codes = economies().map((e) => ({ code: e.code, name: e.name }));
  const byId = new Map(rubric().indicators.map((i) => [i.id, i]));

  const pillars: PillarScores[] = rubric().pillars.map((p) => {
    const indicators: IndicatorScores[] = p.indicatorIds.map((id) => {
      const indicator = byId.get(id);
      return {
        indicatorId: id,
        category: indicator?.category ?? "",
        exception: indicator?.exception ?? null,
        bands: [...new Set(indicator?.bands.map((b) => b.score) ?? [])].sort((a, b) => a - b),
        marks: codes.map(({ code }) => {
          const cell = at.get(`${code}:${id}`);
          return { economy: code, state: cell?.state ?? "not-attempted", score: cell?.score ?? null };
        }),
      };
    });

    const means: PillarMean[] = codes.map(({ code }) => {
      const scores = p.indicatorIds
        .map((id) => at.get(`${code}:${id}`)?.score)
        .filter((s): s is number => s !== undefined && s !== null);
      return {
        economy: code,
        answered: scores.length,
        mean:
          scores.length === p.indicatorIds.length
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : null,
      };
    });

    const answered = indicators.filter((i) =>
      i.marks.some((m) => m.state !== "not-attempted"),
    ).length;
    return { id: p.id, name: p.name, total: p.indicatorIds.length, answered, means, indicators };
  });

  const complete = pillars.filter((p) => p.means.every((m) => m.mean !== null));
  const overall = codes.map(({ code }) => {
    const means = complete
      .map((p) => p.means.find((m) => m.economy === code)?.mean)
      .filter((m): m is number => m !== null && m !== undefined);
    return {
      economy: code,
      pillars: means.length,
      mean: means.length ? means.reduce((a, b) => a + b, 0) / means.length : null,
    };
  });

  return {
    economies: codes,
    pillars,
    overall,
    pillarsComplete: complete.length,
    indicatorsTotal: rubric().indicators.length,
    answeredTotal: new Set(current.map((c) => c.indicatorId)).size,
  };
}

/** Runs repeat each other. The same provision quoted the same way is one finding. */
function dedupeRows(rows: ExportRow[]): ExportRow[] {
  const seen = new Map<string, ExportRow>();
  for (const r of [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = `${r.lawName}|${r.article ?? ""}|${r.verbatimSnippet ?? ""}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

/** Everything one economy and indicator has to say: the answer, its evidence, its history. */
export function getCellDetail(economy: string, indicatorId: string): CellDetail | null {
  const eco = getEconomy(economy);
  const indicator = getIndicator(indicatorId);
  if (!eco || !indicator) return null;
  const history = getCellHistory(eco.code, indicatorId);
  const current = getCell(eco.code, indicatorId) ?? null;
  const mine = current ? exportRows().filter((r) => r.cellId === current.id) : [];
  const older = new Set(history.filter((c) => c.id !== current?.id).map((c) => c.id));
  return {
    economy: eco,
    indicator,
    current,
    history: history.filter((c) => c.id !== current?.id),
    rows: mine,
    priorRows: mine.length ? [] : dedupeRows(exportRows().filter((r) => older.has(r.cellId))),
  };
}

/** One economy against the whole rubric(), pillar by pillar. */
export function getEconomyScores(code: string): EconomyScores | null {
  const eco = getEconomy(code);
  if (!eco) return null;
  const at = new Map(
    getCurrentCells()
      .filter((c) => c.economy === eco.code)
      .map((c) => [c.indicatorId, c]),
  );
  const byId = new Map(rubric().indicators.map((i) => [i.id, i]));

  const pillars: EconomyPillar[] = rubric().pillars.map((p) => {
    const indicators: EconomyIndicatorRow[] = p.indicatorIds.map((id) => {
      const cell = at.get(id);
      return {
        indicatorId: id,
        category: byId.get(id)?.category ?? "",
        state: cell?.state ?? "not-attempted",
        score: cell?.score ?? null,
        bandCriterion: cell?.bandCriterion ?? null,
        instrument: cell?.controllingInstrument ?? null,
        instrumentUrl: cell?.controllingInstrumentUrl ?? null,
        answeredAt: cell?.answeredAt ?? null,
        unresolvedReason: cell?.unresolvedReason ?? null,
      };
    });
    const scores = indicators.map((i) => i.score).filter((s): s is number => s !== null);
    return {
      id: p.id,
      name: p.name,
      total: p.indicatorIds.length,
      answered: indicators.filter((i) => i.state !== "not-attempted").length,
      mean:
        scores.length === p.indicatorIds.length
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null,
      indicators,
    };
  });

  const complete = pillars.filter((p) => p.mean !== null);
  return {
    economy: eco,
    overall: complete.length
      ? complete.reduce((a, p) => a + (p.mean ?? 0), 0) / complete.length
      : null,
    pillarsComplete: complete.length,
    pillarsTotal: pillars.length,
    answered: at.size,
    indicatorsTotal: rubric().indicators.length,
    pillars,
  };
}
