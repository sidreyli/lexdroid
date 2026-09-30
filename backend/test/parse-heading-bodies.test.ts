/**
 * A heading's body, on pages that do not put it in the heading's next sibling.
 *
 * The defect, found in the Australia/Singapore run of 21 September 2026: the body walk looked at
 * `h.next()` and nothing else. Measured across the 215 cached pages this parser handles, it cost
 * text on 45 of them and duplicated text on 13. The .au Domain Administration Rules -- the
 * instrument 12.7 turns on -- fetched 520,638 bytes and parsed to 84 headings and 2,134
 * characters, none of which said anything; the Australian presence requirement was in the half
 * megabyte dropped, so the cell scored on a university naming rule instead.
 */
import { describe, expect, it } from 'vitest';
import { parseHtml } from '../src/parse/html.js';

const body = (html: string, heading: string): string => {
  const s = parseHtml(html, 'https://example.test/rules').sections.find((x) => x.text.startsWith(heading));
  return (s?.text ?? '').replace(/\s+/g, ' ').trim();
};

/** Shaped like auda.org.au: every heading in its own block, the body in the block after it. */
const WRAPPED = `<html><body><main>
  <section class="Heading"><h3>2.4 ELIGIBILITY</h3></section>
  <section><p>2.4.1 A Person applying for a Licence must have an Australian Presence.</p></section>
  <section class="Heading"><h3>2.5 TRANSFER</h3></section>
  <section><p>2.5.1 A Licence may be transferred with the consent of the Registrar.</p></section>
  ${'<p>padding to clear the minimum document length. </p>'.repeat(20)}
</main></body></html>`;

/** Shaped like apra.gov.au: the next heading nested inside a sibling block, not beside it. */
const NESTED = `<html><body><main>
  <h2>Chapter 2 - Financial resilience</h2>
  <div class="chapter"><p>An ADI must maintain capital against its exposures.</p>
    <h3>2.1 Capital adequacy</h3><p>The minimum ratio is set by the prudential standard.</p></div>
  ${'<p>padding to clear the minimum document length. </p>'.repeat(20)}
</main></body></html>`;

/** Shaped like oaic.gov.au: a trailing block above the last heading's own nesting level. */
const TRAILING = `<html><body><main>
  <div class="page"><h2>Procedure for reporting incidents</h2><p>Report within 30 days.</p></div>
  <div class="notes"><p>1 The Commissioner is the head of the Office.</p></div>
  <h2>Another heading</h2><p>So the page has two.</p>
  ${'<p>padding to clear the minimum document length. </p>'.repeat(20)}
</main></body></html>`;

describe('the body of a heading', () => {
  it('is found in the wrapper block after it, when the heading has no sibling of its own', () => {
    expect(body(WRAPPED, '2.4 ELIGIBILITY')).toContain('must have an Australian Presence');
  });

  it('stops at the next heading, wrapper and all', () => {
    // The whole cost of not stopping: every earlier heading carries every later one's text, so
    // the same words are retrieved under a heading that has nothing to do with them.
    expect(body(WRAPPED, '2.4 ELIGIBILITY')).not.toContain('may be transferred');
    expect(body(WRAPPED, '2.5 TRANSFER')).toContain('may be transferred');
  });

  it('keeps the text sitting ahead of a heading nested in a sibling block, and stops there', () => {
    const chapter = body(NESTED, 'Chapter 2');
    expect(chapter).toContain('must maintain capital against its exposures');
    expect(chapter).not.toContain('minimum ratio');
    expect(body(NESTED, '2.1 Capital adequacy')).toContain('minimum ratio');
  });

  it('reaches content that sits above the heading its own block holds', () => {
    expect(body(TRAILING, 'Procedure for reporting incidents')).toContain('the head of the Office');
  });

  it('gives every heading a section, whether or not it found a body', () => {
    // A part header with no text of its own is still a real heading and still anchors the trail.
    const doc = parseHtml(WRAPPED, 'https://example.test/rules');
    expect(doc.sections.map((s) => s.headingPath)).toContain('2.4 ELIGIBILITY');
    for (const s of doc.sections) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
});

/** Shaped like rbi.org.in: ASP.NET WebForms wraps the page in one form, under chrome headings. */
const WEBFORMS = `<html><body><form id="form1" method="post"><div role="main">
  <h1 class="page_title">Master Directions</h1>
  <table class="tablebg"><tr><td>
    <p>1. Short Title and Commencement. These Directions shall be called the Master Direction.</p>
    <p>2. Applicability. These Directions apply to every payment aggregator.</p>
    <p>3. Authorisation. No person shall act as a payment aggregator without authorisation.</p>
    ${'<p>The aggregator shall keep the funds in an escrow account with a scheduled bank. </p>'.repeat(12)}
  </td></tr></table>
  <h2 class="year">Archives</h2><p>2016 2015</p>
</div></form></body></html>`;

describe('a page the server wraps in one form', () => {
  it('keeps the form that holds the page', () => {
    const doc = parseHtml(WEBFORMS, 'https://example.test/md');
    expect(doc.unread).toBeNull();
    expect(doc.text).toContain('without authorisation');
  });

  it('drops a form that is only a search box', () => {
    const html = WEBFORMS.replace('<div role="main">', '<div role="main"><form><p>Search the site for anything you like</p></form>');
    expect(parseHtml(html, 'https://example.test/md').text).not.toContain('Search the site');
  });

  it('splits by numbered provisions when chrome headings leave the document under one of them', () => {
    const labels = parseHtml(WEBFORMS, 'https://example.test/md').sections.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['1', '2', '3']));
  });
});
