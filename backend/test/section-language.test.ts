import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { storeDocument } from '../src/parse/index.js';
import type { FetchResult } from '../src/fetch/index.js';
import type { ParsedDocument } from '../src/parse/types.js';

// decide holds a finding it cannot test in English only when the provision's language is known;
// a null language read as English and ruled Mongolian and Russian findings out on English words.

function fetched(url: string, body: string): FetchResult {
  const buf = Buffer.from(body, 'utf8');
  return {
    url, finalUrl: url, status: 200, mediaType: 'text/html', body: buf,
    contentHash: createHash('sha256').update(buf).digest('hex'),
    fromCache: false, fetchedAt: '2026-09-26T00:00:00.000Z',
  };
}

function parsed(title: string, texts: string[]): ParsedDocument {
  let at = 0;
  const sections = texts.map((text, ordinal) => {
    const charStart = at;
    at += text.length + 1;
    return { ordinal, headingPath: title, label: String(ordinal + 1), text,
      charStart, charEnd: charStart + text.length, page: null, language: null, repealed: false, anchor: null };
  });
  return { extraction: 'html', text: texts.join('\n'), sections, unread: null, title, meta: {}, parser: 'test' };
}

function store(economy: string, title: string, texts: string[]) {
  const db = openDb(':memory:');
  const url = `https://example.test/${economy}`;
  db.prepare('INSERT INTO economy (code, name, official_languages) VALUES (?, ?, ?)').run(economy, economy, '[]');
  db.prepare(
    `INSERT INTO instrument (economy_code, title, kind, source_url, discovered_via, discovered_at)
     VALUES (?, ?, 'law', ?, 'test', '2026-09-26')`,
  ).run(economy, title, url);
  const { id } = db.prepare('SELECT id FROM instrument').get() as { id: number };
  const first = storeDocument(db, { instrumentId: id, fetched: fetched(url, '<p>x</p>'), parsed: parsed(title, texts) });
  const languages = (db.prepare('SELECT language FROM section ORDER BY ordinal').all() as { language: string | null }[]).map((r) => r.language);
  const again = storeDocument(db, { instrumentId: id, fetched: fetched(url, '<p>x</p>'), parsed: parsed(title, texts) });
  return { languages, first, again };
}

describe('the language of each stored provision', () => {
  it('is Mongolian for a Mongolian law', () => {
    const { languages } = store('MNG', 'Хүний хувийн мэдээлэл хамгаалах тухай', [
      'Энэ хуулийн зорилт нь хүний хувийн мэдээллийг цуглуулах, боловсруулах, ашиглахтай холбогдсон харилцааг зохицуулахад оршино.',
    ]);
    expect(languages).toEqual(['mn']);
  });

  it('is Russian for a Russian law', () => {
    const { languages } = store('RUS', 'О персональных данных', [
      'Настоящим Федеральным законом регулируются отношения, связанные с обработкой персональных данных, осуществляемой федеральными органами государственной власти.',
    ]);
    expect(languages).toEqual(['ru']);
  });

  it('leaves a re-read of the same bytes in place rather than replacing it', () => {
    const { first, again } = store('RUS', 'О персональных данных', ['Настоящим Федеральным законом регулируются отношения.']);
    expect(again.documentId).toBe(first.documentId);
  });
});
