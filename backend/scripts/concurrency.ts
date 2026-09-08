/**
 * Does reading several provisions at once change the answers, and does it save any time.
 *
 *   npm run -w backend concurrency -- --economy SGP --pillar 6 --sections 40
 *
 * The question is determinism first and speed second. A faster run that reads the same statute
 * differently is not a faster run, it is a different system, and no timing makes that acceptable.
 *
 * The measurement this replaces was confounded: it asked for concurrency 4 against a server
 * configured for 2, and uncapped generations meant one runaway call could swamp a pass. Both are
 * fixed here -- the cap is in the engine now, and the levels tested are declared.
 */
import { openDb } from '../src/db/index.js';
import { readSection, type SectionReading } from '../src/read/index.js';
import { indicatorsOfPillar, pillar } from '../src/rubric/index.js';
import { haveModel, OllamaUnavailable, READING_MODEL } from '../src/engines/ollama.js';

interface Args {
  economy: string;
  pillar: number;
  sections: number;
  levels: number[];
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  return {
    economy: (get('economy') ?? 'SGP').toUpperCase(),
    pillar: Number(get('pillar') ?? 6),
    sections: Number(get('sections') ?? 40),
    levels: (get('levels') ?? '1,1,2').split(',').map((n) => Number(n.trim())),
  };
}

async function inPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/** What a provision was found to say, in a form two passes can be compared on. */
function answerOf(r: SectionReading): string {
  if (r.failure) return 'REFUSED';
  const findings = r.findings
    .map((f) => [f.indicatorId, f.measure ?? '', f.quote, f.sectorScope, f.dataScope].join('|'))
    .sort();
  return JSON.stringify(findings);
}

interface Pass {
  level: number;
  seconds: number;
  answers: Map<number, string>;
  refused: number;
  tokens: number;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const model = READING_MODEL;
  if (!(await haveModel(model))) {
    console.error(`\n${model} is not installed. Run: ollama pull ${model}\n`);
    process.exit(1);
  }

  const db = openDb();
  const indicators = indicatorsOfPillar(args.pillar);

  // The provisions a real run of this pillar actually read, so the mix of lengths is the one the
  // pipeline meets rather than one chosen to flatter a level.
  const rows = db
    .prepare(
      `SELECT DISTINCT s.id, s.text, s.heading_path, i.title
         FROM reading r
         JOIN cell c ON c.id = r.cell_id
         JOIN section s ON s.id = r.section_id
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE c.economy_code = ? AND c.indicator_id LIKE ?
        ORDER BY s.id LIMIT ?`,
    )
    .all(args.economy, `${args.pillar}.%`, args.sections) as {
    id: number;
    text: string;
    heading_path: string;
    title: string;
  }[];

  if (rows.length === 0) {
    console.error(`No previously read provisions for ${args.economy} pillar ${args.pillar}.`);
    process.exit(1);
  }

  const inputs = rows.map((r) => ({
    sectionId: r.id,
    instrumentTitle: r.title,
    headingPath: r.heading_path,
    text: r.text,
  }));

  console.log(`${inputs.length} provision(s), ${args.economy} pillar ${args.pillar}, ${model}`);
  console.log(`levels: ${args.levels.join(', ')}   (OLLAMA_NUM_PARALLEL governs what the server allows)\n`);

  const passes: Pass[] = [];

  for (const level of args.levels) {
    const started = Date.now();
    const readings = await inPool(inputs, level, (input) =>
      readSection(input, args.pillar, pillar(args.pillar).name, indicators),
    );
    const seconds = (Date.now() - started) / 1000;
    const tokens = readings.reduce((n, r) => n + r.completionTokens, 0);
    passes.push({
      level,
      seconds,
      answers: new Map(readings.map((r) => [r.sectionId, answerOf(r)])),
      refused: readings.filter((r) => r.failure !== null).length,
      tokens,
    });
    console.log(
      `  concurrency ${level}: ${seconds.toFixed(0)}s ` +
        `(${(seconds / inputs.length).toFixed(1)}s per provision, ` +
        `${(tokens / seconds).toFixed(0)} tokens/s), ${passes.at(-1)!.refused} refused`,
    );
  }

  // The first pass is the reference. A second pass at the same level is the control: whatever it
  // disagrees on is disagreement the engine produces on its own, at any concurrency.
  const reference = passes[0]!;
  console.log('\n=== Did the answers change ===\n');
  for (const p of passes.slice(1)) {
    const differing = [...reference.answers.entries()].filter(([id, a]) => p.answers.get(id) !== a);
    const control = p.level === reference.level ? '   (control: same level as the reference)' : '';
    console.log(
      `  concurrency ${p.level}: ${differing.length} of ${inputs.length} provision(s) read differently${control}`,
    );
    for (const [id, was] of differing.slice(0, 5)) {
      const row = rows.find((r) => r.id === id)!;
      console.log(`    section ${id}: ${row.title} :: ${row.heading_path}`);
      // A lost finding and a reworded one are different failures, so print both sides.
      console.log(`      reference: ${was}`);
      console.log(`      this pass: ${p.answers.get(id) ?? 'MISSING'}`);
    }
    if (differing.length > 5) console.log(`    ... and ${differing.length - 5} more`);
  }

  console.log('\n=== What it bought ===\n');
  for (const p of passes) {
    console.log(
      `  concurrency ${p.level}: ${p.seconds.toFixed(0)}s, ${(reference.seconds / p.seconds).toFixed(2)}x the reference`,
    );
  }
  console.log('\n  Determinism is the gate. A level that reads any provision differently does not');
  console.log('  ship, whatever it did to the clock.');
}

main().catch((err: unknown) => {
  if (err instanceof OllamaUnavailable) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
});
