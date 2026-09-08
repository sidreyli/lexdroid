/**
 * What is happening, said while it happens.
 *
 * The run record answers "what did we find" after the run. This answers "what is it doing" during
 * one, and the two are not the same question. Thirty-one reading calls wrote until the context
 * window was physically full -- four to nine minutes each, returning nothing -- and no run said a
 * word about any of them until its pillar finished, because nothing was durable before then.
 *
 * The type lives apart from the run recorder so the pipeline can emit without importing it. A
 * stage announces what it is doing; the driver decides whether that goes to a terminal, to the
 * ledger, or to a browser.
 */

/** The stage an event came from. 'run' is the run itself opening, finishing or failing. */
export type EventStage = 'run' | 'retrieve' | 'read' | 'framework' | 'decide' | 'record';

/**
 * A refusal is the engine declining to produce a reading, on one provision, and the run carries on.
 * A failure is the run itself. Both are recorded; neither is ever silent.
 */
export type EventKind = 'started' | 'finished' | 'refused' | 'failed';

export interface RunEvent {
  stage: EventStage;
  kind: EventKind;
  economy?: string;
  pillarId?: number;
  indicatorId?: string;
  /** The provision, instrument or query this is about. */
  subject?: string;
  detail?: string;
  seconds?: number;
  /** Progress through the stage, so a watcher says "reading 41 of 150" rather than "reading". */
  done?: number;
  total?: number;
  promptTokens?: number;
  outputTokens?: number;
}

/** Where a stage sends its events. Nothing in the pipeline knows what is on the other end. */
export type Emit = (event: RunEvent) => void;

/** One line a person can read. The same event goes to the ledger unabbreviated. */
export function describe(e: RunEvent): string {
  if (e.stage === 'run') return `run ${e.kind}${e.detail ? `: ${e.detail}` : ''}`;

  const where = e.indicatorId ?? (e.pillarId ? `pillar ${e.pillarId}` : e.stage);
  // A count only where there is one. "0/62 started" reads as progress that has stalled at zero.
  const progress =
    e.done !== undefined && e.total ? ` ${e.done}/${e.total}` : e.total ? ` (${e.total})` : '';
  const took = e.seconds ? ` in ${e.seconds.toFixed(1)}s` : '';
  const tokens = e.outputTokens ? ` (${e.outputTokens} tokens)` : '';

  if (e.kind === 'refused') return `  ${where}${progress} REFUSED ${e.subject ?? ''} -- ${e.detail ?? ''}`;
  if (e.kind === 'failed') return `  ${where} FAILED -- ${e.detail ?? ''}`;
  return `  ${where}${progress} ${e.stage} ${e.kind}${e.subject ? `: ${e.subject}` : ''}${took}${tokens}`;
}
