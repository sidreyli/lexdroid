/**
 * Does this engine actually answer, and answer in the shape the pipeline needs?
 *
 *   npm run -w backend engine-check -- --engine engine-b
 *   npm run -w backend engine-check                       both declared engines
 *
 * A declaration in engines.json is a promise. ESCAP freezes it on 30 September and an incomplete
 * Section 5 cannot be corrected afterwards, so the promise has to be checked before then rather
 * than on 15 October in front of the judges.
 *
 * Four questions, because an engine can fail any one of them while passing the others:
 *
 *   reachable   the host answers at all, with the model it was declared as
 *   structured  it returns JSON matching a declared schema, which every reading depends on
 *   quoted      the words it copied are actually in the provision
 *   legal       the figure it reports is the one those words state
 *
 * The last two are the ones a status endpoint cannot tell you, and they are asked in that order
 * for a reason. Asked for the retention period as a bare number, Engine A answered ten years on a
 * provision that says five, twice, at temperature zero. Asked to copy the words first and then
 * read the number out of them, the same engine on the same provision answered five. That is the
 * whole of "keep source fragments, interpretations and scoring decisions separate", demonstrated
 * on one sentence -- and it is why this check asks in the order the reading stage asks.
 */
import { loadEnv } from '../src/env.js';
import { loadEngines, type Engine } from '../src/engines/registry.js';
import { hostedGenerate } from '../src/engines/hosted.js';
import { generate } from '../src/engines/ollama.js';

// Before anything reads process.env: the hosted key lives in .env, never in engines.json.
loadEnv();

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

/** A provision with one unmistakable duty in it, so a wrong answer is obviously wrong. */
const PROVISION =
  'No person shall carry on the business of providing a payment service in Singapore unless that ' +
  'person holds a licence granted by the Authority under section 6, and every licensee shall ' +
  'retain a record of each payment transaction for a period of not less than 5 years.';

const SCHEMA = {
  type: 'object',
  properties: {
    dutyBearer: { type: 'string', description: 'Who the provision binds.' },
    // Quote first, then the number read out of it. This is the order the reading stage asks in,
    // and the reason it asks that way: a figure with no quote behind it cannot be checked, and an
    // engine that invents one is indistinguishable from an engine that read correctly.
    periodWords: {
      type: ['string', 'null'],
      description: 'The provision\'s own words stating how long records are kept, copied exactly, or null.',
    },
    retentionYears: { type: ['number', 'null'], description: 'Years records must be kept, or null.' },
  },
  required: ['dutyBearer', 'periodWords', 'retentionYears'],
} as const;

const SYSTEM =
  'You read one legal provision and report what it requires. You copy the provision\'s own words ' +
  'and never summarise. You never assign a score.';

const PROMPT = [
  'Provision text:',
  '"""',
  PROVISION,
  '"""',
  '',
  'Who does this provision bind? Copy the words stating how long records must be kept, exactly as',
  'they appear above, and give the number of years those words state.',
].join('\n');

async function check(engine: Engine): Promise<boolean> {
  console.log(`\n${engine.label}: ${engine.provider} / ${engine.model}`);
  console.log(`  ${engine.hosted ? `hosted at ${engine.hosts[0]}` : `local at ${engine.hosts[0]}`}`);

  if (engine.hosted) {
    if (!process.env['LEXDROID_HOSTED_API_KEY']) {
      console.log('  LEXDROID_HOSTED_API_KEY is not set, so this engine cannot be reached.');
      console.log('  Set it in the environment and run this again. It is never written to a file.');
      return false;
    }
    process.env['LEXDROID_HOSTED_BASE_URL'] = engine.hosts[0] ?? '';
    process.env['LEXDROID_HOSTED_MODEL'] = engine.model;
    process.env['LEXDROID_HOSTED_PROVIDER'] = engine.provider;
  } else {
    delete process.env['LEXDROID_HOSTED_BASE_URL'];
    delete process.env['LEXDROID_HOSTED_MODEL'];
    process.env['OLLAMA_HOST'] = engine.hosts[0] ?? 'http://127.0.0.1:11434';
  }

  const started = Date.now();
  let text: string;
  try {
    // Through the same entry point the pipeline uses, not a bespoke request: an engine that works
    // only when checked by its own checker has not been checked.
    const answer = engine.hosted
      ? await hostedGenerate(PROMPT, SYSTEM, { schema: SCHEMA, maxOutputTokens: 512 })
      : await generate(PROMPT, SYSTEM, { schema: SCHEMA, model: engine.model, maxOutputTokens: 512 });
    text = answer.text;
    console.log(`  reachable    yes, in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.log(`  reachable    NO -- ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }

  let parsed: { dutyBearer?: unknown; periodWords?: unknown; retentionYears?: unknown };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    console.log(`  structured   NO -- did not return JSON: ${text.slice(0, 120)}`);
    return false;
  }
  const shaped =
    typeof parsed.dutyBearer === 'string' &&
    (typeof parsed.periodWords === 'string' || parsed.periodWords === null) &&
    (typeof parsed.retentionYears === 'number' || parsed.retentionYears === null);
  console.log(`  structured   ${shaped ? 'yes, matched the declared schema' : 'NO -- JSON, but not the declared shape'}`);
  if (!shaped) return false;

  // The substantive checks. Five years is in the provision and nowhere else, so an engine that
  // reads the page and produces a plausible number fails here having passed everything above.
  const quote = typeof parsed.periodWords === 'string' ? parsed.periodWords : null;
  const quoteInSource = quote !== null && PROVISION.toLowerCase().includes(quote.trim().toLowerCase());
  const rightYears = parsed.retentionYears === 5;
  const rightBearer = /licensee|person|provider/i.test(String(parsed.dutyBearer));

  console.log(`  quoted       ${quoteInSource ? 'words are in the provision' : `NOT IN SOURCE: "${quote ?? 'none given'}"`}`);
  console.log(
    `  legal        retention ${rightYears ? 'read correctly as 5 years' : `WRONG: ${String(parsed.retentionYears)}, the provision says 5`}`,
  );
  console.log(`               bound party: "${String(parsed.dutyBearer).slice(0, 60)}"${rightBearer ? '' : '  -- does not name who is bound'}`);

  const ok = shaped && quoteInSource && rightYears && rightBearer;
  console.log(`  verdict      ${ok ? 'usable' : 'NOT usable as declared'}`);
  return ok;
}

const registry = loadEngines();
const wanted = arg('engine');
const engines = wanted
  ? registry.engines.filter((e) => e.id === wanted)
  : registry.engines.filter((e) => e.declared);

if (engines.length === 0) {
  console.log(wanted ? `No engine ${wanted} in data/engines.json.` : 'No engine is declared yet.');
  process.exit(1);
}

let allOk = true;
for (const engine of engines) {
  if (!engine.declared) {
    console.log(`\n${engine.label} is not declared, so there is nothing to check.`);
    allOk = false;
    continue;
  }
  const ok = await check(engine);
  allOk &&= ok;
}

console.log(
  allOk
    ? '\nBoth declarations hold. This is what Section 5 is promising.\n'
    : '\nAt least one declared engine does not work as declared. Section 5 cannot be corrected after 30 September.\n',
);
process.exit(allOk ? 0 : 1);
