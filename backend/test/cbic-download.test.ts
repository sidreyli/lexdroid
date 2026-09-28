import { describe, expect, it } from 'vitest';
import { cbicDownloadUrl, resolveCbicDocument } from '../src/discover/cbic.js';
import { fetchDocument } from '../src/discover/index.js';
import type { Fetcher, FetchResult } from '../src/fetch/index.js';

const VIEWER = 'https://taxinformation.cbic.gov.in/view-pdf/1000125/ENG/Notifications';
const API = 'https://taxinformation.cbic.gov.in/api/cbic-notification-msts/download/1000125/ENG';

function fetcherAnswering(body: unknown, status = 200): { fetcher: Fetcher; asked: string[] } {
  const asked: string[] = [];
  const fetcher = {
    async fetch(url: string): Promise<FetchResult> {
      asked.push(url);
      const bytes = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
      return { url, finalUrl: url, status, mediaType: 'application/json', body: bytes, contentHash: 'fixture', fromCache: true, fetchedAt: '2026-09-28T00:00:00.000Z' };
    },
  } as unknown as Fetcher;
  return { fetcher, asked };
}

describe('CBIC notification viewer', () => {
  it('knows the download request behind a viewer, and nothing else', () => {
    expect(cbicDownloadUrl(VIEWER)).toBe(API);
    expect(cbicDownloadUrl('https://taxinformation.cbic.gov.in/view-pdf/1000125/HIN')).toBe(API.replace('ENG', 'HIN'));
    expect(cbicDownloadUrl('https://www.cbic.gov.in/entities/notifications')).toBeNull();
  });

  it('reads the PDF from the download service and cites the viewer', async () => {
    const pdf = Buffer.from('%PDF-1.4\n% a notification\n');
    const { fetcher, asked } = fetcherAnswering({ data: pdf.toString('base64') });
    const res = await resolveCbicDocument(VIEWER, fetcher);
    expect(asked).toEqual([API]);
    expect(res.url).toBe(VIEWER);
    expect(res.finalUrl).toBe(API);
    expect(res.mediaType).toBe('application/pdf');
    expect(res.body.equals(pdf)).toBe(true);
  });

  it('does not take an answer without a PDF for the notification', async () => {
    await expect(resolveCbicDocument(VIEWER, fetcherAnswering({ data: '' }).fetcher)).rejects.toThrow('without a PDF');
    await expect(resolveCbicDocument(VIEWER, fetcherAnswering('<html></html>').fetcher)).rejects.toThrow('JSON');
  });

  it('passes a refusal through for the reader to record', async () => {
    const res = await resolveCbicDocument(VIEWER, fetcherAnswering({}, 404).fetcher);
    expect(res.status).toBe(404);
  });

  it('is what the reader asks for a viewer URL, whatever registered it', async () => {
    const pdf = Buffer.from('%PDF-1.7\n');
    const cbic = fetcherAnswering({ data: pdf.toString('base64') });
    expect((await fetchDocument(VIEWER, cbic.fetcher)).mediaType).toBe('application/pdf');
    const plain = fetcherAnswering('<html>an act</html>');
    await fetchDocument('https://example.gov/act', plain.fetcher);
    expect(plain.asked).toEqual(['https://example.gov/act']);
  });
});
