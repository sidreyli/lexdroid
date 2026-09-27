/**
 * The parsers.
 *
 * The offset invariant is asserted for every one of them, because it is what every citation in
 * the export ultimately rests on.
 */
import { describe, expect, it } from 'vitest';
import { nodeText } from '../src/parse/html-text.js';
import { parseHtml } from '../src/parse/html.js';
import { parseFrl } from '../src/parse/frl.js';
import { sectionise, runningHeader } from '../src/parse/pdf.js';
import { parseSso, provisionIds } from '../src/parse/sso.js';
import { PART_MARKER } from '../src/discover/frl.js';
import { citationUrl } from '../src/export/index.js';
import type { ParsedDocument } from '../src/parse/types.js';

function offsetsHold(doc: ParsedDocument): void {
  for (const s of doc.sections) {
    expect(doc.text.slice(s.charStart, s.charEnd), `section ${s.ordinal} (${s.headingPath})`).toBe(s.text);
  }
}

/** Shaped exactly like Singapore Statutes Online: a contents list, then the provisions. */
const SSO_HTML = `
<html><head><title>Test Act 2012 - Singapore Statutes Online</title></head><body>
<p class="HeadingParagraph filter"><label><b>Part 1 PRELIMINARY</b></label></p>
<div><blockquote class="TocParagraph"><div>
  <input type="checkbox" name="item" value="pr1-" class="form-check-input childID" id="c1"/>
  <label for="c1">1 Short title</label></div></blockquote></div>
<p class="HeadingParagraph filter"><label><b>Part 6 CARE OF PERSONAL DATA</b></label></p>
<div><blockquote class="TocParagraph"><div>
  <input type="checkbox" name="item" value="pr26-" class="form-check-input childID" id="c2"/>
  <label for="c2">26 Transfer of personal data outside Singapore</label></div></blockquote></div>
<div><blockquote class="TocParagraph"><div>
  <input type="checkbox" name="item" value="pr27-" class="form-check-input childID" id="c3"/>
  <label for="c3">27 (Repealed)</label></div></blockquote></div>

<ul class="left">
  <li class="mobile selected" data-id="a"><div class="timestamp"><span><a href="#">05 Dec 2025</a></span></div>
    <div class="group_status"><div><span>Amended by</span><br/><a href="#">Act 19 of 2025</a></div></div></li>
  <li class="mobile" data-id="b"><div class="timestamp"><span><a href="#">02 Jan 2013</a></span></div>
    <div class="group_status"><div><span>Act 26 of 2012</span></div></div></li>
</ul>

<div id="legisContent">
  <div class="prov1"><table><tr><td class="prov1Hdr" id="pr1-"><span>Short title</span></td></tr></table>
    <table><tr><td class="prov1Txt"><strong>1.</strong>&#xA0;&#xA0;This Act is the Test Act 2012.</td></tr></table></div>
  <div class="prov1"><table><tr><td class="prov1Hdr" id="pr26-"><span>Transfer of personal data outside Singapore</span></td></tr></table>
    <table><tr><td class="prov1Txt"><strong>26.</strong><span class="prov2TxtIL">&#8212;(1)&#xA0;&#xA0;An organisation must not transfer any personal data to a country outside Singapore except in accordance with requirements prescribed under this Act.</span>
      <table><tr><td class="prov2Txt">(2)&#xA0;&#xA0;An exemption under subsection&#160;(1)&#160;&#8212;
        <table class="p1_1"><tr><td class="p1No">(<em>a</em>)</td><td class="pTxt">may be granted subject to conditions; and</td></tr>
        <tr><td class="p1No">(<em>b</em>)</td><td class="pTxt">need not be published in the <em>Gazette</em>.</td></tr></table>
      </td></tr></table></td></tr></table></div>
</div></body></html>`;

describe('html to text', () => {
  it('separates table cells but not inline emphasis', () => {
    // "(<em>a</em>)" must come out "(a)", and the two cells of a paragraph row must not run
    // together into "(a)may be granted".
    const text = nodeText([]);
    expect(text).toBe('');
    const doc = parseSso(SSO_HTML, 'https://sso.agc.gov.sg/Act/TEST2012');
    const s26 = doc.sections.find((s) => s.label === '26')!;
    expect(s26.text).toContain('(a) may be granted subject to conditions');
    expect(s26.text).not.toContain('( a )');
    expect(s26.text).not.toContain('(a)may');
  });

  it('turns the non-breaking spaces of legislative markup into ordinary ones', () => {
    const doc = parseSso(SSO_HTML, 'https://sso.agc.gov.sg/Act/TEST2012');
    expect(doc.text).not.toMatch(/ /);
    expect(doc.sections.find((s) => s.label === '26')!.text).toContain('26.—(1) An organisation');
  });
});

describe('the Singapore Statutes Online parser', () => {
  const doc = parseSso(SSO_HTML, 'https://sso.agc.gov.sg/Act/TEST2012');

  it('keeps section offsets that round-trip against the stored text', () => offsetsHold(doc));

  it('builds the heading path from the Part structure in the contents', () => {
    const s26 = doc.sections.find((s) => s.label === '26')!;
    expect(s26.headingPath).toBe('Part 6 CARE OF PERSONAL DATA > 26 Transfer of personal data outside Singapore');
  });

  it('keeps the provision id, which is the deep link a reviewer follows', () => {
    expect(doc.sections.find((s) => s.label === '26')!.anchor).toBe('pr26-');
  });

  it('reads the act number and both dates off the version timeline', () => {
    expect(doc.meta['officialNumber']).toBe('Act 26 of 2012');
    expect(doc.meta['commencedOn']).toBe('2013-01-02');
    expect(doc.meta['lastAmendedOn']).toBe('2025-12-05');
    expect(doc.meta['commencementBasis']).toContain('02 Jan 2013');
  });

  it('does not call a document partial because its repealed sections have no text', () => {
    // The contents lists "27 (Repealed)" and the site serves no body for it. Counting that as a
    // missing provision would raise the flag on nearly every amended Act, and a warning that
    // fires on everything is one nobody reads.
    expect(provisionIds(SSO_HTML)).toContain('pr27-');
    expect(doc.meta['repealedProvisions']).toBe('1');
    expect(doc.meta['partial']).toBeUndefined();
  });

  it('reports a page that served none of its provisions rather than indexing it empty', () => {
    const tocOnly = SSO_HTML.replace(/<div id="legisContent">[\s\S]*?<\/body>/, '<div id="legisContent"></div></body>');
    const parsed = parseSso(tocOnly, 'https://sso.agc.gov.sg/Act/TEST2012');
    expect(parsed.sections).toHaveLength(0);
    expect(parsed.unread?.reason).toBe('landing-page');
    expect(parsed.unread?.detail).toContain('listed 3 provisions');
  });
});

describe('the generic HTML parser', () => {
  it('records an index of links as a landing page, not as a document that says nothing', () => {
    // This is the v1 failure: a regulator's list of circulars parsed as a document, indexed, and
    // then cited as evidence that the corpus contains no requirement.
    const links = Array.from({ length: 40 }, (_v, i) => `<li><a href="/c/${i}">Circular ${i} of 2024 on the supervision of payment services</a></li>`).join('');
    const parsed = parseHtml(`<html><body><main><h1>Circulars</h1><ul>${links}</ul></main></body></html>`, 'https://example.gov/circulars');
    expect(parsed.unread?.reason).toBe('landing-page');
    expect(parsed.sections).toHaveLength(0);
  });

  it('splits on headings and keeps offsets that round-trip', () => {
    const body = 'Every provider must retain transaction records for a period of not less than five years. '.repeat(8);
    const parsed = parseHtml(
      `<html><body><main><h1>Guideline on Record Keeping</h1><h2>1. Scope</h2><p>${body}</p><h2>2. Retention</h2><p>${body}</p></main></body></html>`,
      'https://example.gov/guideline',
    );
    expect(parsed.unread).toBeNull();
    expect(parsed.sections.length).toBeGreaterThanOrEqual(2);
    offsetsHold(parsed);
  });

  it('calls a page with almost no text empty rather than indexing it', () => {
    const parsed = parseHtml('<html><body><main><p>Page not found.</p></main></body></html>', 'https://example.gov/404');
    expect(parsed.unread?.reason).toBe('empty');
  });
});


/**
 * Shaped exactly like a Federal Register compilation: front matter that dates itself, a contents
 * list in the body, the provisions, then the endnotes.
 */
const OPC_BODY = `
<p><span>Test Act 1988</span></p>
<p><span>No.</span><span>&#xa0;</span><span>119, 1988</span></p>
<p><span>Compilation date:</span><span>&#xa0;</span><span>4 June 2026</span></p>
<p><span>This is a compilation of the Test Act 1988 that shows the text of the law as amended and in force on 4 June 2026 (the compilation date).</span></p>
<p><span>Includes amendments:</span><span>&#xa0;</span><span>Act No. 75, 2025</span></p>
<p class="TOC1"><span>Part I&#x2014;Preliminary</span></p>
<p class="TOC5"><span>1&#xa0; Short title</span></p>
<p class="ActHead2"><a id="_Toc1"><span class="CharPartNo">Part</span><span>&#xa0;</span><span class="CharPartNo">I</span><span>&#x2014;</span><span class="CharPartText">Preliminary</span></a></p>
<p class="ActHead5"><a id="_Toc2"><span class="CharSectno">1</span><span>&#xa0; </span><span>Short title</span></a></p>
<p class="subsection"><span>&#xa0;</span><span>(1)</span><span>&#xa0;</span><span>This Act may be cited as the Test Act 1988.</span></p>
<p class="notetext"><span>Note: an editorial note, not law.</span></p>
<p class="ActHead3"><a id="_Toc3"><span class="CharDivNo">Division 2</span><span>&#x2014;</span><span class="CharDivText">Records</span></a></p>
<p class="ActHead5"><a id="_Toc4"><span class="CharSectno">2</span><span>&#xa0; </span><span>Keeping records</span></a></p>
<p class="subsection"><span>(1)</span><span>&#xa0;</span><span>A person must retain every such record for a period of not less than 3 years.</span></p>
`;

const OPC_ENDNOTES = `
<p class="ENotesHeading1"><a id="_Toc9"><span>Endnotes</span></a></p>
<p class="ENoteTableText"><span>Privacy Amendment Act 2025, am No 75, 2025</span></p>
`;

const FRL_HTML = `<html><head><title>Test Act 1988</title></head><body>${OPC_BODY}${OPC_ENDNOTES}</body></html>`;
const FRL_URL = 'https://www.legislation.gov.au/C1988A00119/2026-06-04/2026-06-04/text/original/epub/OEBPS/document_1/document_1.html';

describe('the Federal Register of Legislation parser', () => {
  const doc = parseFrl(FRL_HTML, FRL_URL);

  it('reads the drafting template rather than guessing where provisions begin', () => {
    expect(doc.parser).toBe('frl');
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2']);
    expect(doc.sections[0]!.headingPath).toBe('Part I—Preliminary > 1 Short title');
    expect(doc.sections[1]!.headingPath).toBe('Part I—Preliminary > Division 2—Records > 2 Keeping records');
    offsetsHold(doc);
  });

  it('takes the compilation date from the sentence that states it', () => {
    expect(doc.meta['lastAmendedOn']).toBe('2026-06-04');
    expect(doc.meta['lastAmendedBasis']).toContain('as amended and in force on 4 June 2026');
    expect(doc.meta['officialNumber']).toBe('No. 119, 1988');
  });

  it('leaves out the contents list, the editorial notes and the endnotes', () => {
    const all = doc.sections.map((s) => s.text).join('\n');
    expect(all).not.toContain('an editorial note');
    expect(all).not.toContain('am No 75, 2025');
    expect(doc.sections).toHaveLength(2);
  });

  it('gives a single-volume compilation a bare fragment, which its own URL carries', () => {
    expect(doc.sections[1]!.anchor).toBe('_Toc4');
    expect(citationUrl(FRL_URL, doc.sections[1]!.anchor)).toBe(`${FRL_URL}#_Toc4`);
  });
});

describe('a compilation published in several volumes', () => {
  const one = 'https://www.legislation.gov.au/C2004A00818/2026-07-01/2026-07-01/text/original/epub/OEBPS/document_1/document_1.html';
  const two = 'https://www.legislation.gov.au/C2004A00818/2026-07-01/2026-07-01/text/original/epub/OEBPS/document_2/document_2.html';
  const titlePage = 'https://www.legislation.gov.au/C2004A00818/latest/text';
  const merged =
    `<!--${PART_MARKER}:${one}--><html><body>${OPC_BODY}</body></html>` +
    `<!--${PART_MARKER}:${two}--><html><body>` +
    `<p class="ActHead5"><a id="_Toc7"><span class="CharSectno">300</span><span>&#xa0; </span><span>Later provision</span></a></p>` +
    `<p class="subsection"><span>(1)</span><span>&#xa0;</span><span>A later duty.</span></p>` +
    `${OPC_ENDNOTES}</body></html>`;

  const doc = parseFrl(merged, titlePage);

  it('reads every volume, not just the first', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2', '300']);
    expect(doc.meta['volumes']).toBe('2');
    offsetsHold(doc);
  });

  // A link into volume one for a provision in volume three is a link to the wrong page, and the
  // pinpoint gate would pass it, because it has a fragment on an official host.
  it('links each provision to the volume it is actually in', () => {
    expect(citationUrl(titlePage, doc.sections[0]!.anchor)).toBe(`${one}#_Toc2`);
    expect(citationUrl(titlePage, doc.sections[2]!.anchor)).toBe(`${two}#_Toc7`);
  });
});

describe('a PDF that opens with its own arrangement of sections', () => {
  // Shaped like a Laws of Malaysia reprint: the contents list, then the Act.
  const pages = [
    { page: 1, lines: ['LAWS OF MALAYSIA', 'ARRANGEMENT OF SECTIONS', '4. Short title', '129. Transfer of personal data to places outside Malaysia'] },
    { page: 2, lines: ['4. Short title', 'This Act may be cited as the Test Act 2010.'] },
    { page: 3, lines: ['129. Transfer of personal data to places outside Malaysia', 'A data user shall not transfer any personal data to a place outside Malaysia.'] },
    { page: 4, lines: ['200. This section stands alone and has no entry in the contents.'] },
  ];
  const built = sectionise(pages);

  it('indexes each provision once, from the copy that has a body', () => {
    expect(built.sections.map((s) => s.label)).toEqual(['4', '129', '200']);
    expect(built.sections[1]!.text).toContain('shall not transfer any personal data');
    expect(built.sections[1]!.page).toBe(3);
  });

  it('keeps a one-line provision that is genuinely one line', () => {
    expect(built.sections[2]!.text).toContain('stands alone');
  });

  it('holds the offset invariant after the contents entries are left out', () => {
    for (const s of built.sections) expect(built.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
});

describe('a PDF whose front matter follows its arrangement of sections', () => {
  // Malaysia's Cyber Security Act, in shape: the last contents entry was swallowing the cover page
  // and the long title, which made it the longest copy of section 64 and hid the real one.
  const pages = [
    { page: 1, lines: ['ARRANGEMENT OF SECTIONS', '1. Short title', '64. Saving'] },
    {
      page: 2,
      lines: [
        'LAWS OF MALAYSIA',
        'Act 854',
        'An Act to enhance the national cyber security by providing for the establishment of the',
        'National Cyber Security Committee, and to provide for related matters.',
        'ENACTED by the Parliament of Malaysia as follows:',
      ],
    },
    { page: 3, lines: ['1. (1) This Act may be cited as the Cyber Security Act 2024.'] },
    { page: 4, lines: ['64. Nothing in this Act affects anything done under the repealed Act.'] },
  ];
  const built = sectionise(pages);

  it('keeps the long title, which is where an Act says what it is for', () => {
    const opening = built.sections.find((s) => s.headingPath === 'Long title');
    expect(opening?.text).toContain('An Act to enhance the national cyber security');
    expect(opening?.text).not.toContain('ENACTED by');
  });

  it('indexes the provision that has a body, not the contents entry that swallowed the cover', () => {
    const s64 = built.sections.filter((s) => s.label === '64');
    expect(s64).toHaveLength(1);
    expect(s64[0]!.text).toContain('affects anything done under the repealed Act');
  });

  it('holds the offset invariant with the long title in the document', () => {
    for (const s of built.sections) expect(built.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
});

describe('Indian PDF provision labels and source language', () => {
  it('keeps a decimal label that is followed by its heading without another dot', () => {
    const built = sectionise([
      {
        page: 1,
        language: 'en',
        lines: ['12.5 Definitions', 'For the purposes of this rule, space activity includes launch operations.'],
      },
    ]);
    expect(built.sections.map((section) => section.label)).toEqual(['12.5']);
    expect(built.sections[0]?.language).toBe('en');
  });

  it('carries a Hindi page language into the section a quotation comes from', () => {
    const built = sectionise([
      {
        page: 1,
        language: 'hi',
        lines: ['1. संक्षिप्त नाम', 'इस अधिनियम का संक्षिप्त नाम उदाहरण अधिनियम है।'],
      },
    ]);
    expect(built.sections[0]?.language).toBe('hi');
  });

  it('keeps matching provision labels in each language of a bilingual instrument', () => {
    const built = sectionise([
      {
        page: 1,
        language: 'hi',
        lines: ['1. संक्षिप्त नाम', 'इन नियमों का संक्षिप्त नाम उदाहरण नियम, 2024 है।'],
      },
      {
        page: 2,
        language: 'en',
        lines: ['1. Short title', 'These rules may be called the Example Rules, 2024.'],
      },
    ]);

    expect(built.sections.map((section) => `${section.language}:${section.label}`)).toEqual(['hi:1', 'en:1']);
    for (const section of built.sections) {
      expect(built.text.slice(section.charStart, section.charEnd)).toBe(section.text);
    }
  });
});


describe('the name a document repeats on its own pages', () => {
  const paged = (header: string[], n = 8): { page: number; lines: string[] }[] =>
    Array.from({ length: n }, (_, i) => ({ page: i + 1, lines: [...header, `body of page ${i + 1}`] }));

  it('takes a running header over a cover page laid out in the wrong order', () => {
    const pages = [
      { page: 1, lines: ['Protection Code', 'Of Practice', 'For The Banking And'] },
      ...paged(['PDP Code Of Practice For The Banking And Financial Sector']),
    ];
    expect(runningHeader(pages)).toBe('PDP Code Of Practice For The Banking And Financial Sector');
  });

  it('drops a trailing schedule number, so two schedules give one name', () => {
    const pages = [
      ...paged(['PDP Code Of Practice For The Banking Sector Schedule 1'], 5),
      ...paged(['PDP Code Of Practice For The Banking Sector Appendix 4'], 4),
    ];
    expect(runningHeader(pages)).toBe('PDP Code Of Practice For The Banking Sector');
  });

  it('rejoins a header set on two lines', () => {
    expect(runningHeader(paged(['Personal Data Protection', 'For The Utilities Sector (Water)'])))
      .toBe('Personal Data Protection For The Utilities Sector (Water)');
  });

  it('is silent rather than wrong when nothing repeats', () => {
    const pages = Array.from({ length: 8 }, (_, i) => ({ page: i + 1, lines: [`only page ${i + 1} text here`] }));
    expect(runningHeader(pages)).toBeNull();
  });

  it('ignores the rules and dot leaders that repeat on every page', () => {
    expect(runningHeader(paged(['_______________________________________']))).toBeNull();
  });
});
