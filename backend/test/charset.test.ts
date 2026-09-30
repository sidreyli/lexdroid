/**
 * Text in the encoding the server said it used.
 *
 * Russia's legal information system serves `charset=windows-1251`. Every consumer here decoded as
 * UTF-8, and a windows-1251 page read that way yields zero Cyrillic characters -- recorded as
 * `empty`, which looks exactly like a portal serving a stub. These tests build windows-1251 bytes
 * by hand, since Node encodes nothing but UTF-8.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { charsetOf, decodeBody, declaredCharset } from '../src/fetch/decode.js';
import { Fetcher } from '../src/fetch/index.js';
import { parseDocument } from '../src/parse/index.js';

/** windows-1251 for ASCII and the basic Cyrillic alphabet: А..я are 0xC0..0xFF. */
function cp1251(text: string): Buffer {
  return Buffer.from(
    [...text].map((ch) => {
      const c = ch.charCodeAt(0);
      if (c < 0x80) return c;
      if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
      if (ch === 'Ё') return 0xa8;
      if (ch === 'ё') return 0xb8;
      throw new Error(`not in this test's cp1251: ${ch}`);
    }),
  );
}

const LAW = 'Статья 1. Настоящий Федеральный закон регулирует отношения, связанные с обработкой персональных данных.';

describe('decoding a response', () => {
  it('reads the charset a Content-Type states', () => {
    expect(charsetOf('text/html; charset=windows-1251')).toBe('windows-1251');
    expect(charsetOf('text/html;charset="UTF-8"')).toBe('utf-8');
    expect(charsetOf('text/html')).toBeNull();
  });

  it('decodes windows-1251 the header names, where UTF-8 would have lost every letter', () => {
    const body = cp1251(`<html><body><p>${LAW}</p></body></html>`);
    expect(body.toString('utf8')).not.toMatch(/[Ѐ-ӿ]/);
    expect(decodeBody({ body, mediaType: 'text/html', charset: 'windows-1251' })).toContain(LAW);
  });

  it('decodes a page cached before the header was kept, from the page\'s own declaration', () => {
    const body = cp1251(`<html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251"></head><body>${LAW}</body></html>`);
    expect(declaredCharset(body)).toBe('windows-1251');
    expect(decodeBody({ body, mediaType: 'text/html' })).toContain(LAW);
  });

  it('reads the declaration of markup served with no Content-Type at all', () => {
    // IPS's search results come back with no header; the fetcher records application/octet-stream.
    const body = cp1251(`<html>\n<head><meta http-equiv="Content-Type" content="text/html; charset=windows-1251" /></head><body>${LAW}</body></html>`);
    expect(decodeBody({ body, mediaType: 'application/octet-stream' })).toContain(LAW);
  });

  it('keeps UTF-8 that a server mislabels as a legacy encoding', () => {
    // Obeying the label would turn every page this pipeline already reads correctly into mojibake.
    const body = Buffer.from(`<html><head><meta charset="iso-8859-1"></head><body>${LAW}</body></html>`, 'utf8');
    expect(decodeBody({ body, mediaType: 'text/html', charset: 'iso-8859-1' })).toContain(LAW);
  });

  it('falls back to UTF-8 for a label the runtime does not know', () => {
    const body = Buffer.from(LAW, 'utf8');
    expect(decodeBody({ body, mediaType: 'text/html', charset: 'x-no-such-encoding' })).toBe(LAW);
  });
});

describe('a windows-1251 page, fetched and parsed', () => {
  it('keeps its charset through the fetcher and the cache, and parses to Russian text', async () => {
    const page = cp1251(`<html><body><main>${Array.from({ length: 12 }, () => `<p>${LAW}</p>`).join('')}</main></body></html>`);
    const server: Server = createServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=windows-1251' });
      res.end(page);
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const db = openDb(':memory:');
      const live = await new Fetcher({ db, sourceMode: 'fetch', minDelayMs: 1 }).fetch(`${origin}/doc`);
      expect(live.charset).toBe('windows-1251');

      const cached = await new Fetcher({ db, sourceMode: 'cache-only', minDelayMs: 1 }).fetch(`${origin}/doc`);
      expect(cached.fromCache).toBe(true);
      expect(cached.charset).toBe('windows-1251');

      const parsed = await parseDocument(cached);
      expect(parsed.unread).toBeNull();
      expect(parsed.text).toContain('обработкой персональных данных');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
