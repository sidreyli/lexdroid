import { describe, expect, it } from 'vitest';
import { __mergeProvisions } from '../src/discover/sso.js';
import { parseSso, provisionIds } from '../src/parse/sso.js';

const URL = 'https://sso.agc.gov.sg/SL/GSTA1993-OR3';

/** A cell: SSO wraps every one of them in a table of its own. */
const cell = (s: string): string => `<td><table><tr><td class="fs">${s}</td></tr></table></td>`;
const row = (id: string, cells: string[]): string => `<tr id="${id}">${cells.map(cell).join('')}</tr>`;

/** The contents: provisions carry childID, a schedule does not -- which is the bug this covers. */
function page(opts: { provisions: string[]; schedules: string[]; body: string }): string {
  const toc = [
    ...opts.provisions.map(
      (id) =>
        `<blockquote class="TocParagraph"><div><input class="form-check-input childID" name="item" value="${id}" id="chk${id}"/> <label for="chk${id}">${id.replace(/^pr|-$/g, '')} A provision</label></div></blockquote>`,
    ),
    ...opts.schedules.map(
      (id) =>
        `<p class="HeadingParagraph filter"><input class="form-check-input" type="checkbox" name="item" value="${id}" id="chk${id}"/> <label for="chk${id}"><b>THE SCHEDULE</b></label></p>`,
    ),
  ].join('');
  return `<html><head><title>Test Order - Singapore Statutes Online</title></head><body>
    <div id="contents">${toc}</div>
    <div id="legisContent">${opts.body}</div></body></html>`;
}

const provision = (id: string): string =>
  `<div class="prov1"><table><tr><td class="prov1Hdr" id="${id}">Relief granted</td></tr><tr><td class="prov1Txt">The persons specified in the Schedule are granted relief.</td></tr></table></div>`;

function schedule(id: string, items: string[]): string {
  const head = `<thead>${row(`${id}th-`, ['(1)', '(2)'])}${row(`${id}th2-`, ['No.', 'Type of Goods'])}</thead>`;
  const body = `<tbody>${items.map((t, i) => row(`${id}tr${i}-`, [`${i + 1}.`, t])).join('')}</tbody>`;
  return `<div class="schedule">
    <table><tr><td class="sHdr" id="${id}">THE SCHEDULE</td></tr></table>
    <table><tr><td class="SbodyRefs" id="${id}rf-">Paragraphs 4 and 5</td></tr></table>
    <div class="table-responsive"><table><tr><td class="tbl" id="${id}ta-"><table class="tbtlr table">${head}${body}</table></td></tr></table></div>
  </div>`;
}

describe('a schedule on Singapore Statutes Online', () => {
  it('is listed for fetching even though the contents does not mark it a child provision', () => {
    const html = page({ provisions: ['pr1-', 'pr2-'], schedules: ['Sc-'], body: '' });
    expect(provisionIds(html)).toEqual(['pr1-', 'pr2-', 'Sc-']);
  });

  it('lists every numbered schedule an Act carries', () => {
    const html = page({ provisions: ['pr1-'], schedules: ['Sc1-', 'Sc2-', 'Sc11-'], body: '' });
    expect(provisionIds(html)).toEqual(['pr1-', 'Sc1-', 'Sc2-', 'Sc11-']);
  });

  it('leaves the contents apparatus out of the request', () => {
    const html = page({ provisions: ['pr1-'], schedules: [], body: '' }).replace(
      '<div id="contents">',
      '<div id="contents"><p><input name="item" value="xv-" id="chkx"/><label for="chkx">Legislative History</label></p><p><input name="item" value="P1-" id="chkp"/><label for="chkp">Part 1</label></p>',
    );
    expect(provisionIds(html)).toEqual(['pr1-']);
  });

  it('becomes readable text, not an empty heading', () => {
    const html = page({
      provisions: ['pr1-'],
      schedules: ['Sc-'],
      body: provision('pr1-') + schedule('Sc-', ['Used articles of a value not exceeding $500']),
    });
    const doc = parseSso(html, URL);
    const sched = doc.sections.filter((s) => s.label === 'Schedule');

    expect(sched).toHaveLength(1);
    expect(sched[0]!.text).toContain('not exceeding $500');
    expect(sched[0]!.anchor).toBe('Sc-');
    expect(doc.meta?.['partial']).toBeUndefined();
  });

  it('names the schedule by the heading it prints, and keeps the provision it serves', () => {
    const html = page({ provisions: [], schedules: ['Sc1-'], body: schedule('Sc1-', ['Anything']) });
    const [s] = parseSso(html, URL).sections;

    expect(s!.label).toBe('Schedule 1');
    expect(s!.headingPath).toBe('THE SCHEDULE');
    expect(s!.text.startsWith('Paragraphs 4 and 5')).toBe(true);
  });

  it('is split at its own rows when it is too long to read whole, and no row is lost', () => {
    const items = Array.from({ length: 60 }, (_i, n) => `Item ${n + 1}: ${'goods of a described kind '.repeat(12)}`);
    const html = page({ provisions: [], schedules: ['Sc-'], body: schedule('Sc-', items) });
    const sections = parseSso(html, URL).sections;

    expect(sections.length).toBeGreaterThan(1);
    expect(sections[0]!.headingPath).toBe('THE SCHEDULE (part 1 of ' + sections.length + ')');
    const all = sections.map((s) => s.text).join('\n');
    for (const n of [1, 30, 60]) expect(all).toContain(`Item ${n}:`);
    // Each part carries the column names, because a row without them says nothing.
    for (const s of sections) expect(s.text).toContain('(1) (2) | No. Type of Goods');
  });

  it('survives being assembled from several responses', () => {
    const shell = page({ provisions: ['pr1-'], schedules: ['Sc-'], body: provision('pr1-') });
    const rest = page({ provisions: ['pr1-'], schedules: ['Sc-'], body: schedule('Sc-', ['Relief for travellers']) });
    const doc = parseSso(__mergeProvisions([shell, rest]), URL);

    expect(doc.sections.map((s) => s.label)).toEqual(['1', 'Schedule']);
    expect(doc.sections[1]!.text).toContain('Relief for travellers');
  });
});
