/**
 * Generic HTML, for the many sites that are not Singapore Statutes Online.
 *
 * Two jobs, and the second is the one v1 got wrong.
 *
 * 1. Split the page into citable sections. Headings first, because a well-formed legal page has
 *    them; failing that, a numbered-provision pattern; failing that, one section for the page.
 * 2. Decide whether this page is a document at all. A regulator's index page listing forty
 *    circulars has plenty of text and no law in it. v1 indexed those and then reported that the
 *    corpus contained no requirement -- an absence certified from a page of links. Here a page
 *    that is mostly navigation is recorded as unread with the reason "landing-page", which makes
 *    it visible in the run report instead of invisible in the negatives.
 */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { nodeText } from './html-text.js';
import { SectionBuilder, type ParsedDocument } from './types.js';

const STRIP = 'script, style, noscript, nav, header, footer, aside, form, iframe, .nav, .navbar, .menu, .breadcrumb, .cookie, .skip-link';

const MAIN_CANDIDATES = ['main', 'article', '[role=main]', '#content', '#main', '.content', '.main-content', 'body'];

/** A numbered provision at the start of a line: "26.", "5(1)", "Section 12", "Article 4". */
const PROVISION_LINE = /^\s*(?:(?:Section|Sec\.|Article|Art\.|Regulation|Reg\.|Rule|Clause|Paragraph)\s+)?(\d+[A-Z]{0,2}(?:\(\d+\))?)[.)—-]\s+(?=\S)/;

const MIN_DOCUMENT_CHARS = 600;
/** Above this share of text sitting inside anchors, the page is a list of links, not a document. */
const MAX_LINK_TEXT_RATIO = 0.5;

export function parseHtml(html: string, url: string): ParsedDocument {
  const $ = cheerio.load(html);
  const title = ($('title').first().text() || $('h1').first().text() || '').replace(/\s+/g, ' ').trim() || null;

  $(STRIP).remove();

  let $main: cheerio.Cheerio<AnyNode> = $('body');
  for (const sel of MAIN_CANDIDATES) {
    const found = $(sel).first();
    if (found.length && nodeText(found.toArray()).length > 200) {
      $main = found;
      break;
    }
  }

  const text = nodeText($main.toArray());
  const linkText = $main
    .find('a')
    .toArray()
    .reduce((n, a) => n + nodeText([a]).length, 0);
  const linkRatio = text.length > 0 ? linkText / text.length : 1;

  if (text.length < MIN_DOCUMENT_CHARS) {
    return unread(title, 'empty', `${url} yielded ${text.length} characters of text, below the ${MIN_DOCUMENT_CHARS} needed for a document.`);
  }
  if (linkRatio > MAX_LINK_TEXT_RATIO) {
    return unread(
      title,
      'landing-page',
      `${Math.round(linkRatio * 100)}% of the text on ${url} sits inside links. This is an index or navigation page; the instruments it points at are leads, not evidence.`,
    );
  }

  const builder = new SectionBuilder();
  const headings = $main.find('h1, h2, h3, h4').toArray().filter((h) => nodeText([h]).trim().length > 0);

  if (headings.length >= 2) {
    const trail: string[] = [];
    headings.forEach((h, i) => {
      const level = Number($(h).prop('tagName')!.slice(1));
      const heading = nodeText([h]).replace(/\s+/g, ' ').trim();
      trail.length = Math.min(trail.length, level - 1);
      trail[level - 1] = heading;

      const body: string[] = [];
      let node = $(h).next();
      const stop = headings[i + 1];
      while (node.length && node.get(0) !== stop) {
        body.push(nodeText(node.toArray()));
        node = node.next();
      }
      const sectionText = [heading, body.join('\n').trim()].filter(Boolean).join('\n');
      builder.add({
        headingPath: trail.filter(Boolean).join(' > '),
        label: PROVISION_LINE.exec(heading)?.[1] ?? null,
        text: sectionText,
        page: null,
        language: null,
        repealed: /\brepealed\b/i.test(heading),
        anchor: $(h).attr('id') ?? null,
      });
    });
  } else {
    // No heading structure: fall back to numbered provisions, then to the whole page.
    const lines = text.split('\n');
    const starts = lines.map((l, i) => (PROVISION_LINE.test(l) ? i : -1)).filter((i) => i >= 0);
    if (starts.length >= 3) {
      starts.forEach((start, i) => {
        const end = starts[i + 1] ?? lines.length;
        const chunk = lines.slice(start, end).join('\n').trim();
        const label = PROVISION_LINE.exec(lines[start]!)?.[1] ?? null;
        builder.add({
          headingPath: [title, label].filter(Boolean).join(' > '),
          label,
          text: chunk,
          page: null,
          language: null,
          repealed: /\brepealed\b/i.test(chunk.slice(0, 200)),
          anchor: null,
        });
      });
    } else {
      builder.add({
        headingPath: title ?? url,
        label: null,
        text,
        page: null,
        language: null,
        repealed: false,
        anchor: null,
      });
    }
  }

  if (builder.sections.length === 0) {
    return unread(title, 'empty', `${url} produced no sections after parsing.`);
  }

  return { extraction: 'html', text: builder.text, sections: builder.sections, unread: null, title, meta: {}, parser: 'html' };
}

function unread(title: string | null, reason: 'empty' | 'landing-page', detail: string): ParsedDocument {
  return { extraction: 'none', text: '', sections: [], unread: { reason, detail }, title, meta: {}, parser: 'html' };
}
