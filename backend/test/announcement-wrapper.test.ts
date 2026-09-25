/**
 * A page that announces a document, and a page that is one.
 *
 * Both link a file under their own name, so the name alone cannot tell them apart. What tells
 * them apart is how much the file says: an announcement is a fraction of what it announces, and a
 * page publishing itself as a PDF is roughly its own length. Bank Negara's Policy Document on
 * Electronic Money was in the corpus as 2,044 characters of press release; the ASD's cyber
 * security guidelines are the guidelines, and offer a PDF of themselves.
 */
import { describe, expect, it, vi } from 'vitest';
import { openDb } from '../src/db/index.js';
import { loadProfile } from '../src/profile/index.js';
import { materialise } from '../src/discover/index.js';
import { namedDocumentLink } from '../src/parse/html.js';

const PAGE = 'https://www.bnm.gov.my/-/policy-document-on-electronic-money-e-money';
const POLICY = 'https://www.bnm.gov.my/documents/20124/943361/e-money-pd.pdf';
const TITLE = 'Policy Document on Electronic Money (E-Money)';

const ANNOUNCEMENT = `
<html><head><title>${TITLE}</title></head><body><main>
<p>Bank Negara Malaysia today issued the Policy Document on Electronic Money, which sets out the
requirements for the issuance of electronic money. The policy document takes effect immediately
and supersedes the previous guideline.</p>
<a href="/documents/20124/943361/e-money-pd.pdf">Policy Document on Electronic Money (E-Money)</a>
<a href="/documents/20124/943361/e-money-faq.pdf">Frequently Asked Questions</a>
<a href="/documents/20124/938039/financial-stability-2024.pdf">Financial Stability Review</a>
<a href="/documents/20124/900011/pua-123-2025.pdf">P.U.(A) 123/2025</a>
<a href="/documents/20124/900011/pua-124-2025.pdf">P.U.(A) 124/2025</a>
</main></body></html>`;

/** Long enough that the parser reads it as a document rather than a fragment. */
const body = (line: string, n: number) =>
  Array.from({ length: n }, (_, i) => `<p>${i + 1}. ${line}</p>`).join('\n');

const served = (url: string, html: string) => ({
  status: 200,
  url,
  finalUrl: url,
  mediaType: 'text/html',
  body: Buffer.from(html),
  contentHash: url,
  fromCache: false,
  fetchedAt: '2026-09-22',
});

function register(title: string, url: string) {
  const db = openDb(':memory:');
  db.exec(`INSERT INTO economy(code,name,official_languages) VALUES('MYS','Malaysia','["en","ms"]');`);
  db.prepare(
    `INSERT INTO instrument(id,economy_code,title,kind,status,source_url,discovered_via,discovered_at)
     VALUES(1,'MYS',?,'guideline','unknown',?,'portal:24','2026-09-22')`,
  ).run(title, url);
  return db;
}

const storedUrl = (db: ReturnType<typeof openDb>) =>
  (db.prepare('SELECT url FROM document WHERE instrument_id = 1').get() as { url: string } | undefined)?.url;

describe('the file a page links under its own name', () => {
  it('is named when exactly one of the five linked files calls itself by the instrument', () => {
    expect(namedDocumentLink(ANNOUNCEMENT, PAGE, TITLE)).toBe(POLICY);
  });

  it('is not named when two files answer to the same name, which is a choice we cannot make', () => {
    const twice = ANNOUNCEMENT.replace(
      '<a href="/documents/20124/943361/e-money-faq.pdf">Frequently Asked Questions</a>',
      `<a href="/documents/20124/943361/e-money-pd-bm.pdf">${TITLE}</a>`,
    );
    expect(namedDocumentLink(twice, PAGE, TITLE)).toBeNull();
  });

  it('asks the host that served the page, when the site links itself under its other name', () => {
    const offname = ANNOUNCEMENT.replace(
      '<a href="/documents/20124/943361/e-money-pd.pdf">',
      '<a href="https://bnm.gov.my/documents/20124/943361/e-money-pd.pdf">',
    );
    expect(namedDocumentLink(offname, PAGE, TITLE)).toBe(POLICY);
  });

  it('does not rewrite the host of a file published somewhere else entirely', () => {
    const elsewhere = ANNOUNCEMENT.replace(
      '<a href="/documents/20124/943361/e-money-pd.pdf">',
      '<a href="https://cdn.example.com/e-money-pd.pdf">',
    );
    expect(namedDocumentLink(elsewhere, PAGE, TITLE)).toBe('https://cdn.example.com/e-money-pd.pdf');
  });

  it('is not named when nothing linked carries the instrument’s name', () => {
    const anonymous = ANNOUNCEMENT.replace(
      `<a href="/documents/20124/943361/e-money-pd.pdf">${TITLE}</a>`,
      '<a href="/documents/20124/943361/e-money-pd.pdf">Download</a>',
    );
    expect(namedDocumentLink(anonymous, PAGE, TITLE)).toBeNull();
  });
});

describe('a page that announces a document is replaced by the document', () => {
  it('stores the policy, not the press release', async () => {
    const db = register(TITLE, PAGE);
    const fetch = vi.fn(async (url: string) =>
      served(url, url === POLICY ? `<html><body><main>${body('An issuer of electronic money shall maintain the funds collected in a trust account.', 60)}</main></body></html>` : ANNOUNCEMENT),
    );
    await materialise(db, loadProfile('MYS'), { fetch } as never, { instrumentIds: [1] });
    expect(storedUrl(db)).toBe(POLICY);
    db.close();
  });

  it('keeps the page when the page is the document and the file is a copy of it', async () => {
    const guideline = 'Guidelines for database systems';
    const pdf = 'https://www.cyber.gov.au/sites/default/files/guidelines-database.pdf';
    const page = 'https://www.cyber.gov.au/guidelines-database-systems';
    const text = body('Database servers are hardened in accordance with vendor guidance.', 60);
    const db = register(guideline, page);
    const fetch = vi.fn(async (url: string) =>
      served(
        url,
        url === pdf
          ? `<html><body><main>${text}</main></body></html>`
          : `<html><head><title>${guideline}</title></head><body><main>${text}
             <a href="${pdf}">${guideline}</a></main></body></html>`,
      ),
    );
    await materialise(db, loadProfile('MYS'), { fetch } as never, { instrumentIds: [1] });
    expect(storedUrl(db)).toBe(page);
    db.close();
  });
});
