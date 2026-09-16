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
import { openRun, joinRun, finishRun, runEvents, recordRent, recordEvent } from '../src/run/index.js';
import { rescoreRun } from '../src/run/rescore.js';
import { describe } from '../src/run/events.js';
import {
  childEngineEnv,
  duplicateEngine,
  longestFirst,
  pinByEconomy,
  replayingWhilePaying,
  workUnits,
  type Unit,
} from '../src/run/fleet.js';
import { indicatorsOfPillar, loadRubric } from '../src/rubric/index.js';
import { READING_MODEL } from '../src/engines/ollama.js';
import { probeEngine, describeReport, usable, mismatchedEngine, fingerprintOf } from '../src/engines/probe.js';
import { probeHosted } from '../src/engines/hosted.js';
import { cacheEnabled } from '../src/engines/cache.js';
import { prepareCorpus, describePrepare, type PrepareResult } from '../src/run/prepare.js';
import { confirmPass } from '../src/read/confirm-pass.js';
import { buildExportRows } from '../src/export/index.js';
import { verifyRun } from '../src/verify/index.js';
import { tagRun } from '../src/baseline/tag.js';
import { defaultEngine, findEngine, type Engine } from '../src/engines/registry.js';

interface Args {
  economies: string[];
  pillars: number[];
  hosts: string[];
  model: string;
  depth: number | null;
  carryFrom: string | null;
  joinRunId: string | null;
  compare: boolean;
  probe: boolean;
  usdPerHour: number;
  requireSerial: boolean;
  perEconomy: boolean;
  fanOut: boolean;
  engine: Engine | undefined;
  cacheOnly: boolean;
  /** Answer out of the corpus as it stands, without discovering or fetching anything first. */
  skipPrepare: boolean;
  /** Stop after the cells are answered, without confirming, exporting or verifying them. */
  skipFinish: boolean;
  /** How many instruments each of the run's questions may pull into the corpus. */
  top: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  // Named engine, or the one the interface last chose. Its hosts stand in for --hosts.
  const engine = get('engine') ? findEngine(get('engine')!) : defaultEngine();
  if (get('engine') && !engine) throw new Error(`No engine ${get('engine')} in data/engines.json`);

  return {
    economies: (get('economies') ?? 'SGP')
      .split(',')
      .map((e) => e.trim().toUpperCase())
      .filter((e) => e.length > 0),
    pillars: (get('pillars') ?? '6,7')
      .split(',')
      .map((p) => Number(p.trim()))
      .filter((p) => Number.isInteger(p) && p > 0),
    hosts: (get('hosts') ?? engine?.hosts.join(',') ?? process.env['OLLAMA_HOST'] ?? 'http://127.0.0.1:11434')
      .split(',')
      .map((h) => h.trim().replace(/[/]+$/, ''))
      .filter((h) => h.length > 0),
    model: get('model') ?? READING_MODEL,
    depth: get('depth') !== null ? Number(get('depth')) : null,
    carryFrom: get('carry'),
    joinRunId: get('run'),
    compare: !argv.includes('--no-compare'),
    probe: !argv.includes('--no-probe'),
    usdPerHour: Number(get('usd-per-hour') ?? 0),
    requireSerial: argv.includes('--require-serial'),
    perEconomy: argv.includes('--per-economy'),
    fanOut: argv.includes('--fan-out'),
    engine,
    cacheOnly: argv.includes('--cache-only'),
    skipPrepare: argv.includes('--skip-prepare'),
    skipFinish: argv.includes('--skip-finish'),
    top: get('top') !== null ? Number(get('top')) : 15,
  };
}

/** One work unit on one engine, as a child gate that joins the run. Output goes to its own log. */
function runUnit(unit: Unit, hosts: string[], runId: string, logDir: string, args: Args, attempt = 1): Promise<number> {
  const suffix = attempt > 1 ? `-try${attempt}` : '';
  const logPath = join(logDir, `${unit.economy}-p${unit.pillar}${suffix}.log`);
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
  if (args.carryFrom) argv.push('--carry', args.carryFrom);
  if (!args.compare) argv.push('--no-compare');

  return new Promise((resolve) => {
    const child = spawn('npx', argv, {
      shell: true,
      env: {
        ...process.env,
        ...childEngineEnv(
          hosts,
          args.engine?.hosted
            ? {
                hosted: true,
                baseUrl: args.engine.hosts[0] ?? '',
                model: args.engine.model,
                provider: args.engine.provider,
              }
            : undefined,
        ),
      },
    });
    child.stdout.pipe(out);
    child.stderr.pipe(out);
    child.on('close', (code) => {
      out.end();
      resolve(code ?? 1);
    });
  });
}

/**
 * Whether this unit has already answered inside the run being joined.
 *
 * A unit banks nothing until every cell in it has an answer, so a cell without one is a unit that
 * was interrupted. Those are cleared and run again; the ones that finished are left alone.
 */
function alreadyAnswered(db: ReturnType<typeof openDb>, runId: string, unit: Unit): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS cells, COUNT(a.cell_id) AS answered
         FROM cell c LEFT JOIN cell_answer a ON a.cell_id = c.id
        WHERE c.run_id = ? AND c.economy_code = ?
          AND CAST(substr(c.indicator_id, 1, instr(c.indicator_id, '.') - 1) AS INTEGER) = ?`,
    )
    .get(runId, unit.economy, unit.pillar) as { cells: number; answered: number };
  return row.cells > 0 && row.cells === row.answered;
}

/**
 * Everything a half-finished unit recorded, so its retry starts from nothing.
 * Children of a cell cascade, so the cells are the whole of it.
 */
function clearUnit(db: ReturnType<typeof openDb>, runId: string, unit: Unit): void {
  db.prepare(
    `DELETE FROM cell
      WHERE run_id = ? AND economy_code = ?
        AND CAST(substr(indicator_id, 1, instr(indicator_id, '.') - 1) AS INTEGER) = ?`,
  ).run(runId, unit.economy, unit.pillar);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // Replaying stored answers on hired GPUs bills for work nothing did, and the run would carry a
  // rent figure while being marked unquotable. Two features that are each fine and never both.
  if (replayingWhilePaying(cacheEnabled(), args.usdPerHour)) {
    console.error('\nThe engine cache is on and these hosts are being paid for by the hour.');
    console.error('A replayed run is not a measurement; unset LEXDROID_ENGINE_CACHE.\n');
    process.exit(1);
  }

  if (args.fanOut && args.perEconomy) {
    console.error('\n--fan-out and --per-economy ask for opposite shapes: one engine per economy,');
    console.error('or every engine on each pillar. Pick one.\n');
    process.exit(1);
  }

  const duplicate = duplicateEngine(args.hosts);
  if (duplicate) {
    console.error(`\n${duplicate} is listed twice. Two workers on one engine have their reads`);
    console.error('batched together, which changes the answers. One worker per engine.\n');
    process.exit(1);
  }

  // A hosted engine has no Ollama server to probe, so it is asked the only question that matters:
  // does it answer, with the model it was declared as. The checks below are about a machine we are
  // renting by the hour, and there is no machine here.
  if (args.engine?.hosted) {
    process.env['LEXDROID_HOSTED_BASE_URL'] = args.engine.hosts[0] ?? '';
    process.env['LEXDROID_HOSTED_MODEL'] = args.engine.model;
    process.env['LEXDROID_HOSTED_PROVIDER'] = args.engine.provider;
    console.log(`\nChecking ${args.engine.label}: ${args.engine.provider} / ${args.engine.model}\n`);
    const probe = await probeHosted();
    console.log(`  ${probe.detail}`);
    if (!probe.ok) {
      console.error(`\n${args.engine.label} cannot be reached. Fix it, or run on the other engine.\n`);
      process.exit(1);
    }
  } else {
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
  }

  // How many indicators a pillar asks about is the size signal available before any of it runs.
  const rubric = loadRubric();
  const units = longestFirst(workUnits(args.economies, args.pillars), (u) =>
    indicatorsOfPillar(u.pillar, rubric).length,
  );

  const db = openDb();
  // Joining rather than opening lets a fleet be restarted onto more engines without throwing away
  // the units that already answered. A unit every cell of which has an answer is not run again.
  const run = args.joinRunId
    ? joinRun(db, args.joinRunId, args.engine?.id)
    : openRun(db, {
        economies: args.economies,
        pillars: args.pillars,
        model: args.model,
        ...(args.engine ? { engine: args.engine.id } : {}),
        sourceMode: args.cacheOnly ? ('cache-only' as const) : ('fetch' as const),
        notes: `fleet of ${args.hosts.length} on ${args.hosts.join(', ')}`,
      });

  // A joined run keeps what it already answered and clears what it was part way through.
  let todo = units;
  if (args.joinRunId) {
    const done = units.filter((u) => alreadyAnswered(db, run.id, u));
    todo = units.filter((u) => !alreadyAnswered(db, run.id, u));
    for (const u of todo) clearUnit(db, run.id, u);
    console.log(`joining run ${run.id}: ${done.length} unit(s) already answered, ${todo.length} to do`);
  }

  const logDir = join('data', 'fleet', run.id);
  mkdirSync(logDir, { recursive: true });

  console.log(`run ${run.id}`);
  const pinned = args.perEconomy ? pinByEconomy(todo, args.hosts) : null;
  console.log(`${todo.length} unit(s) across ${args.hosts.length} engine(s): ${args.hosts.join(', ')}`);
  if (args.fanOut) console.log('  every engine reads each pillar together, one pillar at a time');
  if (pinned) {
    for (const [host, own] of pinned) {
      console.log(`  ${host} reads ${own.map((u) => `${u.economy}/p${u.pillar}`).join(' ') || 'nothing'}`);
    }
  }
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

  // Zone 0 and Zone 1, before anything is asked of the corpus.
  //
  // This is what "Fetch new documents" promised and did not do. A fleet that joined a run does not
  // repeat it -- the fleet that opened the run has already walked the portals -- and a cache-only
  // pass does not do it at all, which is what makes its document list empty.
  const prepared: PrepareResult[] = [];
  if (!args.skipPrepare && !args.joinRunId) {
    console.log(`preparing the corpus for ${args.economies.join(', ')}`);
    for (const economy of args.economies) {
      try {
        const result = await prepareCorpus(db, {
          economy,
          runId: run.id,
          pillars: args.pillars,
          sourceMode: args.cacheOnly ? 'cache-only' : 'fetch',
          top: args.top,
          emit: (e) => recordEvent(run, e),
          log: (l) => console.log(`  ${l}`),
        });
        prepared.push(result);
        console.log(describePrepare(result));
        for (const note of result.notes) console.log(`    ${note}`);
      } catch (err) {
        // A portal that will not answer is not a reason to abandon the cells: the corpus already
        // on disk still answers them, and the run says what it could not reach.
        const detail = err instanceof Error ? err.message : String(err);
        console.log(`  ${economy}: could not be prepared -- ${detail}`);
        recordEvent(run, { stage: 'discover', kind: 'failed', economy, detail });
      }
    }
    console.log('');
  }

  let next = 0;
  const done: { unit: Unit; host: string; code: number }[] = [];

  /** One attempt, then one more: a passing fault deserves another go, a real defect fails twice. */
  const attempt = async (unit: Unit, hosts: string[], label: string): Promise<void> => {
    let code = await runUnit(unit, hosts, run.id, logDir, args);
    if (code !== 0) {
      console.log(`${unit.economy} pillar ${unit.pillar} failed on ${label}; one more attempt`);
      clearUnit(db, run.id, unit);
      code = await runUnit(unit, hosts, run.id, logDir, args, 2);
    }
    done.push({ unit, host: label, code });
  };

  if (args.fanOut) {
    // Every engine reads one pillar together. The biggest pillar is then divided rather than
    // setting the floor, which is the whole of the tail on a run of this shape.
    for (const unit of todo) await attempt(unit, args.hosts, `${args.hosts.length} engine(s)`);
  } else {
    await Promise.all(
      args.hosts.map(async (host) => {
        // Pinned, a host reads its own economies and stops; unpinned, it takes whatever is next.
        const own = pinned?.get(host);
        for (;;) {
          const unit = own ? own.shift() : todo[next++];
          if (!unit) return;
          await attempt(unit, [host], host);
        }
      }),
    );
  }

  following = false;
  await following_;

  const seconds = (Date.now() - started) / 1000;
  const failed = done.filter((d) => d.code !== 0);
  // Rented hardware bills for the hour it is held, not for the seconds it decodes, so the
  // charge is hosts x wall time. Zero for a laptop, which is why the default is zero.
  const rent = args.usdPerHour * args.hosts.length * (seconds / 3600);
  if (rent > 0) recordRent(db, run.id, run.engine, args.model, rent);
  // A fleet that joined a run it did not open does not close it. Two fleets sharing a run finish at
  // different times, and the first to finish closing it locked the second out of its own remaining
  // units -- three pillars refused entry to a run that was still being worked on.

  // The three stages that turn answers into something a person can review and submit. They used to
  // be three commands somebody had to remember, so the runs that produced the submission had none
  // of them and the latest complete run had zero export rows in it.
  //
  // A fleet that joined a run does not do this either: the fleet that opened it closes it, and
  // confirming half a run's findings while another fleet is still producing them scores a moving
  // target.
  if (!args.skipFinish && !args.joinRunId) {
    try {
      console.log('confirming what each provision actually states');
      const pass = await confirmPass(db, {
        runId: run.id,
        model: args.model,
        workers: args.hosts.length,
        emit: (e) => recordEvent(run, e),
        log: (l) => console.log(l),
      });
      console.log(
        `  asked ${pass.asked} of ${pass.questions}; ${pass.confirmed} confirmed, ` +
          `${pass.ruledOut} ruled out, ${pass.failed} failed`,
      );

      // The findings have moved, so the scores have to be taken again from them. Nothing is
      // re-read and nothing is re-fetched: this is the same decision over the same record.
      console.log('re-scoring against what the second reading found');
      const rescored = rescoreRun(db, run.id);
      console.log(`  ${rescored.changed} of ${rescored.cells} cell(s) changed`);

      console.log('building the export rows');
      recordEvent(run, { stage: 'export', kind: 'started' });
      const built = buildExportRows(db, run.id);
      console.log(`  ${built.rows} row(s) from ${built.cells} cell(s)`);
      if (built.cellsWithoutRow > 0) console.log(`  WARNING: ${built.cellsWithoutRow} cell(s) produced no row`);
      recordEvent(run, { stage: 'export', kind: 'finished', detail: `${built.rows} row(s)`, total: built.rows });

      // NEW or KNOWN, against ESCAP's sample kit. Last, and from a script rather than from src/,
      // because nothing in the pipeline may see the kit: if discovery could, every instrument
      // would be KNOWN by construction and the sealed economy would be the one that collapsed.
      console.log('tagging each row against the published sample kit');
      const tagged = tagRun(db, run.id);
      console.log(`  ${tagged.isNew} NEW, ${tagged.known} KNOWN, ${tagged.newInstruments.length} instrument(s) the kit does not have`);

      console.log('verifying every row against the gates');
      recordEvent(run, { stage: 'verify', kind: 'started', total: built.rows });
      const verified = verifyRun(db, run.id);
      console.log(`  ${verified.held} of ${verified.rows} row(s) held for a reviewer`);
      recordEvent(run, {
        stage: 'verify',
        kind: 'finished',
        detail: `${verified.held} of ${verified.rows} held for review`,
        done: verified.rows - verified.held,
        total: verified.rows,
      });
      console.log('');
    } catch (err) {
      // The cells are answered and recorded either way. A failure here costs the export, not the
      // run, and saying which is the difference between a rerun and a six-hour rerun.
      const detail = err instanceof Error ? err.message : String(err);
      console.log(`
  the answers are recorded, but they could not be made submittable: ${detail}`);
      recordEvent(run, { stage: 'export', kind: 'failed', detail });
    }
  }

  if (!args.joinRunId) finishRun(run, failed.length > 0 ? 'failed' : 'complete');

  console.log('');
  console.log(`=== ${done.length} unit(s) in ${(seconds / 60).toFixed(1)} minutes ===`);
  console.log('');
  for (const d of done.sort((a, b) => a.unit.economy.localeCompare(b.unit.economy) || a.unit.pillar - b.unit.pillar)) {
    const verdict = d.code === 0 ? 'ok' : `FAILED (exit ${d.code})`;
    console.log(`  ${d.unit.economy} pillar ${d.unit.pillar}  ${d.host}  ${verdict}`);
  }
  console.log('');
  console.log(
    args.joinRunId
      ? `  run ${run.id} left open: this fleet joined it and does not close what it did not open`
      : `  run ${run.id} recorded as ${failed.length > 0 ? 'failed' : 'complete'}`,
  );
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
