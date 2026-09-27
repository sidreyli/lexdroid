/**
 * CBIC's tax information portal (taxinformation.cbic.gov.in), where customs notifications live.
 *
 * A notification's public address is its viewer, `view-pdf/<id>/<LANG>/...`. Since September 2026
 * that address serves the portal's single-page app, which reads as twenty characters of text: the
 * PDF itself is fetched by the app from `api/cbic-notification-msts/download/<id>/<LANG>`, which
 * answers JSON of the form `{ data: <base64 PDF> }`. That request is the one the portal's own page
 * sends, and needs no credential.
 *
 * The instrument keeps the viewer as its URL, so a citation links to the page a person opens.
 */
import { cacheComposed, type FetchResult, type Fetcher } from '../fetch/index.js';

const VIEWER = /^https:\/\/taxinformation\.cbic\.gov\.in\/view-pdf\/(\d+)\/([A-Za-z]+)(?:[/?#]|$)/;

/** The download request behind a notification viewer, or null when the URL is not one. */
export function cbicDownloadUrl(url: string): string | null {
  const m = VIEWER.exec(url);
  return m ? `https://taxinformation.cbic.gov.in/api/cbic-notification-msts/download/${m[1]}/${m[2]}` : null;
}

/** The notification's PDF, cited at its viewer. */
export async function resolveCbicDocument(url: string, fetcher: Fetcher): Promise<FetchResult> {
  const api = cbicDownloadUrl(url);
  if (!api) throw new Error(`not a CBIC notification viewer: ${url}`);
  const res = await fetcher.fetch(api);
  if (res.status !== 200) return res;

  let data: unknown;
  try {
    data = (JSON.parse(res.body.toString('utf8')) as { data?: unknown }).data;
  } catch {
    throw new Error('the CBIC download service did not answer with JSON');
  }
  const body = typeof data === 'string' ? Buffer.from(data, 'base64') : Buffer.alloc(0);
  if (body.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('the CBIC download service answered without a PDF');
  }
  return {
    url,
    finalUrl: api,
    status: 200,
    mediaType: 'application/pdf',
    body,
    contentHash: cacheComposed(body),
    fromCache: res.fromCache,
    fetchedAt: res.fetchedAt,
  };
}
