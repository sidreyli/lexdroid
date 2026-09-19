/**
 * A compiled Act is several volumes, and each one repeats the front matter.
 *
 * `4cdd564` taught the pass to end at the word "Endnotes" so amendment history would stop parsing
 * as provisions. The word is not enough on its own. A compilation prints its whole arrangement
 * before it prints any of it, and the last line of that contents list is the word "Endnotes" in a
 * paragraph carrying no class at all -- so the pass ended at the contents page and every section of
 * the Act fell out. The Customs Act 1901 went from 1,257 sections to one blob of 2.4 million
 * characters; the Competition and Consumer Act and the Telecommunications Act went the same way.
 *
 * Two facts fix it, and both are about volumes rather than about Australia. Endnotes come after
 * operative text, so the word only closes a volume that has already printed a provision. And a
 * provision does not run across a volume boundary: left open, volume one's last section swallowed
 * volume two's contents page, whose own "Endnotes" line then closed that volume before it had
 * printed a word.
 *
 * Nothing in the suite assembled more than one volume, which is why it passed.
 */
import { describe, expect, it } from 'vitest';
import { PART_MARKER } from '../src/discover/frl.js';
import { parseFrl } from '../src/parse/frl.js';

const URL = 'https://www.legislation.gov.au/C1901A00006/latest/text';
const volumeUrl = (n: number) => `https://www.legislation.gov.au/C1901A00006/latest/text/original/epub/OEBPS/document_${n}/document_${n}.html`;

/** The arrangement a compilation prints before its text. Its last line names the endnotes. */
const contents = (part: string) => `
  <p><span style="font-size:18pt">Contents</span></p>
  <p class="TOC2"><span>${part}</span></p>
  <p class="TOC5"><span>1</span><span style="width:66pt; display:inline-block">&#xa0;</span><span>Short title</span></p>
  <p><span style="font-size:12pt">Endnotes</span></p>`;

const section = (no: string, heading: string, body: string) => `
  <p class="ActHead5"><a id="s${no}"><span class="CharSectno">${no}</span><span style="width:31pt; display:inline-block">&#xa0;</span><span>${heading}</span></a></p>
  <p class="subsection"><span>${body}</span></p>`;

const volume = (n: number, part: string, secs: string) =>
  `<!--${PART_MARKER}:${volumeUrl(n)}-->\n<html><body>${contents(part)}
  <p class="ActHead2"><span class="CharPartNo">${part}</span><span style="width:76pt; display:inline-block">&#xa0;</span><span class="CharPartText">Preliminary</span></p>
  ${secs}
  <p class="ENotesHeading1"><span>Endnotes</span></p>
  <p class="ENoteTableText"><span>am No 57, 2025</span></p>
</body></html>`;

const compilation = [
  volume(1, 'Part I', section('4', 'Definitions', 'In this Act, unless the contrary intention appears...')),
  volume(2, 'Part II', section('183UA', 'Interpretation', 'The Comptroller-General may authorise an officer...')),
  volume(3, 'Part III', section('273GA', 'Review of decisions', 'Applications may be made to the Tribunal...')),
].join('\n');

describe('an Act compiled in several volumes', () => {
  const doc = parseFrl(compilation, URL);

  it('is read by the register parser, not dropped to the generic one', () => {
    // The fallback is what turned the Customs Act into a single 2.4 million character section.
    expect(doc.parser).toBe('frl');
  });

  it('keeps every volume, not just the first', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['4', '183UA', '273GA']);
  });

  it('does not end at the contents list, which names the endnotes before any provision', () => {
    expect(doc.sections[0]!.text).toContain('unless the contrary intention appears');
  });

  it('gives each provision the volume it is actually in, so the citation resolves', () => {
    expect(doc.sections[1]!.anchor).toBe(`${volumeUrl(2)}#s183UA`);
  });

  it('still stops at each volume\'s real endnotes', () => {
    expect(doc.text).not.toContain('am No 57, 2025');
    expect(doc.sections.some((s) => /Endnote/.test(s.headingPath))).toBe(false);
  });

  it('does not let a provision run across a volume boundary', () => {
    // Left open, volume one's last section swallows volume two's contents page.
    expect(doc.sections[0]!.text).not.toContain('Part II');
  });

  it('holds the offset invariant every parser owes', () => {
    for (const s of doc.sections) {
      expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    }
  });
});
