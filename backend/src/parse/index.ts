/**
 * Choosing a parser, and writing what it produced into the store.
 *
 * The rule this module enforces: a document either has sections, or it has a row in
 * unread_document saying why it does not. There is no third outcome, and in particular there is
 * no document that is simply absent from the corpus without explanation. 852 Australian documents
 * went missing that way in v1 and were then reported as evidence of absence.
 */
import type { Db } from '../db/index.js';
import { indexSections } from '../db/index.js';
import type { FetchResult } from '../fetch/index.js';
import { parseFrl } from './frl.js';
import { parseHtml } from './html.js';
import { parseIndiaCode } from './indiacode.js';
import { parseOcs } from './ocs.js';
import { parsePdf } from './pdf.js';
import { parseSso } from './sso.js';
import { identityMismatch } from './identity.js';
import { opensAsPublishedAbout, publishedAbout } from '../discover/titles.js';
import type { ParsedDocument, UnreadReason } from './types.js';

export * from './types.js';
export { provisionIds } from './sso.js';

/** Site-specific parsers, chosen by host. Everything else goes through the generic path. */
const BY_HOST: Record<string, (html: string, url: string) => ParsedDocument> = {
  'sso.agc.gov.sg': parseSso,
  'www.legislation.gov.au': parseFrl,
};

/** `languages`: the economy's official languages, among which a PDF's language is guessed. */
export async function parseDocument(res: FetchResult, opts: { languages?: readonly string[] } = {}): Promise<ParsedDocument> {
  const host = new URL(res.finalUrl || res.url).host;

  if (res.mediaType.includes('vnd.lexdroid.indiacode+json')) {
    return parseIndiaCode(res.body.toString('utf8'), res.url);
  }

  if (res.mediaType.includes('vnd.lexdroid.ocs+json')) {
    return parseOcs(res.body.toString('utf8'), res.url);
  }

  // A server that labels a PDF as generic bytes -- DGFT's bucket serves its notifications as
  // application/octet-stream -- has still sent a PDF, and the file says so in its first bytes.
  const pdfByItsBytes = /octet-stream|binary|force-download/.test(res.mediaType) && res.body.subarray(0, 1024).includes('%PDF-');
  if (res.mediaType.includes('pdf') || pdfByItsBytes) return parsePdf(res.body, res.url, opts.languages ? { languages: opts.languages } : {});

  if (res.mediaType.includes('html') || res.mediaType.includes('xml')) {
    const html = res.body.toString('utf8');
    const site = BY_HOST[host];
    return site ? site(html, res.url) : parseHtml(html, res.url);
  }

  if (res.mediaType.startsWith('text/')) {
    const text = res.body.toString('utf8').trim();
    if (!text) {
      return { extraction: 'none', text: '', sections: [], title: null, meta: {}, parser: 'plain', unread: { reason: 'empty', detail: `${res.url} is empty.` } };
    }
    return {
      extraction: 'plain', text, parser: 'plain', title: null, meta: {}, unread: null,
      sections: [{ ordinal: 0, headingPath: res.url, label: null, text, charStart: 0, charEnd: text.length, page: null, language: null, repealed: false, anchor: null }],
    };
  }

  return {
    extraction: 'none', text: '', sections: [], title: null, meta: {}, parser: 'none',
    unread: { reason: 'unsupported-media-type', detail: `${res.url} was served as ${res.mediaType}, which no parser handles.` },
  };
}

export interface StoredDocument {
  documentId: number;
  sectionCount: number;
  unread: boolean;
  /** Set when storing decided the document was unread, which the parser alone could not know. */
  unreadReason: { reason: UnreadReason; detail: string } | null;
}

/**
 * Write a fetched-and-parsed document into the store, replacing any previous reading of the same
 * address. Re-parsing the same document is expected -- a parser improves and the corpus is rebuilt
 * without re-fetching -- so the write is idempotent and the lexical index is rebuilt with it.
 */
export function storeDocument(
  db: Db,
  args: { instrumentId: number; fetched: FetchResult; parsed: ParsedDocument },
): StoredDocument {
  const { instrumentId, fetched } = args;
  let { parsed } = args;

  return db.transaction((): StoredDocument => {
    // A document filed under the wrong instrument parses cleanly and cites perfectly to the wrong
    // law, so the contradiction has to be caught here, before anything can be indexed out of it.
    const filed = db.prepare('SELECT title, title_provisional FROM instrument WHERE id = ?').get(instrumentId) as
      | { title: string; title_provisional: number }
      | undefined;
    const wrong =
      filed && !parsed.unread
        ? identityMismatch(parsed.sections, filed.title, { titleProvisional: filed.title_provisional === 1 })
        : null;
    if (wrong) parsed = { ...parsed, unread: { reason: 'another-instrument', detail: wrong.detail } };

    // The same bytes parsed into the same provisions is the document already stored, and storing
    // it again deleted every section and every reading that cited one -- cascaded out of runs that
    // had nothing to do with this parse. Nothing about it has changed, so nothing is touched.
    const unchanged = unchangedDocument(db, instrumentId, fetched, parsed);
    if (unchanged !== null) return { documentId: unchanged, sectionCount: parsed.sections.length, unread: false, unreadReason: null };

    // A regulator's site publishes consultations, releases and news beside its instruments, and
    // a page that files one under a neutral name still says what it is in its opening words.
    // Answers cited a consultation paper as Malaysia's data protection guidance, and a news item
    // about a review of an Act as the Act. A legislation database is not asked: it publishes
    // nothing else, and its titles use these words as the names of laws.
    if (filed && !parsed.unread) {
      const portal = db
        .prepare(`SELECT p.kind FROM instrument i JOIN portal p ON 'portal:' || p.id = i.discovered_via WHERE i.id = ?`)
        .get(instrumentId) as { kind: string } | undefined;
      const opening = parsed.text.replace(/\s+/g, ' ').trim().slice(0, 90);
      const about = publishedAbout(filed.title) ? filed.title : opensAsPublishedAbout(opening) ? opening : undefined;
      if (portal && portal.kind !== 'legislation-database' && portal.kind !== 'gazette' && about !== undefined) {
        parsed = {
          ...parsed,
          unread: {
            reason: 'not-an-instrument',
            detail: `"${about.slice(0, 90)}" is published about an instrument, not an instrument, so nothing in it may be cited as law.`,
          },
        };
      }
    }
    db.prepare(
      `INSERT INTO document (instrument_id, url, content_hash, media_type, bytes, http_status,
                             fetched_at, from_cache, extraction, section_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(url, content_hash) DO UPDATE SET
         media_type = excluded.media_type, bytes = excluded.bytes, http_status = excluded.http_status,
         fetched_at = excluded.fetched_at, from_cache = excluded.from_cache,
         extraction = excluded.extraction, section_count = excluded.section_count`,
    ).run(
      instrumentId, fetched.url, fetched.contentHash, fetched.mediaType, fetched.body.length,
      fetched.status, fetched.fetchedAt, fetched.fromCache ? 1 : 0, parsed.extraction,
      // An unread document holds no sections, whatever the parser managed to split. Counting what
      // was never stored made ten Malaysian documents report 348 provisions the corpus has not got.
      parsed.unread ? 0 : parsed.sections.length,
    );

    const { id: documentId } = db
      .prepare('SELECT id FROM document WHERE url = ? AND content_hash = ?')
      .get(fetched.url, fetched.contentHash) as { id: number };

    // The lexical index is contentless, so nothing cascades into it. A section deleted below
    // leaves its index row behind, and the replacement the re-parse writes gets a new id, so the
    // old row is never reached again. Six hundred thousand had built up that way -- four index
    // rows for every section the corpus actually holds -- and bm25 weighs each term against the
    // whole table, which means every lexical rank was being computed against mostly deleted text.
    // Forgetting them belongs here, before the rows they point at are gone and their ids with them.
    db.prepare(
      `DELETE FROM section_fts WHERE rowid IN (
         SELECT s.id FROM section s JOIN document d ON d.id = s.document_id
          WHERE d.instrument_id = ? AND d.url = ?)`,
    ).run(instrumentId, fetched.url);

    // The same address read again is the same document, not a second one. Keying only on the bytes
    // let a re-read leave the stale reading in place beside the fresh one, so every provision the
    // corpus held twice was retrieved twice and counted twice.
    db.prepare('DELETE FROM document WHERE instrument_id = ? AND url = ? AND id <> ?')
      .run(instrumentId, fetched.url, documentId);

    // How many times this address has come back unreadable, carried across the re-store below so
    // a document that is empty every time is eventually left alone rather than asked for forever.
    const tried = (db
      .prepare(
        `SELECT MAX(u.attempts) AS n FROM unread_document u JOIN document d ON d.id = u.document_id
          WHERE d.instrument_id = ? AND d.url = ?`,
      )
      .get(instrumentId, fetched.url) as { n: number | null }).n ?? 0;

    db.prepare('DELETE FROM section WHERE document_id = ?').run(documentId);
    db.prepare('DELETE FROM unread_document WHERE document_id = ?').run(documentId);
    db.prepare('DELETE FROM document_text WHERE document_id = ?').run(documentId);

    if (parsed.unread) {
      db.prepare('INSERT INTO unread_document (document_id, reason, detail, recorded_at, attempts) VALUES (?, ?, ?, ?, ?)')
        .run(documentId, parsed.unread.reason, parsed.unread.detail, new Date().toISOString(), tried + 1);
      return { documentId, sectionCount: 0, unread: true, unreadReason: parsed.unread };
    }

    db.prepare('INSERT INTO document_text (document_id, text, parser, parsed_at) VALUES (?, ?, ?, ?)')
      .run(documentId, parsed.text, parsed.parser, new Date().toISOString());

    const insert = db.prepare(
      `INSERT INTO section (document_id, ordinal, heading_path, label, text, char_start, char_end, page, language, anchor, repealed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    // Every parser works out whether a provision is repealed, and this is where it used to be lost.
    //
    // Stored exactly as the parser produced it, unnormalised: char_start/char_end were computed
    // against this exact text, and verifyOffsets below depends on document_text.text.slice(start,
    // end) reproducing it byte-for-byte. Normalizing here (Thai's NFC/SARA-AM handling included)
    // would silently break that invariant -- normalization can change a string's length, which
    // shifts every later offset without anyone touching char_start/char_end. Normalization for
    // search purposes happens only in db/index.ts's indexSections(), on the copy written into
    // section_fts, which has no offset invariant to preserve.
    for (const s of parsed.sections) {
      insert.run(
        documentId,
        s.ordinal,
        s.headingPath,
        s.label,
        s.text,
        s.charStart,
        s.charEnd,
        s.page,
        s.language,
        s.anchor,
        s.repealed ? 1 : 0,
      );
    }

    indexSections(db, documentId);
    return { documentId, sectionCount: parsed.sections.length, unread: false, unreadReason: null };
  })();
}

/**
 * The stored document these bytes already are, parsed into exactly these provisions, or null.
 *
 * Null wherever anything differs -- another hash, an unread result, one section's text, label,
 * offsets or language -- because then the parse is the point, and replacing is what it is for.
 */
function unchangedDocument(db: Db, instrumentId: number, fetched: FetchResult, parsed: ParsedDocument): number | null {
  if (parsed.unread) return null;
  const doc = db
    .prepare('SELECT id FROM document WHERE instrument_id = ? AND url = ? AND content_hash = ?')
    .get(instrumentId, fetched.url, fetched.contentHash) as { id: number } | undefined;
  if (!doc) return null;
  const text = db.prepare('SELECT text FROM document_text WHERE document_id = ?').get(doc.id) as { text: string } | undefined;
  if (text?.text !== parsed.text) return null;
  const stored = db
    .prepare(
      `SELECT ordinal, heading_path, label, text, char_start, char_end, page, language, anchor, repealed
         FROM section WHERE document_id = ? ORDER BY ordinal`,
    )
    .all(doc.id) as {
    ordinal: number; heading_path: string; label: string | null; text: string; char_start: number; char_end: number;
    page: number | null; language: string | null; anchor: string | null; repealed: number;
  }[];
  if (stored.length === 0 || stored.length !== parsed.sections.length) return null;
  const same = parsed.sections.every((s, i) => {
    const t = stored[i]!;
    return (
      t.ordinal === s.ordinal && t.heading_path === s.headingPath && t.label === (s.label ?? null) &&
      t.text === s.text && t.char_start === s.charStart && t.char_end === s.charEnd &&
      t.page === (s.page ?? null) && t.language === (s.language ?? null) && t.anchor === (s.anchor ?? null) &&
      t.repealed === (s.repealed ? 1 : 0)
    );
  });
  return same ? doc.id : null;
}

/**
 * The check behind every citation: the stored text really does contain this section at these
 * offsets. Cheap, so it runs over the whole corpus after a parse rather than at export time only.
 */
export function verifyOffsets(db: Db, documentId: number): { checked: number; failed: string[] } {
  const row = db.prepare('SELECT text FROM document_text WHERE document_id = ?').get(documentId) as { text: string } | undefined;
  if (!row) return { checked: 0, failed: [] };
  const sections = db
    .prepare('SELECT ordinal, heading_path, text, char_start, char_end FROM section WHERE document_id = ? ORDER BY ordinal')
    .all(documentId) as { ordinal: number; heading_path: string; text: string; char_start: number; char_end: number }[];

  const failed: string[] = [];
  for (const s of sections) {
    if (row.text.slice(s.char_start, s.char_end) !== s.text) failed.push(`${s.ordinal} ${s.heading_path}`);
  }
  return { checked: sections.length, failed };
}
