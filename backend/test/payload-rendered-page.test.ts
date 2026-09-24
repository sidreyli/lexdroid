/**
 * A page the browser assembles, read from the payload it was sent instead of built markup.
 *
 * IMDA and PDPC serve React server-rendered pages: the markup is a shell, and the content arrives
 * as a flight stream pushed in `self.__next_f.push([1, "..."])` calls. Parsed as served, the
 * Telecom Competition Code page was 71% script and 469 characters of text, so it was recorded
 * unread and empty -- and with it the Telecommunications Act's table of instruments, the Internet
 * Content Regulation page, the online safety codes and sixteen others. Twenty of Singapore's
 * twenty-four IMDA pages and six of its nineteen PDPC pages went that way.
 *
 * The second reading is given only to a page that read empty, and kept only if it reads better,
 * because a site that renders both should be read from its own HTML rather than from a payload we
 * reassemble.
 */
import { describe, expect, it } from 'vitest';
import { parseHtml } from '../src/parse/html.js';

const PROVISION =
  'A dominant licensee must provide interconnection to any requesting licensee on terms no less '
  + 'favourable than those it provides to itself, and must publish its reference interconnection '
  + 'offer within 30 days of a direction by the Authority. A dominant licensee must not bundle any '
  + 'service in a way that forecloses a competing licensee from the market, and must keep separate '
  + 'accounts for each licensed activity it carries on. The Authority may direct a dominant licensee '
  + 'to amend an offer that does not comply with this section, and the licensee must give effect to '
  + 'that direction within the period the Authority specifies. A licensee that fails to comply with '
  + 'a direction under this section is liable to a financial penalty, and the Authority may publish '
  + 'the fact of the failure. Nothing in this section requires a licensee to disclose information '
  + 'that is subject to a duty of confidence owed to a third party.';

/** A flight row: an id, its length in hex, then exactly that many characters. */
function row(id: string, text: string): string {
  return '\n' + id + ':T' + text.length.toString(16) + ',' + text;
}

/** What a React server-rendered page looks like on the wire: a shell, and the content pushed. */
function pageWithPayload(rows: string, shellText = 'Skip to main content'): string {
  const flight = ['1:HL["/_next/static/css/a.css","style"]', rows.replace(/^\n/, '')].join('\n');
  const chunks = [];
  // The stream arrives in pieces, and a row can be split across two of them.
  for (let i = 0; i < flight.length; i += 400) {
    chunks.push('<script>self.__next_f.push([1,' + JSON.stringify(flight.slice(i, i + 400)) + '])</script>');
  }
  return (
    '<html><head><title>Telecom Competition Code</title></head><body>'
    + '<main><div>' + shellText + '</div></main>'
    + chunks.join('')
    + '</body></html>'
  );
}

describe('a page whose content is in its payload', () => {
  it('is read from the payload when its own markup is empty', () => {
    const got = parseHtml(pageWithPayload(row('2b', '<div><h2>Interconnection</h2><p>' + PROVISION + '</p></div>')), 'https://www.imda.gov.sg/x');

    expect(got.unread).toBe(null);
    expect(got.text).toContain('must publish its reference interconnection offer');
    expect(got.sections.length).toBeGreaterThan(0);
  });

  it('keeps the title the page itself gave, because the payload has no head', () => {
    const got = parseHtml(pageWithPayload(row('2b', '<div><h2>Interconnection</h2><p>' + PROVISION + '</p></div>')), 'https://www.imda.gov.sg/x');

    expect(got.title).toBe('Telecom Competition Code');
  });

  it('reassembles a row that arrived split across two pushed chunks', () => {
    // 400 characters a chunk against a provision of 500 and more: the split is the point.
    const long = row('2b', '<div><h2>Interconnection</h2><p>' + PROVISION + PROVISION + '</p></div>');
    const got = parseHtml(pageWithPayload(long), 'https://www.imda.gov.sg/x');

    expect(got.unread).toBe(null);
    expect(got.text).toContain('separate accounts for each licensed activity');
  });

  it('calls a payload of links what it is, rather than reading a table of PDFs as a provision', () => {
    const titles = [
      'Telecom Competition Code 2012',
      'Telecommunications (Class Licences) Notification 2001',
      'Code of Practice for Competition in the Provision of Telecommunication Services',
      'Telecommunications (Designated Telecommunication Licensees) Notification 2017',
      'Guidelines on the Use of Telecommunication Riser Ducts and Lead-in Pipes',
      'Code of Practice for Info-communication Facilities in Buildings 2013',
      'Telecommunication Cybersecurity Code of Practice 2022',
      'Fixed Number Portability Guidelines for Telecommunication Licensees',
      'Exemption from Dominant Licensee Obligations in the Telecom Competition Code',
      'Guidelines for the Subscriber Verification Process for Prepaid Services',
    ];
    const table = '<div><table><tbody>'
      + titles.map((t, n) => '<tr><td><a href="/assets/' + n + '.pdf">' + t + '</a></td></tr>').join('')
      + '</tbody></table></div>';
    const got = parseHtml(pageWithPayload(row('2b', table)), 'https://www.imda.gov.sg/x');

    expect(got.unread?.reason).toBe('landing-page');
  });

  it('leaves a page that reads on its own markup alone, payload or no payload', () => {
    const served =
      '<html><head><title>Read me</title></head><body><main><h2>Interconnection</h2><p>'
      + PROVISION
      + '</p></main><script>self.__next_f.push([1,'
      + JSON.stringify('\n2b:T9,<p>tiny</p>')
      + '])</script></body></html>';
    const got = parseHtml(served, 'https://www.imda.gov.sg/x');

    expect(got.unread).toBe(null);
    expect(got.text).toContain('must publish its reference interconnection offer');
    expect(got.text).not.toContain('tiny');
  });

  it('still reports the page its own character count where the payload reads no better', () => {
    const got = parseHtml(pageWithPayload(row('2b', '<p>Nothing much.</p>')), 'https://www.imda.gov.sg/x');

    expect(got.unread?.reason).toBe('empty');
    // The page's own text, not the payload's: the detail has to describe what was served.
    expect(got.unread?.detail).toContain('yielded 20 characters');
  });

  it('reads a page with no payload exactly as before', () => {
    const got = parseHtml('<html><head><title>T</title></head><body><main><p>Too short.</p></main></body></html>', 'https://x.gov.sg/y');

    expect(got.unread?.reason).toBe('empty');
    expect(got.unread?.detail).toContain('yielded 10 characters');
  });
});
