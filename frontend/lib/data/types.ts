/**
 * The shapes the interface reads. These mirror the backend tables one for one, so
 * swapping the fixtures for HTTP routes later changes the loader and nothing else.
 */

export type CellState = "restricted" | "no-restriction" | "unresolved";

/** Not a database state. A cell nothing has attempted yet, which is most of them. */
export type CoverageState = CellState | "not-attempted";

export type IndicatorShape = "provision" | "framework" | "practice";

export interface ScoreBand {
  score: number;
  criterion: string;
  ordinal: number;
}

export interface Indicator {
  id: string;
  pillarId: number;
  pillarName: string;
  category: string;
  exception: string | null;
  criteriaText: string;
  bands: ScoreBand[];
  shape: IndicatorShape;
  shapeBasis: string;
  provenance: { document: string; locator: string };
}

export interface Pillar {
  id: number;
  name: string;
  indicatorIds: string[];
}

export interface Rubric {
  version: string;
  derivedAt: string;
  pillars: Pillar[];
  indicators: Indicator[];
  nonRegulatory: string[];
  sources: { document: string; locator: string }[];
}

export interface Corpus {
  instruments: number;
  documents: number;
  sections: number;
  embedded: number;
  unread: { reason: string; count: number }[];
}

export interface Economy {
  code: string;
  name: string;
  legalSystem: { family: string; note: string };
  officialLanguages: string[];
  languageNote?: string;
  portals: { name: string; url: string; kind: string; authority?: string }[];
  commitments?: { name: string; status?: string; sourceUrl?: string }[];
  notes?: string;
  corpus: Corpus;
}

export interface Cell {
  id: number;
  runId: string;
  economy: string;
  indicatorId: string;
  state: CellState;
  unresolvedReason: string | null;
  answeredAt: string | null;
  queries: string[];
  depth: number | null;
  surfaced: number | null;
  sectionsIndexed: number | null;
  sectionsRead: number | null;
  score: number | null;
  bandOrdinal: number | null;
  bandCriterion: string | null;
  decidingFact: string | null;
  rationale: string | null;
  computedAt: string | null;
  controllingInstrumentId: number | null;
  controllingInstrument: string | null;
  controllingInstrumentUrl: string | null;
  runStartedAt: string;
  runStatus: RunStatus;
  engine: string;
  model: string;
  sourceMode: "fetch" | "cache-only";
}

export interface Gate {
  gate: string;
  passed: boolean;
  detail: string | null;
}

/** The window of document text around a citation, with the quote rebased onto it. */
export interface QuoteContext {
  text: string;
  offset: number;
  quoteStart: number;
  quoteEnd: number;
  truncatedStart: boolean;
  truncatedEnd: boolean;
}

export interface ReadingAttribute {
  indicatorId?: string;
  measure?: string;
  quote?: string;
  dutyBearer?: string;
  dutyAct?: string;
  requirement?: string;
  sectorScope?: string;
  sector?: string | null;
  dataScope?: string;
  mandatory?: boolean;
  statedPeriod?: string | null;
  [key: string]: unknown;
}

export interface ExportRow {
  id: number;
  cellId: number;
  runId: string;
  economy: string;
  indicatorId: string;
  state: CellState;
  lawName: string;
  lawNumberRef: string | null;
  lastAmended: string | null;
  article: string | null;
  discoveryTag: "NEW" | "KNOWN" | null;
  locationReference: string | null;
  verbatimSnippet: string | null;
  quoteCharStart: number | null;
  quoteCharEnd: number | null;
  mappingRationale: string | null;
  sourceUrl: string | null;
  confidence: string | null;
  notes: string | null;
  languageOfSource: string | null;
  sectionId: number | null;
  readingId: number | null;
  createdAt: string;
  score: number | null;
  bandOrdinal: number | null;
  bandCriterion: string | null;
  decidingFact: string | null;
  headingPath: string | null;
  sectionLabel: string | null;
  anchor: string | null;
  page: number | null;
  instrumentId: number | null;
  instrumentKind: string | null;
  instrumentStatus: string | null;
  statusBasis: string | null;
  commencedOn: string | null;
  lastAmendedOn: string | null;
  timeframeBasis: string | null;
  officialNumber: string | null;
  instrumentLanguage: string | null;
  extraction: string | null;
  applies: number | null;
  readingQuote: string | null;
  subclause: string | null;
  attributes: ReadingAttribute[];
  reasoning: string | null;
  engine: string | null;
  model: string | null;
  sectionText: string | null;
  context: QuoteContext | null;
  gates: Gate[];
}

export type RunStatus = "running" | "complete" | "failed" | "cancelled";

export interface Run {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  economies: string[];
  pillars: number[] | "all";
  engine: string;
  model: string;
  sourceMode: "fetch" | "cache-only";
  codeRevision: string;
  rubricDerivedAt: string;
  status: RunStatus;
  notes: string | null;
  cells: number;
  rows: number;
  usd: number;
  calls: number;
  tokens: number;
  wallSeconds: number;
  stages: { stage: string; seconds: number; items: number | null }[];
}

export interface RunEvent {
  id: number;
  runId: string;
  at: string;
  economy: string | null;
  pillarId: number | null;
  indicatorId: string | null;
  stage: string;
  kind: "started" | "finished" | "refused" | "failed";
  subject: string | null;
  detail: string | null;
  seconds: number | null;
  done: number | null;
  total: number | null;
}

/** One economy against one indicator, as the coverage grid sees it. */
export interface CoverageCell {
  economy: string;
  indicatorId: string;
  pillarId: number;
  state: CoverageState;
  score: number | null;
  cell: Cell | null;
}
