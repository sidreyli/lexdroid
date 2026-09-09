/**
 * Every read the interface makes goes through this module. It serves a snapshot of
 * the working store today; the backend routes it stands in for are in docs/api-contract.md.
 */
import "server-only";
import cellsJson from "./fixtures/cells.json";
import economiesJson from "./fixtures/economies.json";
import exportRowsJson from "./fixtures/export-rows.json";
import rubricJson from "./fixtures/rubric.json";
import runEventsJson from "./fixtures/run-events.json";
import runsJson from "./fixtures/runs.json";
import type {
  Cell,
  CoverageCell,
  Economy,
  ExportRow,
  Indicator,
  Rubric,
  Run,
  RunEvent,
} from "./types";

const rubric = rubricJson as unknown as Rubric;
const economies = economiesJson as unknown as Economy[];
const cells = cellsJson as unknown as Cell[];
const exportRows = exportRowsJson as unknown as ExportRow[];
const runs = runsJson as unknown as Run[];
const runEvents = runEventsJson as unknown as RunEvent[];

export function getRubric(): Rubric {
  return rubric;
}

export function getIndicator(id: string): Indicator | undefined {
  return rubric.indicators.find((i) => i.id === id);
}

export function getEconomies(): Economy[] {
  return economies;
}

export function getEconomy(code: string): Economy | undefined {
  return economies.find((e) => e.code === code.toUpperCase());
}

export function getRuns(): Run[] {
  return runs;
}

export function getRun(id: string): Run | undefined {
  return runs.find((r) => r.id === id);
}

export function getRunEvents(runId: string): RunEvent[] {
  return runEvents.filter((e) => e.runId === runId);
}

/**
 * The answer that counts for one economy and indicator: the newest complete run.
 * A run still going or failed never contributes a score.
 */
export function getCurrentCells(): Cell[] {
  const best = new Map<string, Cell>();
  for (const c of cells) {
    if (c.runStatus !== "complete") continue;
    const key = `${c.economy}:${c.indicatorId}`;
    const held = best.get(key);
    if (!held || c.runStartedAt > held.runStartedAt) best.set(key, c);
  }
  return [...best.values()];
}

/** Every earlier answer for the same economy and indicator, newest first. */
export function getCellHistory(economy: string, indicatorId: string): Cell[] {
  return cells
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
  for (const economy of economies) {
    for (const indicator of rubric.indicators) {
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
  return exportRows;
}

export function getExportRow(id: number): ExportRow | undefined {
  return exportRows.find((r) => r.id === id);
}

/** Rows a reviewer still has to look at, failed gates first. */
export function getReviewQueue(): ExportRow[] {
  const failed = (r: ExportRow) => r.gates.filter((g) => !g.passed).length;
  return [...exportRows].sort(
    (a, b) => failed(b) - failed(a) || a.economy.localeCompare(b.economy) || a.id - b.id,
  );
}
