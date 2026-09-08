/**
 * Ask a list of engines to prove they can be used.
 *
 *   npm run -w backend engines -- --hosts http://127.0.0.1:11434,https://pod-b:11434
 *
 * The same preflight the fleet runs, on its own, so a rented GPU can be checked the moment it
 * boots rather than twenty minutes into a run. Add --quick to skip the timed part.
 */
import { READING_MODEL, EMBEDDING_MODEL } from '../src/engines/ollama.js';
import { probeEngine, describeReport, usable, mismatchedEngine, fingerprintOf } from '../src/engines/probe.js';
import { duplicateEngine, engineKey } from '../src/run/fleet.js';

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

async function main(): Promise<void> {
  const hosts = (arg('hosts') ?? process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434')
    .split(',')
    .map((h) => h.trim().replace(/[/]+$/, ''))
    .filter((h) => h.length > 0);
  const model = arg('model') ?? READING_MODEL;
  const quick = process.argv.includes('--quick');
  const requireSerial = process.argv.includes('--require-serial');

  console.log(`\n${hosts.length} host(s), reading engine ${model}\n`);

  const reports = await Promise.all(hosts.map((h) => probeEngine(h, model, { quick })));
  for (const r of reports) {
    console.log(`  ${describeReport(r)}`);
    // The embedding model only has to exist somewhere; the index is built once, not per worker.
    if (r.reachable && !r.models.some((m) => m.split(':')[0] === EMBEDDING_MODEL.split(':')[0])) {
      console.log(`    note: no ${EMBEDDING_MODEL} here, so this host cannot build the index`);
    }
  }

  const duplicate = duplicateEngine(hosts);
  if (duplicate) {
    console.log(`\n  ${duplicate} names an engine already listed (${engineKey(duplicate)}).`);
    console.log('  A fleet would refuse this: two workers on one engine share its batch.');
  }

  const odd = mismatchedEngine(reports);
  if (odd) {
    console.log(`
  ${odd.host} serves ${fingerprintOf(odd)}, not ${fingerprintOf(reports[0]!)}.`);
    console.log(`  A fleet would refuse this: one run answered by two models is two runs.`);
  }

  const unusable = reports.filter((r) => !usable(r, requireSerial));
  console.log(`\n${reports.length - unusable.length} of ${reports.length} usable.\n`);
  if (unusable.length > 0 || duplicate || odd) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
