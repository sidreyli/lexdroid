/**
 * One run, several workers, one worker per engine.
 *
 *   npm run -w backend fleet -- --economies SGP,MYS --pillars 6,7 --hosts HOST_A,HOST_B
 *
 * Work is split by economy and pillar and handed to gate processes that all join the same run, so
 * what comes out is one run record and one live event stream rather than several to be stitched.
 *
 * One worker per engine endpoint, never two. Two workers sharing an Ollama server have their reads
 * batched together by that server, and scripts/concurrency.ts measured what batching does: 18 of 40
 * provisions read differently. Parallelism across engines is safe; parallelism inside one is not.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { openRun, finishRun, runEvents, recordRent } from '../src/run/index.js';
import { describe } from '../src/run/events.js';
import { duplicateEngine, workUnits, type Unit } from '../src/run/fleet.js';
import { READING_MODEL } from '../src/engines/ollama.js';
import { probeEngine, describeReport, usable, mismatchedEngine, fingerprintOf } from '../src/engines/probe.js';

interface Args {
  economies: string[];
  pillars: number[];
  hosts: string[];
  model: string;
  depth: number | null;
  compare: boolean;
  probe: boolean;
  usdPerHour: number;
  requireSerial: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  return {
    economies: (get('economies') ?? 'SGP')
      .split(',')
      .map((e) => e.trim().toUpperCase())
      .filter((e) => e.length > 0),
    pillars: (get('pillars') ?? '6,7')
      .split(',')
      .map((p) => Number(p.trim()))
      .filter((p) => Number.isInteger(p) && p > 0),
    hosts: (get('hosts') ?? process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434')
      .split(',')
      .map((h) => h.trim().replace(/[/]+$/, ''))
      .filter((h) => h.length > 0),
    model: get('model') ?? READING_MODEL,
    depth: get('depth') !== null ? Number(get('depth')) : null,
    compare: !argv.includes('--no-compare'),
    probe: !argv.includes('--no-probe'),
    usdPerHour: Number(get('usd-per-hour') ?? 0),
    requireSerial: argv.includes('--require-serial'),
  };
}

/** One work unit on one engine, as a child gate that joins the run. Output goes to its own log. */
function runUnit(unit: Unit, host: string, runId: string, logDir: string, args: Args): Promise<number> {
  const logPath = join(logDir, `${unit.economy}-p${unit.pillar}.log`);
  const out = createWriteStream(logPath);
  const argv = [
    'tsx',
    'scripts/gate.ts',
    '--economy',
    unit.economy,
    '--pillars',
    String(unit.pillar),
    '--run',
    runId,
    '--model',
    args.model,
  ];
  if (args.depth) argv.push('--depth', String(args.depth));
  if (!args.compare) argv.push('--no-compare');

  return new Promise((resolve) => {
    const child = spawn('npx', argv, {
      shell: true,
      env: { ...process.env, OLLAMA_HOST: host, LLM_PROVIDER: 'ollama' },
    });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.on('close', (code) => {
      out.end();
      resolve(code ?? 1);
    });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const duplicate = duplicateEngine(args.hosts);
  if (duplicate) {
    console.error(`\n${duplicate} is listed twice. Two workers on one engine have their reads`);
    console.error('batched together, which changes the answers. One worker per engine.\n');
    process.exit(1);
  }

  console.log(`\nChecking ${args.hosts.length} engine(s)...\n`);
  const reports = await Promise.all(
    args.hosts.map((h) => probeEngine(h, args.model, { quick: !args.probe })),
  );
  for (const r of reports) console.log(`  ${describeReport(r)}`);

  const unusable = reports.filter((r) => !usable(r, args.requireSerial));
  if (unusable.length > 0) {
    console.error(
      `\n${unusable.length} of ${reports.length} engine(s) cannot be used. Fix them, or drop them from --hosts.\n`,
    );
    process.exit(1);
  }

  // The cloud failure a laptop cannot have: the same tag built differently on two machines. Half
  // the run would be answered by one model and half by the other, and neither half would say so.
  const odd = mismatchedEngine(reports);
  if (odd) {
    console.error(`\n${odd.host} serves ${fingerprintOf(odd)}, but ${reports[0]!.host} serves`);
    console.error(`${fingerprintOf(reports[0]!)}. One run answered by two models is two runs.\n`);
    process.exit(1);
  }

  const units = workUnits(args.economies, args.pillars);

  const db = openDb();
  const run = openRun(db, {
    economies: args.economies,
    pillars: args.pillars,
    model: args.model,
    notes: `fleet of ${args.hosts.length} on ${args.hosts.join(', ')}`,
  });

  const logDir = join('data', 'fleet', run.id);
  mkdirSync(logDir, { recursive: true });

  console.log(`run ${run.id}`);
  console.log(`${units.length} unit(s) across ${args.hosts.length} engine(s): ${args.hosts.join(', ')}`);
  console.log(`logs in ${logDir}`);
  console.log('');

  // The ledger is the only progress display. A worker's own stdout goes to its log, because four
  // gates interleaving their decisions on one terminal is not readable by anyone.
  let cursor = 0;
  let following = true;
  const follow = async (): Promise<void> => {
    while (following) {
      for (const e of runEvents(db, run.id, cursor, 200)) {
        cursor = e.id;
        const where = e.economy ? `${e.economy} ` : '';
        console.log(`${e.at.slice(11, 19)} ${where}${describe(e)}`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  };
  const following_ = follow();

  const started = Date.now();
  let next = 0;
  const done: { unit: Unit; host: string; code: number }[] = [];
  await Promise.all(
    args.hosts.map(async (host) => {
      for (;;) {
        const i = next++;
        if (i >= units.length) return;
        const unit = units[i]!;
        const code = await runUnit(unit, host, run.id, logDir, args);
        done.push({ unit, host, code });
      }
    }),
  );

  following = false;
  await following_;

  const seconds = (Date.now() - started) / 1000;
  const failed = done.filter((d) => d.code !== 0);
  // Rented hardware bills for the hour it is held, not for the seconds it decodes, so the
  // charge is hosts x wall time. Zero for a laptop, which is why the default is zero.
  const rent = args.usdPerHour * args.hosts.length * (seconds / 3600);
  if (rent > 0) recordRent(db, run.id, run.engine, args.model, rent);
  finishRun(run, failed.length > 0 ? 'failed' : 'complete');

  console.log('');
  console.log(`=== ${done.length} unit(s) in ${(seconds / 60).toFixed(1)} minutes ===`);
  console.log('');
  for (const d of done.sort((a, b) => a.unit.economy.localeCompare(b.unit.economy) || a.unit.pillar - b.unit.pillar)) {
    const verdict = d.code === 0 ? 'ok' : `FAILED (exit ${d.code})`;
    console.log(`  ${d.unit.economy} pillar ${d.unit.pillar}  ${d.host}  ${verdict}`);
  }
  console.log('');
  console.log(`  run ${run.id} recorded as ${failed.length > 0 ? 'failed' : 'complete'}`);
  if (rent > 0) {
    console.log(`  rent: $${rent.toFixed(2)} for ${args.hosts.length} host(s) at $${args.usdPerHour}/hour`);
  }
  console.log(`  answers: npm run -w backend runs -- --run ${run.id}`);
  if (failed.length > 0) console.log(`  a failed unit left its reason in ${logDir}`);

  db.close();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
