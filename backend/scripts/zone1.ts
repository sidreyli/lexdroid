/**
 * Zone 0 and Zone 1 for one economy, from the command line.
 *
 *   npm run -w backend zone1 -- --economy SGP --register
 *   npm run -w backend zone1 -- --economy MYS --register --portal mcmc
 *   npm run -w backend zone1 -- --economy SGP --read 20 --title "Personal Data"
 *   npm run -w backend zone1 -- --economy AUS --pillars 6,7 --top 25
 *   npm run -w backend zone1 -- --economy SGP --unread
 *   npm run -w backend zone1 -- --economy SGP --embed
 *   npm run -w backend zone1 -- --economy SGP --status
 *
 * --delay <ms> raises the floor on the gap between requests to one host. The site's own
 * robots.txt crawl-delay still wins when it asks for more.
 *
 * The stages are separate flags because they cost differently: registering is a handful of
 * requests, reading the corpus is hours at the crawl delay the site asks for, and embedding is
 * GPU time. Each is resumable, so stopping one and continuing later is the normal case.
 */
import { openDb } from '../src/db/index.js';
import { Fetcher, type SourceMode } from '../src/fetch/index.js';
import { loadProfile, applyProfile } from '../src/profile/index.js';
import { register, materialise } from '../src/discover/index.js';
import { buildDenseIndex } from '../src/index/index.js';
import { buildInstrumentIndex, shortlistInstruments } from '../src/shortlist/index.js';
import { loadRubric, indicatorsOfPillar } from '../src/rubric/index.js';
import { queriesFor } from '../src/retrieve/index.js';
import { EMBEDDING_MODEL, haveModel, OllamaUnavailable } from '../src/engines/ollama.js';

interface Args {
  economy: string;
  register: boolean;
  /** Walk only the portals whose name or URL contains this. For re-walking one repaired adapter. */
  portal: string | null;
  read: number | null;
  title: string | null;
  kind: string | null;
  embed: boolean;
  refresh: boolean;
  reparse: boolean;
  /** Only instruments with a document this parser produced: the scope of a parser fix. */
  parser: string | null;
  /** Re-read only the documents nothing could be read out of. */
  unread: boolean;
  status: boolean;
  delayMs: number | null;
  sourceMode: SourceMode;
  /** A question to rank the register against, instead of reading it in registration order. */
  about: string | null;
  /** Pillars whose rubric queries rank the register, which is what a run actually asks of it. */
  pillars: number[] | null;
  /** How many of the shortlisted instruments to actually fetch. */
  top: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string): string | null => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] ?? null : null;
  };
  const has = (name: string): boolean => argv.includes(`--${name}`);

  const readArg = get('read');
  const anyStage =
    has('register') || readArg !== null || has('embed') || has('status') || has('reparse') || has('unread')
    || get('about') !== null || get('pillars') !== null;

  return {
    economy: (get('economy') ?? 'SGP').toUpperCase(),
    register: has('register') || !anyStage,
    portal: get('portal'),
    read: readArg !== null ? (readArg === 'all' ? 0 : Number(readArg))
      : (get('about') !== null || get('pillars') !== null || has('reparse') || has('unread')) ? 0 : anyStage ? null : 0,
    title: get('title'),
    parser: get('parser'),
    kind: get('kind'),
    embed: has('embed') || !anyStage,
    refresh: has('refresh'),
    reparse: has('reparse'),
    unread: has('unread'),
    status: has('status'),
    delayMs: get('delay') !== null ? Number(get('delay')) : null,
    sourceMode: has('cache-only') ? 'cache-only' : 'fetch',
    about: get('about'),
    pillars: get('pillars') !== null
      ? get('pillars')!.split(',').map((p) => Number(p.trim())).filter((p) => Number.isInteger(p) && p > 0)
      : null,
    top: get('top') !== null ? Number(get('top')) : 15,
  };
}

function status(db: ReturnType<typeof openDb>, economy: string): void {
  const one = <T>(sql: string, ...p: unknown[]): T => db.prepare(sql).get(...p) as T;

  const instruments = one<{ c: number }>('SELECT COUNT(*) c FROM instrument WHERE economy_code = ?', economy).c;
  const docs = one<{ c: number }>(
    'SELECT COUNT(*) c FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?', economy,
  ).c;
  const sections = one<{ c: number }>(
    `SELECT COUNT(*) c FROM section s JOIN document d ON d.id = s.document_id
     JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`, economy,
  ).c;
  const embedded = one<{ c: number }>(
    `SELECT COUNT(*) c FROM section_embedding e JOIN section s ON s.id = e.section_id
     JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
     WHERE i.economy_code = ?`, economy,
  ).c;

  console.log(`\n${economy}`);
  console.log(`  instruments registered   ${instruments}`);
  console.log(`  documents read           ${docs}`);
  console.log(`  sections                 ${sections}`);
  console.log(`  sections embedded        ${embedded}`);

  const unread = db
    .prepare(
      `SELECT u.reason, COUNT(*) c FROM unread_document u
       JOIN document d ON d.id = u.document_id JOIN instrument i ON i.id = d.instrument_id
       WHERE i.economy_code = ? GROUP BY u.reason ORDER BY c DESC`,
    )
    .all(economy) as { reason: string; c: number }[];
  if (unread.length) {
    console.log(`  documents nothing could be read out of:`);
    for (const u of unread) console.log(`    ${u.reason.padEnd(24)} ${u.c}`);
  }

  // The discard ledger is append-only on purpose -- it is the record of what this system failed to
  // read and why, and a failure that gets quietly erased on the next attempt is exactly the kind of
  // thing that made v1's coverage claims unfalsifiable. But an attempt that later succeeded is not
  // a gap in the corpus, and counting it as one overstates the damage: three Acts refused by a
  // throttling host on 6 September were all read on the next run, while the summary went on
  // reporting three documents set aside. So the ledger keeps everything and the summary splits it.
  const discards = db
    .prepare(
      `SELECT d.reason,
              SUM(CASE WHEN doc.id IS NULL THEN 1 ELSE 0 END) AS still_missing,
              COUNT(*) AS total
         FROM discard d
         LEFT JOIN instrument i ON i.source_url = d.subject AND i.economy_code = ?
         LEFT JOIN document doc ON doc.instrument_id = i.id
        WHERE d.stage IN ('fetch', 'parse')
        GROUP BY d.reason
        ORDER BY still_missing DESC, total DESC`,
    )
    .all(economy) as { reason: string; still_missing: number; total: number }[];

  const missing = discards.filter((d) => d.still_missing > 0);
  if (missing.length) {
    console.log(`  set aside and still unread:`);
    for (const d of missing) console.log(`    ${d.reason.padEnd(24)} ${d.still_missing}`);
  }
  const recovered = discards.reduce((n, d) => n + (d.total - d.still_missing), 0);
  if (recovered > 0) {
    console.log(`  set aside on an earlier attempt, read since: ${recovered}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();
  const profile = loadProfile(args.economy);

  console.log(`${profile.name} (${profile.code})`);
  console.log(`  ${profile.legalSystem.family}, law published in ${profile.officialLanguages.join(', ')}`);
  console.log(`  ${profile.portals.length} portal(s), ${profile.portals.filter((p) => p.adapter).length} with a discovery adapter`);
  applyProfile(db, profile);

  if (args.status) {
    status(db, profile.code);
    return;
  }

  const fetcher = new Fetcher({
    db,
    sourceMode: args.sourceMode,
    ...(args.delayMs ? { minDelayMs: args.delayMs } : {}),
    onLog: (l) => console.log(l),
  });

  if (args.register) {
    console.log(`\nRegister -- walking the portals${args.portal ? ` matching "${args.portal}"` : ''}`);
    const results = await register(db, profile, fetcher, (l) => console.log(l), {
      ...(args.portal ? { portalLike: args.portal } : {}),
    });
    for (const r of results) {
      if (r.error) console.log(`  ${r.portal}: ${r.error}`);
    }
  }

  // --about and --pillars rank the register and read only what they name. This is the
  // ordinary path: Singapore's register is 6,365 instruments, its Acts alone cost 1,048 requests,
  // and any one cell turns on a handful of them. Reading in registration order is for building a
  // corpus, which is a different job with a different budget.
  let shortlisted: number[] | null = null;
  if (args.about || args.pillars) {
    // Per indicator, not per pillar: a shortlist of 15 shared across a pillar's five indicators
    // gives each of them three, and 7.3's retention Act is nothing like 7.5's access powers.
    const asked: { label: string; queries: string[] }[] = [];
    if (args.about) asked.push({ label: args.about, queries: [args.about] });
    if (args.pillars) {
      const rubric = loadRubric();
      for (const p of args.pillars) {
        for (const ind of indicatorsOfPillar(p, rubric)) {
          asked.push({ label: `${ind.id} ${ind.category}`, queries: queriesFor(ind) });
        }
      }
    }

    console.log(`
Shortlist -- ranking the register against ${asked.length} question(s), ${args.top} each`);
    const built = await buildInstrumentIndex(db, { economy: profile.code, log: (l) => console.log(l) });
    if (built.embedded) console.log(`  embedded ${built.embedded} title(s)`);

    const union = new Map<number, string>();
    for (const ask of asked) {
      const candidates = await shortlistInstruments(db, {
        economy: profile.code,
        queries: ask.queries,
        limit: args.top,
        ...(args.kind ? { kind: args.kind } : {}),
      });
      console.log(`  ${ask.label}`);
      for (const c of candidates) {
        console.log(`    ${String(c.rank).padStart(3)}. ${c.read ? 'have' : '    '} ${c.title}  [${c.channels.join('+')}]`);
        if (!union.has(c.instrumentId)) union.set(c.instrumentId, c.title);
      }
    }
    shortlisted = [...union.keys()];
    console.log(`  ${shortlisted.length} distinct instrument(s) to read`);
    if (!shortlisted.length) console.log('  nothing in the register matched, so nothing will be fetched');
  }

  if (args.read !== null) {
    console.log(`\nRead -- fetching and parsing${shortlisted ? ` ${shortlisted.length} shortlisted` : args.read ? ` up to ${args.read}` : ' every'} instrument${args.kind ? ` of kind ${args.kind}` : ''}${args.title ? ` matching "${args.title}"` : ''}`);
    const results = await materialise(db, profile, fetcher, {
      ...(args.read ? { limit: args.read } : {}),
      ...(args.title ? { titleLike: args.title } : {}),
      ...(args.kind ? { kind: args.kind } : {}),
      ...(shortlisted ? { instrumentIds: shortlisted } : {}),
      ...(args.parser
        ? {
            instrumentIds: (db
              .prepare(
                `SELECT DISTINCT d.instrument_id id FROM document d
                   JOIN document_text dt ON dt.document_id = d.id
                   JOIN instrument i ON i.id = d.instrument_id
                  WHERE i.economy_code = ? AND dt.parser = ?`,
              )
              .all(args.economy, args.parser) as { id: number }[])
              .map((r) => r.id)
              .filter((id) => !shortlisted || shortlisted.includes(id))
              // An empty list is read as no filter at all, which would re-parse the economy.
              .concat([0]),
          }
        : {}),
      refresh: args.refresh,
      reparse: args.reparse,
      unreadOnly: args.unread,
      log: (l) => console.log(l),
    });
    const by = (o: string) => results.filter((r) => r.outcome === o).length;
    console.log(`  ${by('parsed')} parsed, ${by('unread')} unread, ${by('error')} failed`);
    // A failure is not a statistic. Re-parsing Malaysia ended "1404 parsed, 20 unread, 162 failed"
    // and exited 0, and the 162 were not a random 162: a document a past answer cites cannot have
    // its sections deleted, so the ones that refused to re-parse were very nearly all of the ones
    // the cells rest on. The run looked like it had worked. Exit code, not prose -- and set rather
    // than thrown, so the index and status stages below still run and still show the corpus.
    if (by('error') > 0) {
      console.log(`  a parse that failed is a failure: exiting non-zero. If these are foreign key`);
      console.log(`  errors, the citations are still attached -- see "npm run -w backend reanchor".`);
      process.exitCode = 1;
    }
    // Kept separate from "failed" on purpose. These were never asked for, so nothing is known
    // about them either way, and rolling them into a failure count would turn an interrupted run
    // into a corpus that looks like it has holes in it.
    if (by('not-attempted') > 0) {
      console.log(`  ${by('not-attempted')} not attempted -- the host stopped serving us. Re-run to continue.`);
    }
  }

  if (args.embed) {
    console.log(`\nIndex -- dense vectors from ${EMBEDDING_MODEL}`);
    try {
      if (!(await haveModel(EMBEDDING_MODEL))) {
        console.log(`  ${EMBEDDING_MODEL} is not installed. Run "ollama pull ${EMBEDDING_MODEL}" and re-run with --embed.`);
      } else {
        const built = await buildDenseIndex(db, { economy: profile.code, log: (l) => console.log(l) });
        console.log(`  ${built.embedded} newly embedded, ${built.alreadyPresent} already in the index`);
      }
    } catch (err) {
      if (err instanceof OllamaUnavailable) console.log(`  ${err.message}`);
      else throw err;
    }
  }

  const { network, cached, disallowed, softBlocked, errors, bytes, wireBytes } = fetcher.stats;
  console.log(`\nFetching: ${network} over the network, ${cached} from cache, ` +
    `${disallowed} refused by robots.txt, ${softBlocked} refused by the host, ${errors} failed`);
  // Both numbers, because the gap between them is bandwidth we did not take off a government
  // server. Reporting only the document size hides whether compression is actually being used.
  const saved = bytes > 0 ? (1 - wireBytes / bytes) * 100 : 0;
  console.log(`          ${(bytes / 1_000_000).toFixed(1)} MB of documents, ` +
    `${(wireBytes / 1_000_000).toFixed(1)} MB actually transferred (${saved.toFixed(0)}% saved by compression)`);
  status(db, profile.code);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
