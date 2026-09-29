/**
 * What it means for an engine to be gone.
 *
 * Separate from the client because the pool raises these too, and a pool that imported the client
 * that imports the pool would be a cycle. Every caller that already handles an absent engine keeps
 * working: running out of engines is a kind of engine being unavailable, not a new thing to catch.
 */
export class OllamaUnavailable extends Error {
  constructor(detail: string, readonly host: string) {
    super(`Ollama is not answering at ${host}: ${detail}` + '\n  Start it, or set OLLAMA_HOST.');
    this.name = 'OllamaUnavailable';
  }
}

/**
 * The engine took the request and has held it far past what the request needs.
 *
 * A rented engine's proxy keeps the connection alive with spaces while it waits, so a stuck engine
 * never trips a timeout: Mongolia's pillar 8 waited thirty minutes, twice, on one batch of questions
 * to embed, and the pillar was lost both times. Waiting on the same engine again would only queue
 * behind the stuck request, so this is not retried there; it is handed to another engine.
 */
export class EngineUnresponsive extends OllamaUnavailable {
  constructor(host: string, seconds: number) {
    super(`held the request ${seconds}s without answering`, host);
    this.name = 'EngineUnresponsive';
  }
}

/** Every engine in the pool has gone. The run cannot read, and must say so rather than find nothing. */
export class NoEnginesLeft extends OllamaUnavailable {
  constructor(readonly retired: string[]) {
    super(`all ${retired.length} engine(s) retired: ${retired.join(', ')}`, retired[0] ?? 'no engine');
    this.name = 'NoEnginesLeft';
  }
}
