/**
 * Zone 0 -- the economy profile, and the search over the corpus it makes possible.
 */
import { describe, expect, it } from 'vitest';
import { openDb, indexSections } from '../src/db/index.js';
import { applyProfile, availableProfiles, loadProfile } from '../src/profile/index.js';
import { ftsQuery, ftsPhrase, fuse } from '../src/index/index.js';
import { verifyOffsets } from '../src/parse/index.js';
import { canonicalizeThai } from '../src/util/thai.js';
import { economyNames } from '../src/profile/index.js';
import { loadRubric } from '../src/rubric/index.js';
import { queriesFor } from '../src/retrieve/index.js';
import { MIN_TRIGRAM_TERM } from '../src/db/index.js';

describe('the economy profile', () => {
  it('has one for every economy in scope', () => {
    expect(availableProfiles()).toEqual(expect.arrayContaining(['AUS', 'IND', 'MYS', 'SGP']));
  });

  it('keeps India Central, bilingual and backed by a readable legislation register', () => {
    const p = loadProfile('IND');
    expect(p.name).toBe('India');
    expect(p.officialLanguages).toEqual(expect.arrayContaining(['hi', 'en']));
    expect(p.portals.some((x) => x.url === 'https://indiacode.gov.in' && x.adapter === 'indiacode')).toBe(true);
    const indiaCode = p.portals.find((x) => x.adapter === 'indiacode')!;
    expect(indiaCode.adapterConfig['jurisdiction']).toBe('CENTRAL');
  });

  it('describes the Singapore legal system, its languages and its portals', () => {
    const p = loadProfile('SGP');
    expect(p.legalSystem.family).toBe('common-law');
    expect(p.officialLanguages).toContain('en');
    expect(p.portals.length).toBeGreaterThanOrEqual(5);
    expect(p.portals.some((x) => x.kind === 'legislation-database' && x.adapter === 'sso')).toBe(true);
    expect(p.portals.some((x) => x.kind === 'gazette')).toBe(true);
  });

  it('ranks instrument types, so rank is never confused with coverage', () => {
    // The Malaysia failure in v1: Acts scored below a central-bank circular because the tool had
    // no model of either. An Act outranks a Notice, and a Notice is still evidence.
    const p = loadProfile('SGP');
    const act = p.instrumentTypes.find((t) => t.kind === 'act')!;
    const notice = p.instrumentTypes.find((t) => t.kind === 'notice')!;
    const guideline = p.instrumentTypes.find((t) => t.kind === 'guideline')!;
    expect(act.rank).toBeLessThan(notice.rank);
    expect(act.bindingness).toBe('binding');
    expect(notice.bindingness).toBe('binding-on-licensees');
    expect(guideline.bindingness).toBe('advisory');
  });

  it('writes the economy, its portals and its commitments into the store', () => {
    const db = openDb(':memory:');
    applyProfile(db, loadProfile('SGP'));
    applyProfile(db, loadProfile('SGP')); // idempotent: re-profiling is the normal case

    const economy = db.prepare('SELECT * FROM economy WHERE code = ?').get('SGP') as { name: string; official_languages: string };
    expect(economy.name).toBe('Singapore');
    expect(JSON.parse(economy.official_languages)).toContain('en');

    const portals = db.prepare('SELECT COUNT(*) c FROM portal WHERE economy_code = ?').get('SGP') as { c: number };
    expect(portals.c).toBeGreaterThanOrEqual(5);

    const commitments = db.prepare('SELECT COUNT(*) c FROM commitment WHERE economy_code = ?').get('SGP') as { c: number };
    expect(commitments.c).toBeGreaterThan(0);
    db.close();
  });

  it('writes the India profile without sharing Singapore state', () => {
    const db = openDb(':memory:');
    applyProfile(db, loadProfile('IND'));
    const economy = db.prepare('SELECT name, official_languages FROM economy WHERE code = ?').get('IND') as {
      name: string;
      official_languages: string;
    };
    expect(economy.name).toBe('India');
    expect(JSON.parse(economy.official_languages)).toEqual(['hi', 'en']);
    const portal = db.prepare('SELECT name FROM portal WHERE economy_code = ? AND url = ?')
      .get('IND', 'https://indiacode.gov.in') as { name: string };
    expect(portal.name).toBe('India Code');
    db.close();
  });

  it('keeps a null-adapter Thai portal note as a one-line summary with a doc pointer, not a re-inlined investigation', () => {
    // The gap-documentation convention agreed for Thailand (see thailand-integration-plan.md's
    // "Conventions" note): full investigative detail -- chunk filenames, HTTP codes, confidence
    // ratings -- lives in the plan doc / adapter spec, not back in the profile JSON. This locks
    // that convention in so a future edit can't silently drift the notes field back to a wall of
    // prose the way earlier drafts of this profile did.
    const MAX_NULL_ADAPTER_NOTE_LENGTH = 600;
    const p = loadProfile('THA');
    const nullAdapterPortals = p.portals.filter((x) => x.adapter === null);
    expect(nullAdapterPortals.length).toBeGreaterThan(0);
    for (const portal of nullAdapterPortals) {
      expect(portal.notes, `${portal.name} has no notes`).toBeTruthy();
      expect(
        portal.notes!.length,
        `${portal.name}'s note is ${portal.notes!.length} chars -- investigative detail belongs in the plan doc, not here`,
      ).toBeLessThanOrEqual(MAX_NULL_ADAPTER_NOTE_LENGTH);
      expect(
        /docs\/thailand-integration-plan\.md|docs\/thailand-ocs-adapter-spec\.md/.test(portal.notes!),
        `${portal.name}'s note doesn't point to a doc with the full trace`,
      ).toBe(true);
    }
  });
});

describe('building a query the index can actually match', () => {
  it('drops terms shorter than a trigram, which cannot match at all', () => {
    // A two-character term returns nothing and says nothing about why. Dropping it here means the
    // rest of the query still runs.
    expect(ftsQuery('to be or in')).toBeNull();
    expect(ftsQuery('data in SG')).toBe('"data"');
  });

  it('quotes every term, because legal text is full of FTS5 syntax', () => {
    // "personal data OR trade secrets" is a phrase in a rubric and an operator in FTS5.
    expect(ftsQuery('personal data OR trade secrets')).toBe('"personal" OR "data" OR "trade" OR "secrets"');
    expect(ftsPhrase('cross-border transfer')).toBe('"cross border transfer"');
  });

  it('expands a spaceless Thai run into overlapping trigrams instead of one unmatchable phrase', () => {
    // "ข้อมูลส่วนบุคคล" (personal data) has no spaces -- the whole naive split before this fix
    // would submit it to FTS5 as one 15-character quoted phrase, which the trigram tokenizer can
    // only satisfy by an exact contiguous match. Expanding it into overlapping 3-character trigrams
    // is the same unit the index itself is built from.
    const q = ftsQuery('ข้อมูลส่วนบุคคล');
    expect(q).toBe(
      '"ข้อ" OR "้อม" OR "อมู" OR "มูล" OR "ูลส" OR "ลส่" OR "ส่ว" OR "่วน" OR "วนบ" OR "นบุ" OR "บุค" OR "ุคค" OR "คคล"',
    );
  });

  it('keeps a Thai combining mark attached to the letter before it, not as a token boundary', () => {
    // A Thai tone mark or vowel sign is Unicode category Mark, not Letter. Splitting on "not a
    // letter or number" (without also keeping marks) tears every real Thai word apart at its own
    // diacritics before the trigram expansion ever runs -- verified directly: without \p{M} in the
    // split, "ข้อมูลส่วนบุคคล" fragments into ['ข','อม','ลส','วนบ','คคล'], and the length-3 filter
    // then drops all but the last two, losing 10 of the word's 15 code points. With \p{M} included,
    // the whole word survives as one run before expansion.
    const q = ftsQuery('ข้อมูลส่วนบุคคล');
    expect(q).not.toBeNull();
    expect(q!.split(' OR ')).toHaveLength(13);
  });

  it('matches Thai text the same way whichever Unicode form of SARA AM it was typed or extracted in', () => {
    // SARA AM (the vowel in น้ำ, "water") is one precomposed code point, U+0E33 -- but different
    // Thai input methods, fonts and OCR engines also produce the decomposed sequence NIKHAHIT +
    // SARA AA, U+0E4D U+0E32. Unicode defines no canonical decomposition for Thai combining marks,
    // so plain `.normalize('NFC')` does NOT collapse these (verified directly), unlike the
    // Latin-diacritic or Hangul equivalences NFC does cover. A document extracted with one form must
    // still match a query typed with the other.
    const composed = 'น้ำ'; // precomposed SARA AM
    const decomposed = 'น้ํา'; // decomposed: NIKHAHIT + SARA AA
    expect(composed).not.toBe(decomposed); // the two inputs really are different byte sequences
    const q1 = ftsQuery(composed);
    const q2 = ftsQuery(decomposed);
    expect(q1).not.toBeNull();
    expect(q1).toBe(q2);
  });

  it('keeps a word a phrase repeats, because the repetition is emphasis the phrase meant', () => {
    // bm25 counts a term once per appearance in the query, so a rubric phrase that says "data"
    // twice asks for data twice as loudly. That is the behaviour every score on record was measured
    // under. Deduplicating the whole term list changes 179 of the 331 distinct queries the rubric
    // puts to the economies we run, and measured against ESCAP's own citations at the width the
    // pipeline uses, it is a wash: four more cited instruments reached, three fewer in the top ten,
    // 43 cells reordered. A change that large and that undecided does not ride along inside a Thai
    // tokenizer fix, so the spaced-script path keeps every repetition.
    expect(ftsQuery('data protection and data security')).toBe('"data" OR "protection" OR "and" OR "data" OR "security"');
  });

  it('drops a trigram the expansion repeated, because that repetition is an artefact of the windows', () => {
    // The other half of the same rule. Overlapping windows over a repeating run produce the same
    // trigram again and again -- here two distinct windows, each landing three times -- and none of
    // those repeats came from the question. Only the expansion's own duplicates go.
    expect(ftsQuery('กขกขกข')).toBe('"กขก" OR "ขกข"');
  });

  it('caps an expanded query, because one spaceless word can become hundreds of terms', () => {
    // A 400-character run expands to nearly 400 trigrams, and FTS5 will not thank us for it. The cap
    // guards the expansion only: nothing a spaced script can write reaches 96 terms, and applying it
    // there would silently truncate a long rubric phrase instead.
    const alphabet = Array.from({ length: 46 }, (_, i) => String.fromCharCode(0x0e01 + i));
    let seed = 1;
    const long = Array.from({ length: 400 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648; // deterministic, so the test cannot flake
      return alphabet[seed % alphabet.length];
    }).join('');
    const q = ftsQuery(long);
    expect(q).not.toBeNull();
    expect(q!.split(' OR ')).toHaveLength(96);
  });

  it('builds the same term list master did for every query the rubric puts to the economies we score', () => {
    // The guard on the whole merge. Thai support changes four things about how a phrase becomes a
    // query -- NFC, SARA AM canonicalisation, keeping combining marks through the split, and trigram
    // expansion -- and none of them may alter a query in a spaced script, because AUS, MYS and SGP
    // have scores on record and a retrieval change would make the next run incomparable with them.
    // Argued is not good enough, so this asks the rubric for every query it would put to those three
    // economies and checks each one against master's term list, built here verbatim.
    const master = (phrase: string): string | null => {
      const terms = phrase.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= MIN_TRIGRAM_TERM);
      if (terms.length === 0) return null;
      return terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');
    };
    const rubric = loadRubric();
    const names = economyNames();
    const queries = new Set<string>();
    for (const code of ['AUS', 'MYS', 'SGP']) {
      for (const indicator of rubric.indicators) for (const q of queriesFor(indicator, names.get(code))) queries.add(q);
    }
    expect(queries.size).toBeGreaterThan(300); // the rubric really was asked, not silently empty
    const differing = [...queries].filter((q) => ftsQuery(q) !== master(q));
    expect(differing).toEqual([]);
  });
});

describe('canonicalizeThai on its own (unit-level, no database involved)', () => {
  it('collapses more than one decomposed SARA AM in the same string, not just the first', () => {
    // Two decomposed occurrences back to back -- a single global-flag regexp is easy to get wrong
    // (e.g. forgetting /g and only fixing the first one).
    const decomposed = 'น้ําน้ํา';
    expect(canonicalizeThai(decomposed)).toBe('น้ำน้ำ');
    // Each composed word is 3 code points (base consonant + tone mark + SARA AM); two of them is 6,
    // not 4 -- the point of this assertion is that both occurrences shrank by one code point each
    // (from 4 to 3), not just the first.
    expect(canonicalizeThai(decomposed).length).toBe(6);
    expect(decomposed.length).toBe(8);
  });

  it('leaves mixed Thai/Latin/digit text alone apart from the SARA AM sequence itself', () => {
    // Real section text routinely interleaves scripts: a citation, a year, a defined term in
    // English. Canonicalization must not touch anything outside the one specific sequence.
    const mixed = 'มาตรา 5 Section 5 (พ.ศ. 2560) น้ําดื่ม Drinking Water Act B.E. 2560';
    const result = canonicalizeThai(mixed);
    expect(result).toBe('มาตรา 5 Section 5 (พ.ศ. 2560) น้ำดื่ม Drinking Water Act B.E. 2560');
  });

  it('is a true no-op on empty and whitespace-only input', () => {
    expect(canonicalizeThai('')).toBe('');
    expect(canonicalizeThai('   \n\t  ')).toBe('   \n\t  ');
  });

  it('is a true no-op on text that is already precomposed -- nothing to collapse', () => {
    // The important property this locks in: canonicalizeThai must never touch text that has no
    // decomposed SARA AM in it. If it did (e.g. an overly broad regexp), that would silently
    // shorten unrelated text and reintroduce the exact offset-drift bug this fix exists to prevent.
    const alreadyComposed = 'น้ำมันเชื้อเพลิง'; // "fuel oil" -- precomposed SARA AM only
    expect(canonicalizeThai(alreadyComposed)).toBe(alreadyComposed);
  });
});

describe('the offset invariant survives Thai normalization end to end', () => {
  // Regression coverage for the bug documented in thailand-integration-plan.md's "A fourth real
  // bug" section: normalizing section.text at storage time while document_text.text stayed raw
  // broke verifyOffsets for any section where normalization changed the text's length. These
  // tests insert directly into the real schema (document/document_text/section), the same tables
  // parse/index.ts writes to, and run the real indexSections()/verifyOffsets() against them --
  // not a reimplementation of the invariant, the actual functions.
  function seedDocument(db: ReturnType<typeof openDb>, sections: string[]): number {
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('THA', 'Thailand', '[\"th\"]')").run();
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at)
       VALUES (1, 'THA', 'Test Instrument', 'act', 'https://example.test/instrument', 'test', '2026-09-18T00:00:00Z')`,
    ).run();
    const fullText = sections.join('\n');
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at, extraction, section_count)
       VALUES (1, 1, 'https://example.test/doc', 'hash', 'text/html', ?, 200, '2026-09-18T00:00:00Z', 'html', ?)`,
    ).run(Buffer.byteLength(fullText), sections.length);
    db.prepare('INSERT INTO document_text (document_id, text, parser, parsed_at) VALUES (1, ?, ?, ?)')
      .run(fullText, 'test', '2026-09-18T00:00:00Z');

    const insert = db.prepare(
      `INSERT INTO section (document_id, ordinal, heading_path, label, text, char_start, char_end)
       VALUES (1, ?, ?, ?, ?, ?, ?)`,
    );
    let offset = 0;
    sections.forEach((text, i) => {
      const start = offset;
      const end = start + text.length;
      insert.run(i, `s.${i + 1}`, `${i + 1}`, text, start, end);
      offset = end + 1; // +1 for the '\n' join separator
    });
    return 1;
  }

  it('round-trips a mix of decomposed-SARA-AM, mixed-script, whitespace-only and already-composed sections', () => {
    const decomposedSaraAm = 'น้ําดื่มสะอาด'; // "clean drinking water", decomposed SARA AM
    const mixedScript = 'มาตรา 12 Section 12 (2020) ค่าปรับ 5,000 บาท';
    const whitespaceOnly = '   \n\t  ';
    const alreadyComposed = 'น้ำมันเชื้อเพลิง'; // precomposed only, nothing to canonicalize

    const db = openDb(':memory:');
    const documentId = seedDocument(db, [decomposedSaraAm, mixedScript, whitespaceOnly, alreadyComposed]);

    // The invariant itself: document_text.text.slice(char_start, char_end) reproduces section.text
    // exactly, for every section, including the ones normalization would otherwise have touched.
    const check = verifyOffsets(db, documentId);
    expect(check.checked).toBe(4);
    expect(check.failed).toEqual([]);

    // section.text stays exactly as written -- the decomposed sequence is still decomposed here.
    // (This is the invariant verifyOffsets above already checked; asserted directly too, since it's
    // the specific property this test exists to lock in.)
    const sectionRows = db
      .prepare('SELECT id, text FROM section WHERE document_id = ? ORDER BY id')
      .all(documentId) as { id: number; text: string }[];
    expect(sectionRows[0]!.text).toBe(decomposedSaraAm);
    expect(sectionRows[0]!.text).not.toBe(canonicalizeThai(decomposedSaraAm));

    // Normalization happens only in the section_fts copy. section_fts is a contentless FTS5 table
    // (schema.sql: `content = ''`), so its stored text isn't retrievable by a plain SELECT -- only
    // through MATCH, which is also how the real code (ftsQuery/searchLexical) uses it, so that's
    // what this asserts through.
    indexSections(db, documentId);
    const matches = (query: string): number[] =>
      (db.prepare('SELECT rowid FROM section_fts WHERE section_fts MATCH ?').all(ftsQuery(query)) as { rowid: number }[])
        .map((r) => r.rowid);

    const decomposedSectionId = sectionRows[0]!.id;
    const mixedSectionId = sectionRows[1]!.id;
    const composedSectionId = sectionRows[3]!.id;

    // The decomposed section is findable by its COMPOSED form -- proof indexSections normalized it.
    expect(matches('น้ำดื่ม')).toContain(decomposedSectionId);
    // Mixed-script and already-composed sections still index and match normally -- normalization
    // didn't need to touch them, but it also didn't break them.
    expect(matches('มาตรา 12')).toContain(mixedSectionId);
    expect(matches('น้ำมันเชื้อเพลิง')).toContain(composedSectionId);

    db.close();
  });

  it('makes the previously-decomposed section findable by a search for its composed form', () => {
    const db = openDb(':memory:');
    const documentId = seedDocument(db, ['น้ําดื่มสะอาด']);
    indexSections(db, documentId);

    const q = ftsQuery('น้ำดื่ม'); // composed form, as a reviewer would actually type it
    expect(q).not.toBeNull();
    const hit = db.prepare(`SELECT rowid FROM section_fts WHERE section_fts MATCH ?`).all(q) as { rowid: number }[];
    expect(hit.length).toBeGreaterThan(0);

    db.close();
  });
});

describe('fusing the two channels', () => {
  it('puts a section both channels found above one either found alone', () => {
    // Agreement between an exact-phrase match and a meaning match is the strongest signal Zone 1
    // has, and it is only visible if the ranks are fused rather than the scores compared.
    const lexical = [
      { sectionId: 1, score: 9, rank: 1, channel: 'lexical' as const, query: 'q' },
      { sectionId: 2, score: 8, rank: 2, channel: 'lexical' as const, query: 'q' },
    ];
    const dense = [
      { sectionId: 3, score: 0.9, rank: 1, channel: 'dense' as const, query: 'q' },
      { sectionId: 2, score: 0.8, rank: 2, channel: 'dense' as const, query: 'q' },
    ];
    const fused = fuse([lexical, dense]);
    expect(fused[0]!.sectionId).toBe(2);
    expect(fused[0]!.channels).toEqual(['dense', 'lexical']);
  });
});
