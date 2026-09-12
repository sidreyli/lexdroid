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

/** Every engine in the pool has gone. The run cannot read, and must say so rather than find nothing. */
export class NoEnginesLeft extends OllamaUnavailable {
  constructor(readonly retired: string[]) {
    super(`all ${retired.length} engine(s) retired: ${retired.join(', ')}`, retired[0] ?? 'no engine');
    this.name = 'NoEnginesLeft';
  }
}
