/**
 * Bytes to text, in the encoding the server said it used.
 *
 * Every consumer in this pipeline decoded as UTF-8, and nothing ever consulted a charset. Russia's
 * legal information system (pravo.gov.ru/proxy/ips) declares `charset=windows-1251`, and read as
 * UTF-8 its pages yield zero Cyrillic characters -- not degraded, lost -- which the parser then
 * records as `empty`, exactly what a portal serving a stub looks like. Legacy encodings are common
 * on older government sites, so this is shared rather than Russian.
 *
 * Where the answer comes from, most authoritative first:
 *
 *   1. a byte-order mark, which is the bytes stating their own encoding;
 *   2. the charset of the Content-Type header, kept on the fetch since this change;
 *   3. the document's own declaration -- `<meta charset>`, `<meta http-equiv="Content-Type">`, or
 *      an XML declaration -- read from the first 2 KB. This is also what decodes a page cached
 *      before the header's charset was kept;
 *   4. UTF-8.
 *
 * A label the runtime does not know is skipped rather than guessed at.
 */
import { TextDecoder } from 'node:util';

export interface Decodable {
  body: Buffer;
  mediaType: string;
  /** The charset the Content-Type header named, lower-cased; absent for bytes cached before it was kept. */
  charset?: string | null;
}

/** The charset parameter of a Content-Type value, or null. */
export function charsetOf(contentType: string): string | null {
  const m = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return m ? m[1]!.toLowerCase() : null;
}

/** The encoding a document declares for itself in its first bytes, or null. */
export function declaredCharset(body: Buffer): string | null {
  // Any ASCII-compatible encoding spells its declaration in ASCII, so latin1 reads it faithfully.
  const head = body.subarray(0, 2048).toString('latin1');
  const meta =
    /<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9._:-]+)/i.exec(head) ??
    /<\?xml[^>]+encoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/i.exec(head);
  return meta ? meta[1]!.toLowerCase() : null;
}

function decoderFor(label: string | null | undefined): TextDecoder | null {
  if (!label) return null;
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

/** True when the bytes are well-formed UTF-8. */
function isUtf8(body: Buffer): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(body);
    return true;
  } catch {
    return false;
  }
}

/**
 * The encoding these bytes are in, by the order of authority above.
 *
 * With one guard. A declaration of a legacy encoding over bytes that are well-formed UTF-8 is
 * wrong -- a server configured for Latin-1 serving UTF-8 is an ordinary misconfiguration -- and
 * obeying it would turn every page this pipeline already reads correctly into mojibake. Text in a
 * real single-byte Cyrillic or Latin encoding is, beyond a few characters, never valid UTF-8, so
 * the guard costs Russia nothing.
 */
export function encodingOf(res: Decodable): string {
  const b = res.body;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8';
  if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
  if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
  // A page is asked for its own declaration when it is markup, whatever the header called it: IPS
  // serves its search results with no Content-Type at all, and read as UTF-8 by default every
  // title in them came back as replacement characters.
  const markup = /html|xml/i.test(res.mediaType) || /^\s*<(?:!doctype|html|\?xml|head)/i.test(b.subarray(0, 256).toString('latin1'));
  for (const label of [res.charset, markup ? declaredCharset(b) : null]) {
    const d = decoderFor(label);
    if (!d) continue;
    if (d.encoding !== 'utf-8' && !d.encoding.startsWith('utf-16') && isUtf8(b)) return 'utf-8';
    return d.encoding;
  }
  return 'utf-8';
}

/** The response as text. */
export function decodeBody(res: Decodable): string {
  // TextDecoder drops a leading byte-order mark itself.
  return new TextDecoder(encodingOf(res)).decode(res.body);
}
