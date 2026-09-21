/**
 * Mongolia's register, and the two things that would make it quietly wrong.
 *
 * `legalinfo.mn` is the most tractable portal this repository has profiled, and both of its
 * hazards are silent ones.
 *
 * The listing does not say what kind of instrument a row is -- the category does. A title like
 * "ЖУРАМ БАТЛАХ ТУХАЙ" (on approving a procedure) names the thing being approved, not the
 * instrument approving it, so a kind guessed from the title would be wrong for most of the
 * corpus. The adapter walks one category at a time and takes the kind from the category, which
 * makes it evidence from the register rather than an inference.
 *
 * And the portal publishes its own count per category, so a shortfall is exact rather than
 * inferred from a results line -- the same property Australia's OData count gives `frl`. A
 * category that returns materially fewer rows than the portal states is a finding, and one that
 * returns them silently is how a corpus ends up smaller than anyone believes.
 */
import { describe, expect, it } from 'vitest';
import { CATEGORIES, rowsFrom } from '../src/discover/legalinfo.js';

/** One row, marked up the way the live endpoint marks its own fields. */
const row = (id: string, title: string, enacted: string, effective: string) => `
<div class="legal-list-component uk-flex-middle uk-grid-collapse">
  <div class="uk-width-0-5-10"><span class="txt-number">1</span></div>
  <div class="uk-width-5-5-10" data-block="title">
    <div class="uk-text-left"><a target="_blank" href="https://legalinfo.mn/mn/detail?lawId=${id}" class="act-name fw-500">${title}</a></div>
    <span style="font-style: italic">Төрийн мэдээлэл эмхэтгэл: 1996 он, №03</span>
  </div>
  <div class="uk-width-1-5-10" data-block="enacteddate"><span> ${enacted}</span></div>
  <div class="uk-width-1-5-10" data-block="enforcementdate"><span>${effective}</span></div>
  <div class="uk-width-01-5-10" data-block="inactive"><span><i class="fa fa-check"></i></span></div>
</div>`;

describe('a page of the Mongolian register', () => {
  it('reads the title, the document url and the dates off the fields the fragment marks', () => {
    const html = row('16532151599871', 'ЖУРАМ БАТЛАХ ТУХАЙ', '2022-06-10', '2022-10-03');
    const [found] = rowsFrom(html, 'notice');
    expect(found).toBeDefined();
    expect(found!.title).toBe('ЖУРАМ БАТЛАХ ТУХАЙ');
    expect(found!.url).toBe('https://legalinfo.mn/mn/detail?lawId=16532151599871');
    expect(found!.kind).toBe('notice');
  });

  it('commences on the day the instrument takes effect, not the day it was passed', () => {
    // The two differ by four months on the sampled row, and the export's timeframe column is
    // built from the one that says when the duty started applying.
    const [found] = rowsFrom(row('1', 'ЖУРАМ БАТЛАХ ТУХАЙ', '2022-06-10', '2022-10-03'), 'notice');
    expect(found!.commencedOn).toBe('2022-10-03');
  });

  it('falls back to the enacted date where the listing leaves the effective one blank', () => {
    const [found] = rowsFrom(row('1', 'ЖУРАМ БАТЛАХ ТУХАЙ', '2022-06-10', ''), 'notice');
    expect(found!.commencedOn).toBe('2022-06-10');
  });

  it('says which listing it came off, rather than inferring standing from the document', () => {
    const [found] = rowsFrom(row('1', 'ЖУРАМ БАТЛАХ ТУХАЙ', '2022-06-10', '2022-10-03'), 'notice');
    expect(found!.status).toBe('in-force');
    expect(found!.statusBasis).toContain('Хүчинтэй');
  });

  it('takes the kind from the category walked, because the title does not carry it', () => {
    // "ЖУРАМ БАТЛАХ ТУХАЙ" is "on approving a procedure" -- it names what is being approved, not
    // the instrument doing the approving. The same words appear under ministerial orders and
    // under government resolutions, which are different tiers.
    const html = row('1', 'ЖУРАМ БАТЛАХ ТУХАЙ', '2022-06-10', '2022-10-03');
    expect(rowsFrom(html, 'regulation')[0]!.kind).toBe('regulation');
    expect(rowsFrom(html, 'notice')[0]!.kind).toBe('notice');
  });

  it('ignores a row with no document behind it', () => {
    const orphan = `
      <div class="legal-list-component">
        <div data-block="title"><a href="https://legalinfo.mn/mn/news" class="act-name">Мэдээлэл</a></div>
      </div>`;
    expect(rowsFrom(orphan, 'act')).toEqual([]);
    expect(rowsFrom('', 'act')).toEqual([]);
  });

  it('reads every row on the page, not only the first', () => {
    const html = row('1', 'НЭГДҮГЭЭР ЖУРАМ', '2020-01-01', '2020-02-01')
      + row('2', 'ХОЁРДУГААР ЖУРАМ', '2021-01-01', '2021-02-01');
    expect(rowsFrom(html, 'notice')).toHaveLength(2);
  });
});

describe('the category table', () => {
  it('holds the Laws of Mongolia at 27, which the navigation gets wrong', () => {
    // The listing page's nav puts "Хүчинтэй эрх зүйн акт" (in-force acts) beside this same href,
    // so a table built by reading the nav rather than the footer mislabels the single most
    // important tier in the corpus. It did, here, first time.
    const laws = CATEGORIES.find((c) => c.id === '27');
    expect(laws?.kind).toBe('act');
    expect(laws?.stated).toBe(956);
  });

  it('matches the total the portal publishes for itself', () => {
    expect(CATEGORIES.reduce((n, c) => n + c.stated, 0)).toBe(14090);
  });

  it('names every category once, so none is walked twice or silently dropped', () => {
    const ids = CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks the courts and the sub-national tiers, which are what the default walk leaves out', () => {
    expect(CATEGORIES.filter((c) => c.court).map((c) => c.id).sort()).toEqual(['16231124857801', '31', '32']);
    expect(CATEGORIES.filter((c) => c.local).map((c) => c.id).sort()).toEqual(['37', '38']);
  });

  it('leaves 12,192 national instruments in the default walk', () => {
    // The number the register should be measured against: everything the portal states (14,090),
    // less the courts' decisions (600) and the aimag tier (1,298) the profile's jurisdictionScope
    // declares unheld. At twenty rows a page that is 610 requests.
    const national = CATEGORIES.filter((c) => !c.court && !c.local).reduce((n, c) => n + c.stated, 0);
    expect(national).toBe(12192);
    expect(Math.ceil(national / 20)).toBe(610);
  });
});
