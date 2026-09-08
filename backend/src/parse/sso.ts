/**
 * Singapore Statutes Online.
 *
 * SSO is the best-structured legislation site of the three economies, and worth a parser of its
 * own: every provision is a div.prov1 with an id that IS the citation anchor, so a row can deep
 * link to https://sso.agc.gov.sg/Act/PDPA2012#pr26- and land on the section it cites. A generic
 * heading-splitter would throw that away and guess the boundaries instead.
 *
 * Two things the site does that the parser has to handle:
 *
 *   - a document page serves only its first dozen provisions and loads the rest on scroll. The
 *     discovery adapter asks for all of them by id in one further request, so what arrives here
 *     is the whole Act. If it is not, the parser says so rather than quietly indexing a tenth of
 *     the law -- silent partial documents are how v1 certified absence from text it never read.
 *   - the Part structure lives in the table of contents, not in the provision markup, so the
 *     heading path is built by joining the two.
 */
import * as cheerio from 'cheerio';
import { nodeText } from './html-text.js';
import { SectionBuilder, type ParsedDocument } from './types.js';

/** provision id -> the label the table of contents gives it, in document order. */
function tocLabels(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const out = new Map<string, string>();
  $('input.childID[name="item"]').each((_i, el) => {
    const v = $(el).attr('value');
    if (!v || out.has(v)) return;
    const label = $(el).closest('div').find('label').first().text().replace(/\s+/g, ' ').trim();
    out.set(v, label);
  });
  return out;
}

/** ids of every provision the table of contents lists, in order. */
export function provisionIds(html: string): string[] {
  return [...tocLabels(html).keys()];
}

/**
 * A section SSO will not serve a body for, because there is nothing left of it.
 *
 * The contents still lists "27 (Repealed)" so a reader can see the number is not reused, but the
 * request returns no provision. Without this the partial-document check fires on almost every
 * amended Act, and a warning that fires on everything is a warning nobody reads.
 */
const REPEALED_LABEL = /\((?:Repealed|Deleted)\)\s*$/i;

/** provision id -> the Part it sits under, read from the table of contents. */
function partIndex(html: string): Map<string, string> {
  const $ = cheerio.load(html);
  const map = new Map<string, string>();
  let current = '';

  // The ToC interleaves Part headings (p.HeadingParagraph) with the provisions under them, so a
  // document-order walk of both selectors reconstructs the nesting the markup does not express.
  $('p.HeadingParagraph, input.childID[name="item"]').each((_i, el) => {
    const $el = $(el);
    if ($el.is('p')) {
      current = nodeText([el]).replace(/\s+/g, ' ').trim();
      return;
    }
    const id = $el.attr('value');
    if (id && !map.has(id)) map.set(id, current);
  });
  return map;
}

const dateFrom = (s: string): string | null => {
  const m = /(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})/.exec(s);
  if (!m) return null;
  const month = new Date(`${m[2]} 1, 2000`).getMonth();
  if (Number.isNaN(month)) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
};

/**
 * What the document says about itself: its official number, when it commenced, when it was last
 * amended. Read off SSO's own version timeline, which is the evidence ESCAP asks for when they
 * write "no evidence that the Act was last amended in 2023, please double check".
 */
function readTimeline($: cheerio.CheerioAPI): Record<string, string> {
  const meta: Record<string, string> = {};
  const items = $('ul.left > li[data-id]').toArray();
  if (items.length === 0) return meta;

  const entry = (el: (typeof items)[number]) => ({
    date: nodeText($(el).find('div.timestamp').toArray()).replace(/\s+/g, ' ').trim(),
    status: nodeText($(el).find('div.group_status').toArray()).replace(/\s+/g, ' ').trim(),
  });

  // Newest first on SSO. The original enactment is the last entry and carries "Act 26 of 2012".
  const original = entry(items[items.length - 1]!);
  const number = /\b((?:Act|G\.?N\.? No\.?|S)\s*\d+\s*of\s*\d{4})/i.exec(original.status);
  if (number) meta['officialNumber'] = number[1]!.replace(/\s+/g, ' ');
  const commenced = dateFrom(original.date);
  if (commenced) {
    meta['commencedOn'] = commenced;
    meta['commencementBasis'] = `SSO version timeline, earliest entry: "${original.date}${original.status ? ` ${original.status}` : ''}"`;
  }

  const selected = $('ul.left > li.selected[data-id]').toArray()[0] ?? items[0]!;
  const current = entry(selected);
  const amended = dateFrom(current.date);
  if (amended && amended !== commenced) {
    meta['lastAmendedOn'] = amended;
    meta['lastAmendedBasis'] = `SSO version timeline, current version: "${current.date} ${current.status}"`;
  }
  meta['versionCount'] = String(items.length);
  return meta;
}

export function parseSso(html: string, url: string): ParsedDocument {
  const $ = cheerio.load(html);
  const parts = partIndex(html);
  const labels = tocLabels(html);
  const listed = [...labels.keys()];
  const builder = new SectionBuilder();

  const title = ($('title').first().text() || '').replace(/\s*-\s*Singapore Statutes Online\s*$/i, '').trim() || null;
  const meta = readTimeline($);

  const provisions = $('#legisContent div.prov1').toArray();
  const seen: string[] = [];

  for (const el of provisions) {
    const $prov = $(el);
    const $hdr = $prov.find('td.prov1Hdr, td.prov1Rep').first();
    const anchor = $hdr.attr('id') ?? null;
    const heading = nodeText($hdr.toArray()).replace(/\s+/g, ' ').trim();
    const body = nodeText($prov.find('td.prov1Txt, td.prov1RepText').toArray());
    if (!body) continue;
    if (anchor) seen.push(anchor);

    // "pr26A-" -> "26A"; "pr26-ps1-" would be a subsection, which SSO does not use at this level.
    const label = anchor ? (/^pr([^-]+)-/.exec(anchor)?.[1] ?? null) : null;
    const part = anchor ? parts.get(anchor) ?? '' : '';
    const headTitle = label && heading ? `${label} ${heading}` : heading || label || 'Provision';

    builder.add({
      headingPath: [part, headTitle].filter(Boolean).join(' > '),
      label,
      text: body,
      page: null,
      language: 'en',
      repealed: $prov.find('td.prov1Rep, td.prov1RepText').length > 0,
      anchor,
    });
  }

  if (builder.sections.length === 0) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      unread: {
        reason: listed.length > 0 ? 'landing-page' : 'empty',
        detail:
          listed.length > 0
            ? `${url} listed ${listed.length} provisions in its contents but served none of them. SSO loads provisions on demand; the fetcher must request them by id.`
            : `${url} contains no div.prov1 provisions.`,
      },
      title,
      meta,
      parser: 'sso',
    };
  }

  // The contents page is the site's own count of what the document contains. If we parsed fewer,
  // we are looking at a fragment, and the honest record of that is a note on the document rather
  // than a corpus that quietly answers "not found" for the missing nine tenths.
  const repealed = listed.filter((id) => REPEALED_LABEL.test(labels.get(id) ?? ''));
  const missing = listed.filter((id) => !seen.includes(id) && !repealed.includes(id));
  if (repealed.length > 0) meta['repealedProvisions'] = String(repealed.length);
  if (missing.length > 0) {
    meta['partial'] = `${missing.length} of ${listed.length} provisions listed in the contents were not served: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ', ...' : ''}`;
  }

  return {
    extraction: 'html',
    text: builder.text,
    sections: builder.sections,
    unread: null,
    title,
    meta,
    parser: 'sso',
  };
}
