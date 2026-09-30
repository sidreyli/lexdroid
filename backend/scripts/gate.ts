/**
 * The gate.
 *
 *   npm run -w backend gate -- --economy SGP --pillars 6,7
 *
 * Runs Zones 1 to 3 over a pillar and prints every cell: the score, the band it came from, the
 * provisions it rests on and the link each one resolves to. With --compare it then puts our
 * answers beside ESCAP's for the same cells.
 *
 * The comparison is the only thing in this repository that opens the baseline, and it opens it
 * after every score is computed. Nothing upstream can see it -- a test fails if anything in the
 * pipeline so much as imports the module.
 */
import { openDb } from '../src/db/index.js';
import { loadRubric, chosenIndicators } from '../src/rubric/index.js';
import type { Indicator } from '../src/rubric/types.js';
import { answerPillar } from '../src/cell/index.js';
import { engineReconnects, haveModel, OllamaUnavailable, READING_MODEL } from '../src/engines/ollama.js';
import { hostedConfig, probeHosted } from '../src/engines/hosted.js';
import { cacheEnabled, cacheSize } from '../src/engines/cache.js';
import { openBaseline, BASELINE_DB_PATH, sameInstrument, escapScore } from '../src/baseline/index.js';
import { openRun, joinRun, recordPillarAnswer, recordStage, recordEvent, finishRun, codeRevision, settleRates } from '../src/run/index.js';
import { loadRates } from '../src/decide/currency.js';
import type { RunEvent } from '../src/run/events.js';
import { existsSync } from 'node:fs';
import { reaches, type Decision } from '../src/decide/index.js';
import { loadProfile } from '../src/profile/index.js';
import { loadEnv } from '../src/env.js';

// The hosted engine's key lives in .env. A gate started by the fleet is handed it (or handed a
// blank, for a local pod, which this does not overwrite); a gate started by hand needs it read.
loadEnv();

/** A read slower than this is said out loud while it is still happening, not after the pillar. */
const SLOW_READ_SECONDS = 30;

interface Args {
  economy: string;
  pillars: number[];
  /** Only these indicators of the pillars; empty is all of them. */
  indicators: string[];
  depth: number | null;
  carryFrom: string | null;
  /** A run whose recorded retrieval is replayed instead of searching; see answerPillar. */
  retrievalFrom: string | null;
  reread: Set<number>;
  model: string | null;
  compare: boolean;
  verbose: boolean;
  record: boolean;
  /** Join a run somebody else opened, and leave the closing to them. */
  joinRunId: string | null;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  const pillars = (get('pillars') ?? '6,7')
    .split(',')
    .map((p) => Number(p.trim()))
    .filter((p) => Number.isInteger(p) && p > 0);

  return {
    economy: (get('economy') ?? 'SGP').toUpperCase(),
    pillars,
    indicators: (get('indicators') ?? '').split(',').map((i) => i.trim()).filter(Boolean),
    depth: get('depth') !== null ? Number(get('depth')) : null,
    carryFrom: get('carry'),
    retrievalFrom: get('retrieval-from'),
    reread: new Set((get('reread') ?? '').split(',').filter(Boolean).map(Number)),
    model: get('model'),
    compare: !argv.includes('--no-compare'),
    verbose: argv.includes('--verbose'),
    record: !argv.includes('--no-record'),
    joinRunId: get('run'),
  };
}

function printDecision(d: Decision, verbose: boolean): void {
  const score = d.score === null ? 'unresolved' : String(d.score);
  console.log(`\n  ${d.indicatorId}  score ${score}  [${d.state}]`);
  console.log(`    ${d.rationale}`);

  for (const e of d.basis.slice(0, verbose ? 20 : 3)) {
    console.log(`    - ${e.instrumentTitle} :: ${e.headingPath}`);
    console.log(`      "${e.finding.quote.slice(0, 160)}${e.finding.quote.length > 160 ? '...' : ''}"`);
    console.log(
      `      ${e.finding.measure ?? 'no measure named'}; ${e.finding.sectorScope} sectors; ${e.finding.dataScope} data` +
        `${e.finding.statedPeriod ? `; period ${e.finding.statedPeriod}` : ''}`,
    );
    console.log(`      ${e.citation}`);
  }
  if (d.basis.length > (verbose ? 20 : 3)) console.log(`    ... and ${d.basis.length - 3} more`);

  for (const f of d.frameworkBasis) {
    console.log(
      `    - ${f.instrumentTitle}: framework=${f.establishesFramework}, ` +
        `applies across sectors=${reaches(f)}, dedicated=${f.dedicated && f.dedicatedShown}`,
    );
    console.log(`      ${f.citation}`);
  }
  if (d.absence) {
    const how =
      d.absence.basis === 'governing'
        ? `governs this area (${d.absence.pillarFindings} of this pillar's requirement(s) read in it)`
        : 'the most relevant instrument the search returned; nothing was found to govern this area';
    console.log(`    read against: ${d.absence.instrumentTitle} -- ${how}`);
  }
  for (const x of d.excluded) {
    console.log(`    (not scored) ${x.evidence.instrumentTitle} :: ${x.evidence.headingPath} -- ${x.reason}`);
  }
  if (verbose || (d.score === 0 && d.held.length > 0)) {
    for (const h of d.held) {
      console.log(`    (held) ${h.evidence.instrumentTitle} :: ${h.evidence.headingPath} -- ${h.reason}`);
    }
  }
}

/** ESCAP's own answers for the same cells. Read only after ours are computed. */
type TheirAnswer = { score: number; instruments: string[]; how: string; rows: number; uncertain: boolean };

function baselineScores(economy: string, indicators: Indicator[]): Map<string, TheirAnswer> {
  const out = new Map<string, TheirAnswer>();
  if (!existsSync(BASELINE_DB_PATH)) return out;

  const db = openBaseline();
  const baselineEconomy = loadProfile(economy).name;
  for (const indicator of indicators) {
    const rows = db
      .prepare('SELECT raw_score, act_or_practice FROM baseline_row WHERE economy = ? AND indicator_id = ?')
      .all(baselineEconomy, indicator.id) as { raw_score: number | null; act_or_practice: string | null }[];
    if (rows.length === 0) continue;

    // One row per measure, so the rows resolve to one answer by the indicator's own ladder rather
    // than by taking the highest. escapScore says which way, in the words this prints.
    const answer = escapScore(indicator, rows.map((r) => r.raw_score));
    const instruments = rows
      .map((r) => (r.act_or_practice ?? '').split(/[;\n]/)[0]?.trim() ?? '')
      .filter((t) => t.length > 0);
    out.set(indicator.id, { ...answer, instruments });
  }
  db.close();
  return out;
}

/**
 * Where the hour went.
 *
 * Printed from the record rather than from variables held in this script, so the number a person
 * reads here is the same number anyone reopening the run months later will read.
 */
function printStages(db: ReturnType<typeof openDb>, runId: string): void {
  const rows = db
    .prepare(
      `SELECT stage, SUM(seconds) AS seconds, SUM(items) AS items
         FROM run_stage WHERE run_id = ? GROUP BY stage ORDER BY seconds DESC`,
    )
    .all(runId) as { stage: string; seconds: number; items: number | null }[];
  if (rows.length === 0) return;

  const total = rows.reduce((n, r) => n + r.seconds, 0);
  console.log('');
  console.log('=== Where the time went ===');
  console.log('');
  for (const r of rows) {
    const share = total > 0 ? (r.seconds / total) * 100 : 0;
    const per = r.items && r.items > 0 ? `${(r.seconds / r.items).toFixed(2)}s each over ${r.items}` : '';
    console.log(`  ${r.stage.padEnd(10)} ${r.seconds.toFixed(1).padStart(7)}s  ${share.toFixed(0).padStart(3)}%  ${per}`);
  }
  console.log(`  ${'total'.padEnd(10)} ${total.toFixed(1).padStart(7)}s`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const model = args.model ?? READING_MODEL;

  // A hosted engine is asked whether it answers; Ollama is asked whether it has the model. Asking
  // a hosted engine's URL for Ollama's model list fails on the protocol, not on the model.
  const hosted = hostedConfig();
  if (hosted) {
    const probe = await probeHosted();
    if (!probe.ok) {
      console.error(`\n${hosted.provider} / ${hosted.model} did not answer: ${probe.detail}\n`);
      process.exit(1);
    }
  } else if (!(await haveModel(model))) {
    console.error(`\n${model} is not installed. Run: ollama pull (or, for a model built from a Modelfile such as gemma4-lex-16k, ollama create) ${model}\n`);
    process.exit(1);
  }

  // Said before anything runs, because the number this run produces cannot be quoted and the
  // person reading the output needs to know that before they read it, not after.
  if (cacheEnabled()) {
    console.log('');
    console.log('  !! THE ENGINE CACHE IS ON. This run is a replay, not a measurement. !!');
    console.log(`     ${cacheSize()} stored answer(s). Its scores test the scoring code and nothing else:`);
    console.log('     no timing, no engine comparison and no agreement figure from it is quotable.');
    console.log('     Unset LEXDROID_ENGINE_CACHE for a real run.');
    console.log('');
  }

  const db = openDb();

  // --carry takes a run id and carriedReadings matches it exactly, so a prefix -- which is what
  // every other script here accepts, and what a person reads off a log line -- silently carried
  // nothing, printed "0 carried", and re-read the whole pillar at full engine cost. Resolved the
  // way grade, misses, rescore and benchmark resolve one, and refused outright when it names no
  // run: carrying nothing is never what was asked for, and it costs hours to discover.
  const carryFrom = args.carryFrom
    ? (
        db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${args.carryFrom}%`) as
          | { id: string }
          | undefined
      )?.id
    : undefined;
  if (args.carryFrom && !carryFrom) {
    console.error(`\nNo run ${args.carryFrom} to carry readings from.`);
    process.exit(1);
  }
  // Resolved the same way and for the same reason: a prefix that names no run would replay nothing.
  const retrievalFrom = args.retrievalFrom
    ? (
        db.prepare('SELECT id FROM run WHERE id LIKE ?').get(`${args.retrievalFrom}%`) as
          | { id: string }
          | undefined
      )?.id
    : undefined;
  if (args.retrievalFrom && !retrievalFrom) {
    console.error(`\nNo run ${args.retrievalFrom} to replay retrieval from.`);
    process.exit(1);
  }

  const rubric = loadRubric();
  const all: Decision[] = [];
  let engineMs = 0;
  let rejected = 0;
  let refusedQuotes = 0;

  // The run is opened before anything is answered and closed after, so a crash leaves a row that
  // says 'running' rather than leaving nothing at all.
  const run = !args.record
    ? null
    : args.joinRunId
      ? joinRun(db, args.joinRunId)
      : openRun(db, {
          economies: [args.economy],
          pillars: args.pillars,
          ...(args.indicators.length ? { indicators: args.indicators } : {}),
          model,
          notes: 'gate',
        });
  if (run) console.log(`run ${run.id}  (code ${codeRevision()})`);

  // One indicator compares a customs threshold with 200 USD, so the run settles on a rate once and
  // records it. Without a run to record it on, today's is fetched and used unrecorded.
  const fetched = await loadRates({
    allowNetwork: run ? run.sourceMode === 'fetch' : true,
    log: (l) => console.log(`  ${l}`),
  });
  const rates = run ? settleRates(run, fetched) : fetched;
  if (rates) console.log(`exchange rates as at ${rates.asOf}  (${rates.source})`);

  // Everything the pillar says goes to the ledger. The terminal gets the part a person watching
  // needs: a refusal, a read that is taking too long, and a count every so often.
  const emit = (e: RunEvent): void => {
    if (run) recordEvent(run, e);
    if (e.stage !== 'read') return;
    if (e.kind === 'refused') {
      console.log(`  [${e.done}/${e.total}] refused -- ${e.subject}`);
      console.log(`      ${e.detail}`);
    } else if ((e.seconds ?? 0) >= SLOW_READ_SECONDS) {
      console.log(`  [${e.done}/${e.total}] ${(e.seconds ?? 0).toFixed(0)}s -- ${e.subject}`);
    } else if (e.done && e.done % 25 === 0) {
      console.log(`  [${e.done}/${e.total}] read`);
    }
  };
  emit({ stage: 'run', kind: 'started', economy: args.economy, detail: `pillars ${args.pillars.join(', ')} on ${model}` });

  for (const pillarId of args.pillars) {
    const indicators = chosenIndicators(pillarId, args.indicators, rubric);
    console.log(`\n=== Pillar ${pillarId}: ${indicators[0]?.pillarName ?? ''} (${args.economy}) ===`);

    const answer = await answerPillar(db, pillarId, args.economy, {
      ...(args.depth ? { depth: args.depth } : {}),
      ...(carryFrom ? { carryFrom } : {}),
      ...(retrievalFrom ? { retrievalFrom } : {}),
      ...(args.reread.size ? { reread: args.reread } : {}),
      ...(args.indicators.length ? { indicators: args.indicators } : {}),
      model,
      log: (l) => console.log(l),
      emit,
      rates,
    });

    if (run) {
      const wrote = Date.now();
      recordPillarAnswer(run, answer);
      recordStage(run, {
        stage: 'record',
        economy: args.economy,
        pillarId,
        seconds: (Date.now() - wrote) / 1000,
        items: answer.readings.length,
      });
      emit({
        stage: 'record',
        kind: 'finished',
        economy: args.economy,
        pillarId,
        seconds: (Date.now() - wrote) / 1000,
        total: answer.readings.length,
      });
    }
    for (const d of answer.decisions) printDecision(d, args.verbose);
    all.push(...answer.decisions);
    engineMs += answer.engineMs;
    rejected += answer.rejectedFindings;
    refusedQuotes += answer.rejectedQuotes;

    console.log(
      `\n  ${answer.readings.length} provision(s) read in ${(answer.durationMs / 1000).toFixed(0)}s ` +
        `(${(answer.engineMs / 1000).toFixed(0)}s of engine time), ${answer.rejectedFindings} finding(s) ` +
        `refused -- ${answer.rejectedQuotes} for words not in the provision, ` +
        `${answer.rejectedFindings - answer.rejectedQuotes} for naming no measure this pillar scores`,
    );
  }

  console.log(
    `\n=== ${all.length} cells, ${(engineMs / 1000 / 60).toFixed(1)} engine-minutes, ` +
      `${rejected} refused finding(s), ${refusedQuotes} of them on the quote check ===`,
  );
  console.log(`    model: ${model}`);
  // An engine that went away and came back is a fact about the run, not a detail of the transport.
  if (engineReconnects() > 0) {
    console.log(`    engine was briefly unreachable ${engineReconnects()} time(s) and was waited for`);
  }
  if (run) {
    emit({ stage: 'run', kind: 'finished', economy: args.economy, detail: `${all.length} cells` });
    if (cacheEnabled()) console.log('    REPLAYED FROM CACHE -- this run is not a measurement');
    // A worker never closes a run it joined; the process that opened it knows when everyone is done.
    if (!args.joinRunId) finishRun(run);
    console.log(`    recorded as run ${run.id}`);
    printStages(db, run.id);
  }

  if (!args.compare) return;

  const theirs = baselineScores(
    args.economy,
    all.flatMap((d) => rubric.indicators.filter((i) => i.id === d.indicatorId)),
  );
  if (theirs.size === 0) {
    console.log('\nNo baseline rows for this economy; nothing to compare against.');
    return;
  }

  console.log('\n=== Against ESCAP\'s own answers for the same cells ===\n');
  console.log('  cell   ours   theirs   agreement');
  let agree = 0;
  let within = 0;
  for (const d of all) {
    const t = theirs.get(d.indicatorId);
    const ours = d.score;
    if (!t) {
      console.log(`  ${d.indicatorId.padEnd(6)} ${String(ours ?? '-').padEnd(6)} ${'-'.padEnd(8)} not in the baseline`);
      continue;
    }
    let verdict: string;
    if (ours === null) verdict = 'UNRESOLVED';
    else if (ours === t.score) {
      verdict = 'same';
      agree += 1;
      within += 1;
    } else if (Math.abs(ours - t.score) <= 0.5) {
      verdict = 'within one band';
      within += 1;
    } else verdict = 'DIFFERENT';
    const note = t.rows > 1 ? `   (${t.rows} rows -- ${t.how}${t.uncertain ? '; LOOK' : ''})` : '';
    console.log(`  ${d.indicatorId.padEnd(6)} ${String(ours ?? '-').padEnd(6)} ${String(t.score).padEnd(8)} ${verdict}${note}`);
  }
  console.log(`\n  ${agree}/${all.length} exact, ${within}/${all.length} within one band.`);
  console.log('  ESCAP cites, per cell:');
  for (const d of all) {
    const t = theirs.get(d.indicatorId);
    if (t) console.log(`    ${d.indicatorId}: ${[...new Set(t.instruments)].join('; ')}`);
  }

  reportNewEvidence(all, theirs);
}

/**
 * Where we scored higher than ESCAP on an instrument they did not cite.
 *
 * A disagreement is not automatically a defect on either side. Their Australian answers were
 * written before the Cyber Security Act 2024 existed; ours were not. What separates a finding
 * from a mistake is whether the extra evidence is real -- a verified quote, in an instrument they
 * never named -- and that is what is printed here, so it can be checked rather than believed.
 *
 * The standing rule this serves: never fit the output to the answer key. Where we genuinely find
 * evidence that overrides theirs, it ships and we say so.
 */
function reportNewEvidence(
  all: Decision[],
  theirs: Map<string, { score: number; instruments: string[] }>,
): void {
  // A framework cell keeps its evidence in frameworkBasis and its basis is empty, and 7.2 is
  // exactly such a cell -- so reading only one of the two would miss the case this exists for.
  const shown = (d: Decision): { title: string; where: string; quote: string; citation: string }[] =>
    d.basis.length > 0
      ? d.basis.map((e) => ({
          title: e.instrumentTitle,
          where: e.headingPath,
          quote: e.finding.quote,
          citation: e.citation,
        }))
      : d.frameworkBasis.map((f) => ({
          title: f.instrumentTitle,
          where: 'the instrument itself',
          quote: f.quote,
          citation: f.citation,
        }));

  const notable = all.filter((d) => {
    const t = theirs.get(d.indicatorId);
    // Either direction. A framework indicator's better answer is the lower score -- 7.2 scores 0
    // because a dedicated horizontal Act exists -- so a rule about higher scores would miss it.
    return t !== undefined && d.score !== null && d.score !== t.score && shown(d).length > 0;
  });
  if (notable.length === 0) return;

  console.log('\n=== Beyond ESCAP -- a different answer, and the evidence it rests on ===');
  for (const d of notable) {
    const t = theirs.get(d.indicatorId)!;
    const extra = shown(d).filter((e) => !t.instruments.some((c) => sameInstrument(e.title, c)));
    if (extra.length === 0) continue;
    console.log(`\n  ${d.indicatorId}: ours ${d.score} against their ${t.score}`);
    for (const e of extra) {
      console.log(`    ${e.title} :: ${e.where}`);
      console.log(`      "${e.quote}"`);
      console.log(`      ${e.citation}`);
    }
  }
}

main().catch((err: unknown) => {
  if (err instanceof OllamaUnavailable) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }
  throw err;
});
