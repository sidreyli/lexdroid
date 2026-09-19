/**
 * The pages no template covers.
 *
 * After the three templates `parseFrl` knows, 415 Australian documents still fell through to the
 * generic parser, and 221 of them came out as a single section -- among them ASIC's class orders,
 * the Food Standards Code and a national code of practice, each of which numbers its provisions
 * plainly on the page. They are drafted in house styles: LI-Heading2, FSCh5Section, Clauseheadding,
 * a bare <h2>. What they share is a paragraph styled as a heading whose text opens with the
 * provision's number, and that is what the second pass reads.
 */
import { describe, expect, it } from 'vitest';
import { parseFrl } from '../src/parse/frl.js';

const URL = 'https://www.legislation.gov.au/F2016L00000/latest/text';

/** An agency's own template: LI-Heading1 for a Part, LI-Heading2 for a section, captions in LI-Heading3. */
const houseStyle = `<html><body>
  <p class="LI-Title">ASIC Corporations (Example) Instrument 2016/1</p>
  <p class="LI-Fronttextheading1">About this compilation</p>
  <p class="LI-Fronttext">This is a compilation of the instrument.</p>
  <p class="TOC2"><a href="#s1">1 Name of legislative instrument</a></p>
  <p class="LI-Heading1">Part 1—Preliminary</p>
  <p class="LI-Heading2"><a id="s1"></a>1 Name of legislative instrument</p>
  <p class="LI-BodyTextUnnumbered">This instrument is the ASIC Corporations (Example) Instrument 2016/1.</p>
  <p class="LI-Heading1">Part 2—Declaration</p>
  <p class="LI-Heading2">5 Relief from the Shorter PDS regime</p>
  <p class="LI-BodyTextNumbered">Part 7.9 of the Act applies as if:</p>
  <p class="LI-Heading3">Simple sub-funds: multifunds</p>
  <p class="LI-BodyTextParaa">(a) a simple sub-fund is a multifund.</p>
  <p class="ENotesHeading1">Endnotes</p>
  <p class="ENoteTableText">am F2026L00920</p>
</body></html>`;

/** A code whose Standards are headed "Standard 1", under a Part lettered rather than numbered. */
const code = `<html><body>
  <h1>National Code of Practice 2018</h1>
  <h1>Part A – The framework</h1>
  <h2>1 Purpose</h2>
  <p class="BodyText">The Code sets standards.</p>
  <h1>Part B – Standards</h1>
  <p class="BodyText">Each Standard below binds a registered provider.</p>
  <h2>Standard 1</h2>
  <h3>Marketing information and practices</h3>
  <li class="BodyText">The registered provider must not make false or misleading claims.</li>
  <h2>Standard 2</h2>
  <li class="BodyText">The registered provider must give information before enrolment.</li>
</body></html>`;

describe('an instrument in a house style', () => {
  const doc = parseFrl(houseStyle, URL);

  it('is read by the styled pass rather than the generic parser', () => {
    expect(doc.parser).toBe('frl-styled');
  });

  it('cuts at the numbered headings and files each under its Part', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '5']);
    expect(doc.sections[1]!.headingPath).toBe('Part 2—Declaration > 5 Relief from the Shorter PDS regime');
  });

  it('keeps a caption with no number inside the provision it captions', () => {
    expect(doc.sections[1]!.text).toContain('Simple sub-funds: multifunds');
    expect(doc.sections[1]!.text).toContain('a simple sub-fund is a multifund');
  });

  it('keeps the anchor, and stops at the endnotes', () => {
    expect(doc.sections[0]!.anchor).toBe('s1');
    expect(doc.sections.some((s) => s.text.includes('F2026L00920'))).toBe(false);
  });
});

describe('a code whose provisions name their kind', () => {
  const doc = parseFrl(code, URL);

  it('opens a provision at "Standard 1", which carries no bare number', () => {
    expect(doc.sections.map((s) => s.label)).toContain('Standard 1');
    expect(doc.sections.map((s) => s.label)).toContain('Standard 2');
  });

  it('does not drop text that sits under a Part before its first provision', () => {
    // A heading with no number used to leave the text under it in no provision at all, and it
    // was lost: four fifths of one code of practice.
    const all = doc.sections.map((s) => s.text).join('\n');
    expect(all).toContain('Each Standard below binds a registered provider.');
    expect(all).toContain('must not make false or misleading claims');
    expect(all).toContain('must give information before enrolment');
  });
});

describe('a page with one numbered heading', () => {
  it('is left to the generic parser, since one heading may just be a title', () => {
    const doc = parseFrl(`<html><body><h1>2016 Determination</h1><p>It says one thing.</p></body></html>`, URL);
    expect(doc.parser).toBe('frl-generic');
  });
});

describe('a heading styled by hand', () => {
  // Part 2 onward of an ASIC instrument: the drafter bolded the heading instead of applying the
  // style, so it has no class. The contents list still links to it, and that is the mark.
  const page = `<html><body>
    <p class="TOC2"><a href="#t1">1 Name</a></p>
    <p class="TOC2"><a href="#t4">4 Minimum standards</a></p>
    <p class="LI-Heading2"><a id="t1"></a>1 Name</p>
    <p>This instrument is the Custody Standards Instrument.</p>
    <p style="font-weight:bold"><a id="t4"><span style="font-weight:bold">4</span> <span>Minimum standards</span></a></p>
    <p>(1) The licensee must hold custodial property on trust.</p>
  </body></html>`;
  const doc = parseFrl(page, URL);

  it('is found through the contents entry that links to it', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '4']);
    expect(doc.sections[1]!.text).toContain('must hold custodial property on trust');
  });
});
