/**
 * The register drafts from more than one template, and only one of them was read.
 *
 * `parseFrl` keyed on the ActHead classes of the template Acts are drafted from. Determinations,
 * Instruments, Orders and Standards come from others, and a page exported as EPUB carries those
 * instead: paragraphs styled HP and HR, or LDClauseHeading, with the lettered paragraphs of a
 * section in <li> and a Part heading sometimes an <h2>. Finding no ActHead, the pass fell through
 * to the generic parser, which found no headings either and emitted the instrument as one section.
 *
 * The Telecommunications (Service Provider - Identity Checks for Prepaid Mobile Carriage Services)
 * Determination 2017 came out of that as a single section of 63,179 characters whose heading path
 * was the source URL. It is the instrument Australia's 8.3 turns on, and the reader, given
 * the blob, quoted "Requirements to be satisfied before service is activated" -- entry 4.2 of the
 * document's own table of contents, not the provision. 330 Australian documents were in that state.
 */
import { describe, expect, it } from 'vitest';
import { parseFrl } from '../src/parse/frl.js';

const URL = 'https://www.legislation.gov.au/F2017L00399/text/original/epub/OEBPS/document_1/document_1.html';

/** Shaped like the EPUB export: HP for a Part, HR for a section, <li> for the paragraphs. */
const epub = `<html><body>
  <p class="TOC2"><span class="Hyperlink">Part 4</span><span class="Hyperlink">Rules</span></p>
  <p class="TOC5"><span class="Hyperlink">4.2 Requirements to be satisfied</span></p>
  <p class="Header"><span class="CharDivNo">Division 9</span><span style="width:30pt; display:inline-block">&#xa0;</span><span class="CharDivText">Running header</span></p>
  <p class="HP"><a id="p4"><span class="CharPartNo">Part 4</span><span style="width:76pt; display:inline-block">&#xa0;</span><span class="CharPartText">Rules</span></a></p>
  <p class="HR"><a id="s42"><span class="CharSectno">4.2</span><span style="width:31pt; display:inline-block">&#xa0;</span><span>Requirements to be satisfied</span></a></p>
  <p class="R1"><span>(1) The provider must not activate the service unless the provider has:</span></p>
  <li class="R1"><span>obtained information from the customer; and</span></li>
  <li class="R1"><span>verified the identity of the customer under section 4.5.</span></li>
  <h2><a id="p6"><span class="CharPartNo">Part 6</span><span style="width:27pt; display:inline-block">&#xa0;</span><span class="CharPartText">Records</span></a></h2>
  <p class="HR"><a id="s61"><span class="CharSectno">6.1</span><span style="width:31pt; display:inline-block">&#xa0;</span><span>Provider to keep records</span></a></p>
  <p class="R1"><span>The provider must keep a record of each service supplied.</span></p>
  <p class="ActHead5"><span class="CharSectno">Endnotes</span></p>
  <p class="R1"><span>am F2019L00123; rep F2020L00456</span></p>
</body></html>`;

describe('an instrument exported as EPUB', () => {
  const doc = parseFrl(epub, URL);

  it('is read by the register parser rather than falling through to the generic one', () => {
    expect(doc.parser).toBe('frl');
  });

  it('is cut into its own sections instead of one blob', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['4.2', '6.1']);
  });

  it('files each section under the Part it is in, including a Part headed by <h2>', () => {
    expect(doc.sections[0]!.headingPath).toBe('Part 4 Rules > 4.2 Requirements to be satisfied');
    // Without the <h2>, 6.1 lands under Part 4 and the citation names the wrong Part.
    expect(doc.sections[1]!.headingPath).toBe('Part 6 Records > 6.1 Provider to keep records');
  });

  it('keeps the lettered paragraphs, which are <li> here and are where the duty is', () => {
    expect(doc.sections[0]!.text).toContain('verified the identity of the customer');
  });

  it('stops at the endnotes, which the EPUB heads with an ordinary section class', () => {
    // Amendment history quoted as law cites a repealed form of a provision as though in force.
    expect(doc.text).not.toContain('rep F2020L00456');
    expect(doc.sections.some((s) => s.headingPath.includes('Endnotes'))).toBe(false);
  });

  it('drops the contents list and the running header', () => {
    expect(doc.sections).toHaveLength(2);
    expect(doc.text).not.toContain('Running header');
  });

  it('holds the offset invariant every parser owes', () => {
    for (const s of doc.sections) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
});

/** The short instruments an authority signs: a fourth vocabulary, with no numbering span at all. */
const drafted = `<html><body>
  <p class="LDTitle"><span>Instrument number CASA 28/26</span></p>
  <p class="LDPartHeading"><span>Part 1</span><span style="width:30pt; display:inline-block">&#xa0;</span><span>Preliminary</span></p>
  <p class="LDClauseHeading"><span>2</span><span style="width:30pt; display:inline-block">&#xa0;</span><span>Duration</span></p>
  <p class="LDClause"><span>This instrument commences on 1 July 2026.</span></p>
  <p class="LDClauseHeading"><a id="c3"><span>3</span><span style="width:30pt; display:inline-block">&#xa0;</span><span>Definitions</span></a></p>
  <p class="LDdefinition"><span>ASIC</span><span> means the Australian Securities and Investments Commission.</span></p>
</body></html>`;

describe('an instrument drafted from the LD template', () => {
  const doc = parseFrl(drafted, URL);

  it('is cut on its own heading classes', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['2', '3']);
    expect(doc.sections[1]!.headingPath).toBe('Part 1 Preliminary > 3 Definitions');
  });

  it('carries the body of the clause with it', () => {
    expect(doc.sections[1]!.text).toContain('Australian Securities and Investments Commission');
  });
});
