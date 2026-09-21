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
  const mainEl = $main.get(0) ?? null;
  const headings = $main.find('h1, h2, h3, h4').toArray().filter((h) => nodeText([h]).trim().length > 0);


  if (headings.length >= 2) {
    const trail: string[] = [];
    headings.forEach((h, i) => {
      const level = Number($(h).prop('tagName')!.slice(1));
      const heading = nodeText([h]).replace(/\s+/g, ' ').trim();
      trail.length = Math.min(trail.length, level - 1);
      trail[level - 1] = heading;

      const stop = headings[i + 1];
      const body = bodyBetween($, mainEl, h, stop);
      const sectionText = [heading, body.trim()].filter(Boolean).join('\n');
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

/** Whether `node` is the target or an ancestor of it. */
function isOrContains(node: AnyNode, target: AnyNode | undefined): boolean {
  for (let cur: AnyNode | null = target ?? null; cur; cur = (cur.parent as AnyNode | null) ?? null) {
    if (cur === node) return true;
  }
  return false;
}

/**
 * A heading's body: everything between it and the next heading, in document order.
 *
 * v1 walked the heading's own siblings, which is right only for a page that puts headings and
 * paragraphs side by side. Three shapes broke it, and all three are in this corpus.
 *
 * A page that wraps each heading in its own block leaves `h.next()` empty and the body in the
 * *wrapper's* next sibling, so every heading parsed with no text at all: the .au Domain
 * Administration Rules came out 84 headings and 2,134 characters, and rule 2.4.1 -- the Australian
 * presence requirement ESCAP cites for 12.7 -- was among the half megabyte dropped.
 *
 * A page that nests the *next* heading inside a sibling block never matches the stop by identity,
 * so the walk ran to the end of the container: APRA's prudential handbook gave "Chapter 2 -
 * Financial resilience" 177,802 characters, chapters 3 to 5 included, which each then repeated
 * them. Stopping at the block that holds the next heading fixes that, but strands the text sitting
 * inside it ahead of the heading, so that much is collected by descending.
 *
 * And content above the heading's own nesting level -- a trailing footnote block, on the OAIC
 * guidance pages -- is reached here by climbing when a level runs out, which a sibling walk
 * cannot do.
 *
 * Walking document order rather than one level of it answers all three with the same rule.
 */
function bodyBetween($: cheerio.CheerioAPI, mainEl: AnyNode | null, from: AnyNode, stop: AnyNode | undefined): string {
  const textBefore = (container: AnyNode, target: AnyNode): string[] => {
    const out: string[] = [];
    for (const child of $(container).contents().toArray()) {
      if (child === target) break;
      if (isOrContains(child, target)) {
        out.push(...textBefore(child, target));
        break;
      }
      out.push(nodeText([child]));
    }
    return out;
  };

  const out: string[] = [];
  for (let cur: AnyNode = from; ; ) {
    // The next node in document order that `cur` does not contain: its own next sibling, or -- when
    // this level is exhausted -- the next sibling of the nearest ancestor that still has one.
    let next: AnyNode | null = null;
    for (let c: AnyNode | null = cur; c && c !== mainEl; c = (c.parent as AnyNode | null) ?? null) {
      const sib = $(c).next();
      if (sib.length) {
        next = sib.get(0)!;
        break;
      }
    }
    if (!next || next === stop) break;
    if (stop && isOrContains(next, stop)) {
      out.push(...textBefore(next, stop));
      break;
    }
    out.push(nodeText([next]));
    cur = next;
  }
  return out.join('\n');
}

function unread(title: string | null, reason: 'empty' | 'landing-page', detail: string): ParsedDocument {
  return { extraction: 'none', text: '', sections: [], unread: { reason, detail }, title, meta: {}, parser: 'html' };
}

/**
 * The one file a landing page publishes, when it publishes exactly one.
 * A page of menus wrapping a single PDF is pointing at its own instrument, not at leads.
 */
export function soleDocumentLink(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const host = new URL(pageUrl).host;
  const found = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    let target: URL;
    try {
      target = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (target.host !== host) return;
    if (!/\.(?:pdf|docx?|rtf)$/i.test(target.pathname)) return;
    target.hash = '';
    found.add(target.toString());
  });
  return found.size === 1 ? [...found][0]! : null;
}
