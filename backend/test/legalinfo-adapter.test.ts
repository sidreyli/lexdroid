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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATEGORIES, annexesFrom, annexTab, rowsFrom, withAnnexes } from '../src/discover/legalinfo.js';
import { parseLegalinfo } from '../src/parse/legalinfo.js';

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

/**
 * The annexes a resolution approves. The page itself says "approved per the annex" and holds none
 * of it; the page script lists the annexes through tab 3 and each is served on its own page. The
 * listing fixture is the portal's real answer for Khural resolution 07 of 2022.
 */
describe('the annexes an instrument approves', () => {
  const listing = readFileSync(join(__dirname, 'fixtures', 'mng', 'annex-listing-parliament-resolution-07.html'), 'utf8');

  it('finds the annex tab the page offers, and the instrument it belongs to', () => {
    const page = `<script>var lawId = '16390150734701';</script>
      <a href="#active-tab-3" onclick="showActiveTab('3', this, '1594091809248', '')">Хавсралт</a>`;
    expect(annexTab(page)).toEqual({ dvid: '1594091809248', lawId: '16390150734701' });
    expect(annexTab('<a onclick="showActiveTab(\'2\', this, \'1\', \'\')">Холбоотой</a>')).toBeNull();
  });

  it('reads each annex the tab lists: its id, its name and the standing the portal gives it', () => {
    expect(annexesFrom(listing)).toEqual([
      { id: '16390150746231', title: 'ИРГЭДИЙН ТӨЛӨӨЛӨГЧДИЙН ХУРЛЫН ЗӨВЛӨЛИЙН АЖИЛЛАХ ЖУРАМ', status: 'Хүчинтэй' },
    ]);
  });

  it('appends an annex so the parser reads it under its own name, and a repealed one as repealed', () => {
    const page = '<html><body><div class="law_content"><p>1.Журмыг хавсралтаар баталсугай.</p></div></body></html>';
    const annexPage = '<html><body><div class="law_content"><p>Нэг.Нийтлэг үндэслэл</p><p>1.1.Энэ журмын зорилго.</p></div></body></html>';
    const composed = withAnnexes(page, [
      { annex: { id: '1', title: 'ЖУРАМ "А"', status: 'Хүчингүй' }, url: 'https://legalinfo.mn/mn/detail?lawId=1', html: annexPage },
    ]);
    const doc = parseLegalinfo(composed, 'u');
    expect(doc.sections.map((s) => [s.label, s.headingPath, s.repealed])).toEqual([
      ['1', '1.Журмыг хавсралтаар баталсугай.', false],
      ['1.1', 'Хавсралт: ЖУРАМ "А" > Нэг.Нийтлэг үндэслэл > 1.1.Энэ журмын зорилго.', true],
    ]);
  });
});
