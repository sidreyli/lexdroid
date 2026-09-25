/**
 * Zone 1, measured -- and the measurements that failed silently until something else noticed.
 *
 *   npm run -w backend zone1-audit                     every economy with a corpus
 *   npm run -w backend zone1-audit -- --economy MYS    one of them
 *   npm run -w backend zone1-audit -- --report         never exit non-zero
 *
 * Zone 1 makes a claim: this is what the economy publishes, and this is what it says. Every cell
 * stands on that claim, and the ways it can be false are not crashes -- they are quiet partial
 * successes that look complete from outside. Re-parsing Malaysia ended "1404 parsed, 20 unread,
 * 162 failed" and exited 0, and the 162 were the documents a past answer cites, because those are
 * exactly the ones whose sections a foreign key will not let go. The signal was one word in one
 * line of log.
 *
 * So these are not tests. Each check produces a number, and the ones marked fatal fail the
 * command. Three need no threshold at all, because the corpus supplies its own control group: a
 * field's coverage on cited instruments against its coverage on read ones, a fallback parser's
 * section count against the parsers that were recognised, and a hash against the bytes it
 * addresses. A rule with a number in it is a rule somebody has to keep tuning.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../src/db/index.js';
import { CACHE_DIR } from '../src/fetch/index.js';
import { loadProfile, unheldCitations } from '../src/profile/index.js';
import type { InstrumentType } from '../src/profile/types.js';

const only = (() => {
  const i = process.argv.indexOf('--economy');
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
})();
const reportOnly = process.argv.includes('--report');

type Verdict = 'pass' | 'fail' | 'report';
const failures: string[] = [];

function check(id: string, title: string, fatal: boolean, verdict: Verdict, lines: string[]): void {
  const mark = verdict === 'pass' ? 'ok  ' : verdict === 'report' ? '--  ' : 'FAIL';
  console.log(`\n${mark} ${id}  ${title}${fatal && verdict === 'fail' ? '   [fatal]' : ''}`);
  for (const l of lines) console.log(`       ${l}`);
  if (fatal && verdict === 'fail') failures.push(`${id} ${title}`);
}

const db = openDb();
const rows = <T>(sql: string, ...p: unknown[]): T[] => db.prepare(sql).all(...p) as T[];
const one = <T>(sql: string, ...p: unknown[]): T => db.prepare(sql).get(...p) as T;
const pct = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 1000) / 10);

const economies = rows<{ e: string }>(
  `SELECT DISTINCT economy_code AS e FROM instrument ORDER BY economy_code`,
)
  .map((r) => r.e)
  .filter((e) => !only || e === only);

// An economy with nothing parsed cannot answer the parse and index checks, and saying so is not
// the same as passing them.
const withCorpus = economies.filter(
  (e) =>
    one<{ n: number }>(
      `SELECT COUNT(*) n FROM section s JOIN document d ON d.id = s.document_id
        JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`,
      e,
    ).n > 0,
);
const holds = economies.map(() => '?').join(',');

console.log(`Zone 1 audit -- ${economies.join(', ')}`);
const unparsed = economies.filter((e) => !withCorpus.includes(e));
if (unparsed.length > 0) console.log(`  registered but nothing parsed: ${unparsed.join(', ')}`);

/* ---------------------------------------------------------------- A. the profile */

{
  const bad: string[] = [];
  for (const e of economies) {
    const declared = new Set(loadProfile(e).instrumentTypes.map((t) => t.kind));
    for (const k of rows<{ kind: string | null; n: number }>(
      `SELECT kind, COUNT(*) n FROM instrument WHERE economy_code = ? GROUP BY kind`,
      e,
    )) {
      if (k.kind === null || !declared.has(k.kind as InstrumentType['kind'])) {
        bad.push(`${e} holds ${k.n} instrument(s) of kind ${k.kind ?? 'NULL'}, undeclared by its profile`);
      }
    }
  }
  check('A3', 'every kind in the register is declared with a bindingness', true, bad.length ? 'fail' : 'pass',
    bad.length ? bad : ['an undeclared kind is never ruled out as advisory, so it is read as binding']);
}

{
  const holes = rows<{ detail: string }>(
    `SELECT detail FROM discard WHERE stage = 'discover' AND reason = 'portal-yielded-nothing'`);
  check('A2', 'a portal walked that published nothing is recorded as a hole', false, 'report',
    holes.length ? holes.map((h) => h.detail) : ['every walked portal listed something']);
}

{
  // Not fatal, and not a pass either: holding one tier is a scope, and this measures what that
  // scope costs -- how often the law we hold points at law we do not, and whether an answer does.
  const cited = new Set(rows<{ id: number }>(`SELECT DISTINCT section_id AS id FROM answer_basis`).map((r) => r.id));
  const out: string[] = [];
  for (const e of withCorpus) {
    const scope = loadProfile(e).jurisdictionScope;
    if (!scope) {
      out.push(`${e}  no jurisdiction scope declared: which tier of law the corpus holds is unstated`);
      continue;
    }
    if (scope.notHeld.length === 0) {
      out.push(`${e}  holds ${scope.held} law, and declares no other tier`);
      continue;
    }
    const byTier = new Map<string, { sections: number; cited: number; names: Map<string, number> }>();
    const q = db.prepare(
      `SELECT s.id, s.text FROM section s JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`,
    );
    for (const r of q.iterate(e) as Iterable<{ id: number; text: string }>) {
      const hits = unheldCitations(scope, r.text);
      for (const tier of new Set(hits.map((h) => h.tier))) {
        const t = byTier.get(tier) ?? { sections: 0, cited: 0, names: new Map() };
        t.sections += 1;
        if (cited.has(r.id)) t.cited += 1;
        byTier.set(tier, t);
      }
      for (const h of hits) {
        const t = byTier.get(h.tier)!;
        t.names.set(h.cited, (t.names.get(h.cited) ?? 0) + 1);
      }
    }
    out.push(`${e}  holds ${scope.held} law`);
    for (const nh of scope.notHeld) {
      const t = byTier.get(nh.tier);
      if (!t) {
        out.push(`      ${nh.tier}: cited nowhere in the corpus`);
        continue;
      }
      const top = [...t.names].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, k]) => `${n} (${k})`);
      out.push(`      ${nh.tier}: cited in ${t.sections} section(s), ${t.cited} of them one an answer rests on`);
      out.push(`        most cited: ${top.join('; ')}`);
    }
  }
  check('A4', 'the tier of law the corpus does not hold is declared, and what cites it is counted', false,
    'report', out);
}

/* --------------------------------------------------------------- B. the register */

{
  const short = rows<{ n: number; detail: string }>(
    `SELECT COUNT(*) n, MIN(detail) detail FROM discard
      WHERE stage = 'discover' AND reason = 'listed-no-document-link'
      GROUP BY substr(detail, 1, instr(detail, ' -- '))`);
  check('B1', 'a listing entry that carries no document is named, not counted and dropped', false, 'report',
    short.length
      ? short.map((s) => `${s.n} unlinked -- e.g. ${s.detail.slice(0, 96)}`)
      : ['nothing recorded yet; this fills on the next walk of a catalogue-shaped portal']);
}

{
  const out: string[] = [];
  let bad = false;
  for (const e of economies) {
    const groups = one<{ n: number }>(
      `SELECT COUNT(*) n FROM (SELECT title FROM instrument WHERE economy_code = ?
         GROUP BY title HAVING COUNT(DISTINCT source_url) > 1)`, e).n;
    const doubled = rows<{ title: string; n: number }>(
      `WITH dup AS (SELECT title FROM instrument WHERE economy_code = ?
                     GROUP BY title HAVING COUNT(DISTINCT source_url) > 1)
       SELECT i.title, COUNT(DISTINCT i.id) n FROM instrument i JOIN dup ON dup.title = i.title
        WHERE i.economy_code = ? AND i.id IN (SELECT instrument_id FROM answer_basis)
        GROUP BY i.title HAVING COUNT(DISTINCT i.id) > 1`, e, e);
    out.push(`${e}  ${groups} title(s) under more than one url, ${doubled.length} cited under two of them`);
    for (const d of doubled) out.push(`      ${d.n}x  ${d.title.slice(0, 80)}`);
    if (doubled.length > 0) bad = true;
  }
  check('B2', 'no answer rests on one instrument registered twice', false, bad ? 'report' : 'pass', out);
}

{
  // The gate that needs no threshold. A field the pipeline fills should be filled on the
  // instruments the pipeline leaned on hardest at least as often as on everything it read. When it
  // is not, something selected against them: Malaysia's amendment dates ran 23.5% of read
  // instruments and 0.6% of cited ones after a re-parse whose failures were, precisely, the
  // documents an answer cites.
  //
  // Compared like with like -- each cited instrument against read instruments of its own portal and
  // kind -- because what a source never publishes for a class is not the pipeline losing it. Taken
  // whole, the cited set failed on Malaysia's status basis only because the answers lean on the data
  // protection codes, whose portal says nothing of standing for any of them, and on Singapore's
  // numbers only because they lean on Acts older than the timeline SSO keeps.
  const fields = ['status_basis', 'commenced_on', 'last_amended_on', 'current_to', 'official_number'];
  const out: string[] = [];
  let bad = false;
  for (const e of withCorpus) {
    for (const f of fields) {
      const strata = rows<{ n: number; have: number; cn: number; chave: number }>(
        `SELECT COUNT(*) n, SUM(${f} IS NOT NULL) have,
                SUM(id IN (SELECT instrument_id FROM answer_basis)) cn,
                SUM(id IN (SELECT instrument_id FROM answer_basis) AND ${f} IS NOT NULL) chave
           FROM instrument WHERE economy_code = ? AND id IN (SELECT instrument_id FROM document)
          GROUP BY discovered_via, kind`, e);
      let expected = 0, have = 0, cited = 0, read = 0, readHave = 0;
      for (const s of strata) {
        expected += s.cn * ((s.have ?? 0) / s.n);
        have += s.chave ?? 0;
        cited += s.cn ?? 0;
        read += s.n;
        readHave += s.have ?? 0;
      }
      // A field no adapter for this economy ever fills is not evidence of selection against it.
      if (cited === 0 || readHave === 0) continue;
      const short = have < Math.round(expected);
      if (short) bad = true;
      out.push(
        `${e} ${f.padEnd(17)} cited ${String(have).padStart(4)} of ${String(cited).padStart(4)}, ` +
          `like-for-like ${String(Math.round(expected)).padStart(4)}` +
          `   (whole corpus ${String(pct(readHave, read)).padStart(5)}%, cited ${String(pct(have, cited)).padStart(5)}%)` +
          (short ? '   <-- worse where it matters most' : ''),
      );
    }
  }
  check('B3', 'a field is no worse covered on cited instruments than on read ones of their own source and kind', true,
    bad ? 'fail' : 'pass', out);
}

/* ------------------------------------------------------------------ C. the fetch */

{
  const cited = new Set(
    rows<{ id: number }>(`SELECT DISTINCT instrument_id id FROM answer_basis WHERE instrument_id IS NOT NULL`)
      .map((r) => r.id),
  );
  let checked = 0;
  let missing = 0;
  let mismatch = 0;
  let citedBad = 0;
  const examples: string[] = [];
  for (const d of rows<{ id: number; url: string; h: string; bytes: number; inst: number }>(
    `SELECT d.id, d.url, d.content_hash h, d.bytes, d.instrument_id inst FROM document d
       JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code IN (${holds})`, ...economies)) {
    checked += 1;
    const p = join(CACHE_DIR, 'blob', d.h.slice(0, 2), d.h);
    if (!existsSync(p)) {
      missing += 1;
      if (cited.has(d.inst)) citedBad += 1;
      if (examples.length < 5) examples.push(`document ${d.id} hash ${d.h.slice(0, 12)} addresses nothing -- ${d.url.slice(0, 68)}`);
      continue;
    }
    if (statSync(p).size !== d.bytes) mismatch += 1;
    else if (createHash('sha256').update(readFileSync(p)).digest('hex') !== d.h) mismatch += 1;
  }
  check('C2', 'every document hash addresses stored bytes that hash to it', true,
    missing + mismatch > 0 ? 'fail' : 'pass',
    [
      `${checked} document(s): ${missing} address no blob, ${mismatch} address the wrong bytes`,
      `${citedBad} of the unaddressable belong to an instrument an answer cites`,
      ...examples,
    ]);
}

{
  const snaps = rows<{ host: string; disallow: string }>(`SELECT host, disallow FROM robots_snapshot`);
  const known = new Map(snaps.map((s) => [s.host, JSON.parse(s.disallow) as string[]]));
  const hosts = rows<{ host: string; n: number }>(
    `SELECT host, COUNT(*) n FROM fetch_log WHERE outcome = 'ok' GROUP BY host ORDER BY n DESC`);
  const unrecorded = hosts.filter((h) => !known.has(h.host));
  let violations = 0;
  const detail: string[] = [];
  for (const h of hosts) {
    const dis = known.get(h.host);
    if (!dis || dis.length === 0) continue;
    const bad = rows<{ url: string }>(`SELECT url FROM fetch_log WHERE host = ? AND outcome = 'ok'`, h.host)
      .filter((r) => {
        try {
          const path = new URL(r.url).pathname;
          return dis.some((d) => d.length > 0 && path.startsWith(d));
        } catch {
          return false;
        }
      });
    violations += bad.length;
    for (const b of bad.slice(0, 3)) detail.push(`${h.host} fetched a disallowed path: ${b.url.slice(0, 78)}`);
  }
  check('C3', 'no path a host disallowed was ever fetched', true,
    violations > 0 ? 'fail' : unrecorded.length > 0 ? 'report' : 'pass',
    [
      `${snaps.length} host(s) have their rules on record; ${hosts.length} host(s) were fetched from`,
      `${violations} fetch(es) of a path the recorded rules disallow`,
      ...(unrecorded.length > 0
        ? [
            `${unrecorded.length} host(s) were crawled before the rules were kept, so those are not replayable:`,
            ...unrecorded.slice(0, 6).map((h) => `   ${h.host} (${h.n} fetches)`),
          ]
        : []),
      ...detail,
    ]);
}

/* ------------------------------------------------------------------ D. the parse */

{
  const out: string[] = [];
  let bad = false;
  for (const e of withCorpus) {
    const r = one<{ docs: number; neither: number; both: number }>(
      `SELECT COUNT(*) docs,
              SUM(CASE WHEN sc.n IS NULL AND u.document_id IS NULL THEN 1 ELSE 0 END) neither,
              SUM(CASE WHEN sc.n IS NOT NULL AND u.document_id IS NOT NULL THEN 1 ELSE 0 END) both
         FROM document d JOIN instrument i ON i.id = d.instrument_id
         LEFT JOIN (SELECT document_id, COUNT(*) n FROM section GROUP BY 1) sc ON sc.document_id = d.id
         LEFT JOIN unread_document u ON u.document_id = d.id
        WHERE i.economy_code = ?`, e);
    out.push(`${e}  ${r.docs} document(s), ${r.neither} with neither sections nor a reason, ${r.both} with both`);
    if (r.neither > 0 || r.both > 0) bad = true;
  }
  check('D1', 'a document has sections, or a recorded reason it has none', true, bad ? 'fail' : 'pass', out);
}

{
  // The other threshold-free gate. A parser that records which path it took has already said
  // where it gave up, so a fallback yielding a fraction of the provisions its recognised siblings
  // do is not parsing, it is storing. Counted per 10,000 characters of text rather than per
  // document: what falls back is mostly short notices, and a one-page notice that is one section
  // is read correctly, so a per-document mean failed the parser for the length of what it was given.
  const out: string[] = [];
  let bad = false;
  for (const e of withCorpus) {
    const byParser = rows<{ parser: string; docs: number; spd: number; density: number; cited: number }>(
      `SELECT dt.parser, COUNT(DISTINCT d.id) docs, AVG(sc.n) spd,
              SUM(sc.n) * 10000.0 / MAX(1, SUM(length(dt.text))) density,
              COUNT(DISTINCT CASE WHEN d.instrument_id IN (SELECT instrument_id FROM answer_basis)
                                  THEN d.id END) cited
         FROM document d JOIN instrument i ON i.id = d.instrument_id
         JOIN document_text dt ON dt.document_id = d.id
         JOIN (SELECT document_id, COUNT(*) n FROM section GROUP BY 1) sc ON sc.document_id = d.id
        WHERE i.economy_code = ? GROUP BY dt.parser ORDER BY docs DESC`, e);
    if (byParser.length < 2) continue;
    const total = byParser.reduce((a, b) => a + b.docs, 0);
    const best = Math.max(...byParser.map((p) => p.density));
    const bestName = byParser.find((p) => p.density === best)?.parser ?? '';
    for (const p of byParser) {
      const line =
        `${e} ${p.parser.padEnd(14)} ${String(p.docs).padStart(5)} docs ` +
        `(${String(pct(p.docs, total)).padStart(5)}%)  ${p.spd.toFixed(1).padStart(6)} sections/doc ` +
        `${p.density.toFixed(2).padStart(6)} per 10k chars  ${p.cited} cited`;
      if (/generic|fallback/.test(p.parser) && p.density * 4 < best) {
        bad = true;
        out.push(`${line}   <-- fallback, ${(best / p.density).toFixed(0)}x fewer than ${bestName}`);
      } else {
        out.push(line);
      }
    }
  }
  check('D7', 'a fallback parser yields as many provisions as the parsers that were recognised', true,
    bad ? 'fail' : 'pass', out);
}

{
  const out: string[] = [];
  for (const e of withCorpus) {
    const b = one<{ small: number; mid: number; big: number; largest: number }>(
      `SELECT SUM(len < 2000) small, SUM(len >= 2000 AND len < 20000) mid,
              SUM(len >= 20000) big, MAX(len) largest
         FROM (SELECT MAX(length(s.text)) len FROM section s
                 JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
                WHERE i.economy_code = ? GROUP BY s.document_id HAVING COUNT(*) = 1)`, e);
    out.push(`${e}  one-section documents: ${b.small ?? 0} under 2k, ${b.mid ?? 0} 2k-20k, ${b.big ?? 0} over 20k, largest ${b.largest ?? 0} chars`);
  }
  out.push('length alone does not separate a blob from a genuinely short instrument, which is why');
  out.push('the gate sits on D7 -- the parser already recorded which path it took');
  check('D2', 'a document that parsed into one lump is reported', false, 'report', out);
}

{
  let checked = 0;
  let broken = 0;
  const examples: string[] = [];
  for (const d of rows<{ id: number; text: string }>(
    `SELECT dt.document_id id, dt.text FROM document_text dt
       JOIN document d ON d.id = dt.document_id JOIN instrument i ON i.id = d.instrument_id
      WHERE i.economy_code IN (${withCorpus.map(() => '?').join(',')})`, ...withCorpus)) {
    for (const s of rows<{ id: number; a: number; b: number; text: string }>(
      `SELECT id, char_start a, char_end b, text FROM section WHERE document_id = ?`, d.id)) {
      checked += 1;
      if (d.text.slice(s.a, s.b) !== s.text) {
        broken += 1;
        if (examples.length < 5) examples.push(`section ${s.id} of document ${d.id} does not slice out of its own text`);
      }
    }
  }
  check('D3', 'every section slices out of its own document at the offsets it records', true,
    broken > 0 ? 'fail' : 'pass',
    [`${checked} section(s) checked, ${broken} whose offsets do not reproduce their text`, ...examples]);
}

/**
 * The container a section is filed under, for the checks below: its heading path without its own
 * last step. An annex numbers its points afresh, so labels are unique per container, not per document.
 */
const containerOf = (path: string): string => path.split(' > ').slice(0, -1).join(' > ');

{
  // Two provisions under one label in one container is how "Статья 101" sat beside article 10¹, and
  // how the Anti-Corruption Law held two article 21s: a citation of that label resolves to either.
  // Reported rather than fatal, because sources repeat numbers themselves -- a Mongolian procedure
  // numbers two points 3.6 -- and a parser that renumbered them would be citing what the page does
  // not say. The count is the thing to watch: it should be small and every entry explainable.
  const out: string[] = [];
  for (const e of withCorpus) {
    let docs = 0;
    const examples: string[] = [];
    for (const d of rows<{ id: number }>(
      `SELECT d.id FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`, e)) {
      const seen = new Set<string>();
      const dup = new Set<string>();
      for (const s of rows<{ label: string | null; hp: string }>(
        'SELECT label, heading_path hp FROM section WHERE document_id = ? AND label IS NOT NULL', d.id)) {
        const k = `${containerOf(s.hp)}\u0000${s.label}`;
        if (seen.has(k)) dup.add(s.label!);
        seen.add(k);
      }
      if (dup.size > 0) {
        docs += 1;
        if (examples.length < 3) examples.push(`   document ${d.id}: ${[...dup].slice(0, 6).join(', ')}`);
      }
    }
    out.push(`${e}  ${docs} document(s) with a label twice in one container`, ...examples);
  }
  check('D4', 'no label names two provisions in one container', false, 'report', out);
}

{
  // What a portal prints around a document, found inside its text: the parser read the page rather
  // than the document. Each pattern is a piece of furniture measured on the portal it comes from.
  const FURNITURE: { name: string; pattern: RegExp }[] = [
    { name: 'legalinfo.mn toolbar', pattern: /(?:^|\n)(?:Сонсох \/ Сонгосон утга сонсох|Хуваалцах)(?:\n|$)/u },
    { name: 'legalinfo.mn contact line', pattern: /976\)-11-323317|info@legalinstitute\.mn/u },
    { name: 'IPS viewer residue', pattern: /MicrosoftInternetExplorer4|@page\s+vert|mso-page-orientation/u },
    { name: 'gazette viewer page count', pattern: /Страница № \d+ из \d+/u },
    { name: 'zero-width characters', pattern: /[​-‍﻿]/u },
  ];
  const out: string[] = [];
  let bad = false;
  for (const e of withCorpus) {
    for (const f of FURNITURE) {
      const n = rows<{ text: string }>(
        `SELECT dt.text FROM document_text dt JOIN document d ON d.id = dt.document_id
           JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`, e,
      ).filter((r) => f.pattern.test(r.text)).length;
      if (n > 0) {
        bad = true;
        out.push(`${e}  ${n} document(s) carrying ${f.name}`);
      }
    }
  }
  if (!bad) out.push('no document carries the furniture of the portal it came from');
  check('D6', 'no document carries its portal\'s furniture', true, bad ? 'fail' : 'pass', out);
}

{
  // A document whose text names a chapter, where no section is filed under one. Chapter detection
  // failed silently once already: `/\bБҮЛЭГ/` never matches beside Cyrillic, and every heading path
  // of the Anti-Corruption Law simply looked like a law with no chapters.
  // Lao in every spelling OCR has been measured producing for ໝ -- the same list parse/lao.ts reads.
  const CHAPTER_WORD = /(?:^|\n)(?:\S+\s+)?\S*(?:дугаар|дүгээр)\s+бүлэг|(?:^|\n)(?:Глава|ГЛАВА)\s+\d|(?:^|\n)(?:ໝ|ຫມ|ບນ|ຫນ|ບຫ|ຫພ|ຫ)ວດ\s*ທີ\s*[\d໐-໙]/iu;
  const out: string[] = [];
  let bad = false;
  for (const e of withCorpus) {
    const docs = rows<{ id: number; text: string }>(
      `SELECT d.id, dt.text FROM document_text dt JOIN document d ON d.id = dt.document_id
         JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`, e,
    ).filter((d) => CHAPTER_WORD.test(d.text));
    const flat = docs.filter(
      (d) => !rows<{ hp: string }>('SELECT heading_path hp FROM section WHERE document_id = ?', d.id)
        .some((s) => containerOf(s.hp) !== ''),
    );
    out.push(`${e}  ${docs.length} document(s) naming a chapter, ${flat.length} with no section filed under one`);
    for (const d of flat.slice(0, 3)) out.push(`   document ${d.id}`);
    if (flat.length > 0) bad = true;
  }
  check('D8', 'a document that names its chapters files its provisions under them', true, bad ? 'fail' : 'pass', out);
}

/* ------------------------------------------------------------------ E. the index */

{
  const out: string[] = [];
  let bad = false;
  for (const e of withCorpus) {
    const c = one<{ total: number; embedded: number }>(
      `SELECT COUNT(*) total, SUM(se.section_id IS NOT NULL) embedded FROM section s
         JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
         LEFT JOIN section_embedding se ON se.section_id = s.id WHERE i.economy_code = ?`, e);
    const gap = one<{ n: number }>(
      `SELECT COUNT(DISTINCT ab.section_id) n FROM answer_basis ab
         JOIN section s ON s.id = ab.section_id JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id
        WHERE i.economy_code = ? AND ab.section_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM section_embedding WHERE section_id = ab.section_id)`, e);
    out.push(
      `${e}  ${c.embedded ?? 0} of ${c.total} section(s) embedded (${pct(c.embedded ?? 0, c.total)}%), ` +
      `${gap.n} cited section(s) with no vector`);
    if (gap.n > 0) bad = true;
  }
  check('E1', 'a provision an answer rests on carries a vector', true, bad ? 'fail' : 'pass', out);
}

{
  const models = rows<{ model: string; dims: number; n: number }>(
    `SELECT model, dims, COUNT(*) n FROM section_embedding GROUP BY 1, 2`);
  check('E2', 'one embedding model, one dimensionality, across the corpus', true,
    models.length > 1 ? 'fail' : 'pass',
    models.map((m) => `${m.model} at ${m.dims} dims: ${m.n} vector(s)`));
}

{
  const fts = one<{ n: number }>(`SELECT COUNT(*) n FROM section_fts`).n;
  const live = one<{ n: number }>(`SELECT COUNT(*) n FROM section_fts f JOIN section s ON s.id = f.rowid`).n;
  const secs = one<{ n: number }>(`SELECT COUNT(*) n FROM section`).n;
  check('E3', 'the lexical index holds one row per section and none for sections that are gone', true,
    fts === secs && live === secs ? 'pass' : 'fail',
    [
      `${secs} section(s), ${fts} index row(s): ${fts - live} orphaned, ${secs - live} never indexed`,
      'the index is contentless, so a deleted section leaves its row behind and bm25 then weighs',
      'every term against a corpus that still contains it',
    ]);
}

console.log('');
if (failures.length === 0) {
  console.log('every fatal check passed.');
} else {
  console.log(`${failures.length} fatal check(s) failed:`);
  for (const f of failures) console.log(`  ${f}`);
  if (!reportOnly) process.exitCode = 1;
}
db.close();
