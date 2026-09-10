/**
 * The rubric read as a book: the pillars, the indicators under them, and each band
 * with whatever the runs have settled against it. Pure, so the page can be tested.
 */
import type { Cell, CellState, IndicatorShape, Rubric } from "@/lib/data/types";

export interface Standing {
  economy: string;
  state: CellState;
}

export interface BookBand {
  ordinal: number;
  score: number;
  /** ESCAP's wording. Never edited, never clipped. */
  criterion: string;
  met: Standing[];
}

export interface Unsettled {
  economy: string;
  reason: string | null;
}

export interface BookIndicator {
  id: string;
  pillarId: number;
  pillarName: string;
  category: string;
  exception: string | null;
  bands: BookBand[];
  shape: IndicatorShape;
  /** Set only where the indicator is not answered by pointing at a provision. */
  shapeNote: string | null;
  shapeBasis: string;
  /** "Methodology sheet, row 31". The document itself is named once, on the page. */
  row: string;
  unsettled: Unsettled[];
  answered: number;
}

export interface BookPillar {
  id: number;
  name: string;
  indicators: BookIndicator[];
  answered: number;
}

export interface Book {
  version: string;
  derivedAt: string;
  pillars: BookPillar[];
  indicators: number;
  answered: number;
  /** The indicators ESCAP declares non-regulatory, which no extraction tool answers. */
  excluded: string[];
  sources: { document: string; locator: string }[];
}

const SHAPE_NOTE: Record<IndicatorShape, string | null> = {
  provision: null,
  framework: "Answered once for the whole economy. No single provision can evidence it.",
  practice: "Answered from what is observed, so official reports stand as evidence.",
};

/** The sheet says the same thing on every row, so only the row number is worth repeating. */
export function rowOf(locator: string): string {
  const m = /row\s+(\d+)/i.exec(locator);
  return m ? `Methodology sheet, row ${m[1]}` : locator;
}

export function readBook(rubric: Rubric, cells: Cell[]): Book {
  const settled = new Map<string, Cell[]>();
  for (const c of cells) {
    settled.set(c.indicatorId, [...(settled.get(c.indicatorId) ?? []), c]);
  }
  const byId = new Map(rubric.indicators.map((i) => [i.id, i]));

  const pillars: BookPillar[] = rubric.pillars.map((p) => {
    const indicators = p.indicatorIds.flatMap((id): BookIndicator[] => {
      const indicator = byId.get(id);
      if (!indicator) return [];
      const against = settled.get(id) ?? [];

      const bands: BookBand[] = indicator.bands.map((b) => ({
        ordinal: b.ordinal,
        score: b.score,
        criterion: b.criterion,
        met: against
          .filter((c) => c.bandOrdinal === b.ordinal)
          .map((c) => ({ economy: c.economy, state: c.state })),
      }));

      return [
        {
          id: indicator.id,
          pillarId: p.id,
          pillarName: p.name,
          category: indicator.category,
          exception: indicator.exception,
          bands,
          shape: indicator.shape,
          shapeNote: SHAPE_NOTE[indicator.shape],
          shapeBasis: indicator.shapeBasis,
          row: rowOf(indicator.provenance.locator),
          unsettled: against
            .filter((c) => c.bandOrdinal === null)
            .map((c) => ({ economy: c.economy, reason: c.unresolvedReason })),
          answered: against.length,
        },
      ];
    });

    return {
      id: p.id,
      name: p.name,
      indicators,
      answered: indicators.filter((i) => i.answered > 0).length,
    };
  });

  return {
    version: rubric.version,
    derivedAt: rubric.derivedAt,
    pillars,
    indicators: rubric.indicators.length,
    answered: pillars.reduce((n, p) => n + p.answered, 0),
    excluded: rubric.nonRegulatory,
    sources: rubric.sources,
  };
}

/** An indicator number, or a phrase in the question, the criteria or the carve-out. */
export function matches(indicator: BookIndicator, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  if (/^[\d.]+$/.test(q)) return indicator.id.startsWith(q);

  const haystack = [
    indicator.id,
    indicator.category,
    indicator.pillarName,
    indicator.exception ?? "",
    ...indicator.bands.map((b) => b.criterion),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
