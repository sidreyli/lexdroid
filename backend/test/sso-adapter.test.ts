import { describe, expect, it } from 'vitest';
import { __chunkIds, __maxQueryChars, __mergeProvisions, __rowsOn } from '../src/discover/sso.js';
import { parseSso } from '../src/parse/sso.js';

const URL = 'https://sso.agc.gov.sg/Act/CoA1967';

describe('asking SSO for a long Act', () => {
  it('keeps every request under the query-string wall the host enforces', () => {
    // The shape that was refused: 687 provisions, a 4,949 character query string, HTTP 403.
    const ids = Array.from({ length: 687 }, (_i, n) => `pr${n + 1}-`);
    const runs = __chunkIds(ids, URL);

    expect(runs.length).toBeGreaterThan(1);
    for (const run of runs) {
      const query = `ProvIds=${run.join(',')}`;
      expect(query.length).toBeLessThan(__maxQueryChars);
    }
    expect(runs.flat()).toEqual(ids);
  });

  it('asks once when the whole Act fits, which is most of them', () => {
    const ids = Array.from({ length: 69 }, (_i, n) => `pr${n + 1}-`);
    expect(__chunkIds(ids, URL)).toHaveLength(1);
  });
});

/** The markup SSO serves, reduced to what the parser reads. */
function page(provisions: { id: string; heading: string; text: string }[]): string {
  const toc = provisions
    .map((p) => `<div><input class="childID" name="item" value="${p.id}"><label>${p.heading}</label></div>`)
    .join('');
  const body = provisions
    .map(
      (p) =>
        `<div class="prov1"><table><tr><td class="prov1Hdr" id="${p.id}">${p.heading}</td></tr>` +
        `<tr><td class="prov1Txt">${p.text}</td></tr></table></div>`,
    )
    .join('');
  return `<html><head><title>Companies Act 1967 - Singapore Statutes Online</title></head><body>${toc}<div id="legisContent">${body}</div></body></html>`;
}

describe('stitching the responses back into one document', () => {
  const all = [
    { id: 'pr1-', heading: 'Short title', text: 'This Act is the Companies Act 1967.' },
    { id: 'pr2-', heading: 'Interpretation', text: 'In this Act, unless the context otherwise requires.' },
    { id: 'pr3-', heading: 'Registers', text: 'The Registrar must keep a register of companies.' },
  ];

  it('carries every provision from every response, once', () => {
    const merged = __mergeProvisions([page(all.slice(0, 2)), page(all.slice(2))]);
    const parsed = parseSso(merged, URL);

    expect(parsed.sections.map((s) => s.label)).toEqual(['1', '2', '3']);
    expect(parsed.unread).toBeNull();
    // A merge that duplicated the shell would report a fragment; the contents count is the check.
    expect(parsed.meta['partial']).toBeUndefined();
  });

  it('does not repeat a provision two responses both carried', () => {
    const merged = __mergeProvisions([page(all.slice(0, 2)), page(all.slice(1))]);
    const parsed = parseSso(merged, URL);
    expect(parsed.sections.map((s) => s.label)).toEqual(['1', '2', '3']);
  });

  it('keeps the offset invariant across the seam', () => {
    const merged = __mergeProvisions([page(all.slice(0, 1)), page(all.slice(1, 2)), page(all.slice(2))]);
    const parsed = parseSso(merged, URL);
    for (const s of parsed.sections) {
      expect(parsed.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    }
  });
});

describe('what the listing says about an instrument', () => {
  const listing =
    '<table><tbody><tr><td><a class="non-ajax" href="/Act/CoA1967">Companies Act 1967</a></td>' +
    '<td class="col-no">Cap. 50</td></tr></tbody></table>';

  it('keeps which listing an instrument came off, as the evidence of its standing', () => {
    // The portal publishes its current legislation apart from its repealed legislation, so it has
    // already answered whether an instrument is in force. Discarding that left all 6,365
    // registered instruments at "unknown" and held every citing row.
    const [row] = __rowsOn(listing, {
      kind: 'act', path: '/Browse/Act/Current/All', status: 'in-force', listing: 'Browse > Acts > Current',
    }, '2026-09-07');
    expect(row!.status).toBe('in-force');
    expect(row!.statusBasis).toContain('Browse > Acts > Current');
    expect(row!.statusBasis).toContain('2026-09-07');
  });

  it('claims nothing when the listing does not say', () => {
    const [row] = __rowsOn(listing, { kind: 'act', path: '/Browse/Act/All' }, '2026-09-07');
    expect(row!.status).toBeUndefined();
    expect(row!.statusBasis).toBeUndefined();
  });
});
