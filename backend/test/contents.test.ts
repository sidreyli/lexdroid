/**
 * The contents index -- the artefact discovery ranks on instead of titles.
 *
 * The measurement that produced it: on Singapore pillars 6 and 7,
 * title ranking surfaced 7 of 23 cited instruments in a list of 100. The Companies Act, Income Tax
 * Act, Employment Act, Banking Act and Criminal Procedure Code were all registered, all cited and
 * all past rank 200 -- and restricting the search to Acts alone did not move them, because
 * "Companies Act 1967" contains no word about keeping records. Its section 199 does.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { extractContents, contentsFromParsedSections } from '../src/contents/index.js';

/** The shape SSO serves: Part headings interleaved with the provisions under them. */
const SSO_TOC = `
<html><body>
  <div id="toc">
    <p class="HeadingParagraph">Part 1 PRELIMINARY</p>
    <div><input class="childID" name="item" value="pr1-"><label>1 Short title</label></div>
    <div><input class="childID" name="item" value="pr2-"><label>2 Interpretation</label></div>
    <p class="HeadingParagraph">Part VI ACCOUNTS AND AUDIT</p>
    <div><input class="childID" name="item" value="pr199-"><label>199 Accounting records and systems of control</label></div>
    <div><input class="childID" name="item" value="pr200-"><label>(2)</label></div>
  </div>
</body></html>`;

describe('reading an instrument’s contents', () => {
  it('joins each provision to the Part it sits under', () => {
    // "Compliance with Act" says nothing on its own; "PROTECTION OF PERSONAL DATA > Compliance
    // with Act" says what the provision is about. The Part is often the only place the subject
    // appears at all.
    const { headings, extractor } = extractContents(SSO_TOC, 'https://sso.agc.gov.sg/Act/CoA1967');
    expect(extractor).toBe('sso');
    expect(headings).toContain('Part VI ACCOUNTS AND AUDIT > 199 Accounting records and systems of control');
    expect(headings[0]).toBe('Part 1 PRELIMINARY > 1 Short title');
  });

  it('drops entries too short to be a subject', () => {
    const { headings } = extractContents(SSO_TOC, 'https://sso.agc.gov.sg/Act/CoA1967');
    expect(headings.some((h) => h.endsWith('(2)'))).toBe(false);
  });

  it('does not truncate a long Act', () => {
    // There was a cap of 400 here. The Criminal Procedure Code lists more than that, and section
    // 39 -- "Access to computer", which indicator 7.5 turns on -- sits past the line. A cap on the
    // contents is a cap on what discovery can ever find, applied before anyone asked a question,
    // and it bites hardest on the long general Acts that are the ones actually cited.
    const rows = Array.from(
      { length: 600 },
      (_v, i) => `<div><input class="childID" name="item" value="pr${i}-"><label>${i} Section ${i}</label></div>`,
    ).join('');
    const { headings } = extractContents(
      `<html><body><p class="HeadingParagraph">Part 1</p>${rows}</body></html>`,
      'https://sso.agc.gov.sg/Act/CPC2010',
    );
    expect(headings).toHaveLength(600);
    expect(headings[599]).toBe('Part 1 > 599 Section 599');
  });

  it('falls back to a generic reader when the portal reader finds nothing', () => {
    // The live-test economy is one nobody has looked at. A portal-specific reader that has not
    // been written is worth less than a crude one that runs.
    const { headings, extractor } = extractContents(
      '<html><body><h2>Article 12 Data retention</h2><h2>Article 13 Transfers</h2></body></html>',
      'https://sso.agc.gov.sg/Act/Odd',
    );
    expect(extractor).toBe('generic-html');
    expect(headings).toEqual(['Article 12 Data retention', 'Article 13 Transfers']);
  });

  it('reports nothing rather than something when a page has no headings at all', () => {
    const { headings } = extractContents('<html><body><p>a landing page</p></body></html>', 'https://x.gov/y');
    expect(headings).toEqual([]);
  });
});

/** The shape the Federal Register serves: the whole arrangement, as links into the EPUB. */
const FRL_TOC = `
<html><body>
  <a href="epub/OEBPS/document_1/document_1.html#_Toc1">Part&nbsp;I&#8212;Preliminary</a>
  <a href="epub/OEBPS/document_1/document_1.html#_Toc2">1  Short title</a>
  <a href="epub/OEBPS/document_1/document_1.html#_Toc3">Part&nbsp;III&#8212;Information privacy</a>
  <a href="epub/OEBPS/document_1/document_1.html#_Toc4">Division&nbsp;2&#8212;Australian Privacy Principles</a>
  <a href="epub/OEBPS/document_1/document_1.html#_Toc5">16C  Acts and practices of overseas recipients of personal information</a>
  <a href="epub/OEBPS/document_2/document_2.html#_Toc6">Schedule&nbsp;1&#8212;Australian Privacy Principles</a>
  <a href="epub/OEBPS/document_2/document_2.html#_Toc7">8  Australian Privacy Principle 8&#8212;cross-border disclosure</a>
  <a href="/C2004A03712/latest/downloads">Download</a>
</body></html>`;

describe('the Federal Register of Legislation contents', () => {
  it('reads the arrangement off the page the register already serves', () => {
    // Australia's document page is a shell around an EPUB, and the shell carries the whole
    // arrangement. So its contents cost the one request reading the Act would have made anyway.
    const { headings, extractor } = extractContents(FRL_TOC, 'https://www.legislation.gov.au/C2004A03712/latest/text');
    expect(extractor).toBe('frl');
    expect(headings).toContain(
      'Part I—Preliminary > 1 Short title',
    );
  });

  it('nests a provision under its Part and its Division', () => {
    const { headings } = extractContents(FRL_TOC, 'https://www.legislation.gov.au/C2004A03712/latest/text');
    expect(headings).toContain(
      'Part III—Information privacy > Division 2—Australian Privacy Principles > ' +
        '16C Acts and practices of overseas recipients of personal information',
    );
  });

  it('closes the Part when a Schedule opens, rather than nesting inside it', () => {
    // A Schedule is not part of the Part before it, and Australia keeps the Privacy Principles
    // there: leaving the Part open would file APP 8 under a Part it does not belong to.
    const { headings } = extractContents(FRL_TOC, 'https://www.legislation.gov.au/C2004A03712/latest/text');
    const app8 = headings.find((h) => h.includes('Principle 8'));
    expect(app8).toBe(
      'Schedule 1—Australian Privacy Principles > 8 Australian Privacy Principle 8—cross-border disclosure',
    );
  });

  it('ignores links that are not into the document', () => {
    const { headings } = extractContents(FRL_TOC, 'https://www.legislation.gov.au/C2004A03712/latest/text');
    expect(headings.some((h) => h.includes('Download'))).toBe(false);
  });
});

describe('contents that cost no request', () => {
  it('takes them from a document already parsed', () => {
    // A parsed document has already told us its headings. Re-fetching the same page to learn what
    // we hold would be a request spent on an answer we have.
    const db = openDb(':memory:');
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();
    db.prepare(
      `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at)
       VALUES (1,'SGP','Companies Act 1967','act','https://sso.agc.gov.sg/Act/CoA1967','portal','2026-09-07')`,
    ).run();
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (1,1,'https://sso.agc.gov.sg/Act/CoA1967','h','text/html',1,200,'2026-09-07')`,
    ).run();
    for (const [ordinal, path] of [
      [1, 'Part VI > 199 Accounting records'],
      [2, 'Part I > 1 Short title'],
    ] as [number, string][]) {
      db.prepare(
        `INSERT INTO section (document_id, ordinal, heading_path, text, char_start, char_end)
         VALUES (1, ?, ?, 'x', 0, 1)`,
      ).run(ordinal, path);
    }

    expect(contentsFromParsedSections(db, 1)).toEqual([
      'Part VI > 199 Accounting records',
      'Part I > 1 Short title',
    ]);
    db.close();
  });
});

describe('what costs a request and what does not', () => {
  it('takes every free contents before it asks the host for anything', async () => {
    // The measured failure. buildContents took free contents "first" -- but per instrument, inside
    // the fetch loop, walking the register in order. So a free instrument at position 350 waited
    // behind 349 paid ones, and when the host stopped answering at position 90 it was never
    // reached. That is how the Personal Data Protection Act, with 86 sections already parsed and
    // sitting in the store, finished a full crawl with no contents at all.
    //
    // Free work must never be queued behind work that can be refused.
    const { buildContents } = await import('../src/contents/index.js');
    const db = openDb(':memory:');
    db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('SGP','Singapore','[\"en\"]')").run();

    // Two instruments. The first needs a request; the second is already parsed, and sorts last.
    for (const [id, title] of [[1, 'Some Act 1999'], [2, 'Personal Data Protection Act 2012']] as [number, string][]) {
      db.prepare(
        `INSERT INTO instrument (id, economy_code, title, kind, source_url, discovered_via, discovered_at)
         VALUES (?, 'SGP', ?, 'act', ?, 'portal', '2026-09-07')`,
      ).run(id, title, `https://sso.agc.gov.sg/Act/A${id}`);
    }
    db.prepare(
      `INSERT INTO document (id, instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at)
       VALUES (1, 2, 'https://sso.agc.gov.sg/Act/A2', 'h', 'text/html', 1, 200, '2026-09-07')`,
    ).run();
    db.prepare(
      `INSERT INTO section (document_id, ordinal, heading_path, text, char_start, char_end)
       VALUES (1, 1, 'Part VI > 26 Transfer outside Singapore', 'x', 0, 1)`,
    ).run();

    // A host that refuses everything, exactly as SSO did.
    const fetcher = {
      fetch: async () => {
        const { SoftBlocked } = await import('../src/fetch/index.js');
        throw new SoftBlocked('https://sso.agc.gov.sg/Act/A1', 202);
      },
    };

    const progress = await buildContents(db, fetcher as never, { economy: 'SGP', kinds: ['act'] });
    expect(progress.fromParsed).toBe(1);

    // The one that needed nothing has its contents, despite the host refusing throughout.
    const got = db.prepare('SELECT heading_count n FROM instrument_contents WHERE instrument_id = 2').get() as
      | { n: number }
      | undefined;
    expect(got?.n).toBe(1);
    db.close();
  });
});
