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
import { namesTheSame } from './identity.js';
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

/**
 * The one file a page publishes under the instrument's own name.
 *
 * A regulator that announces a policy document by posting a page linking it has the crawl
 * register the announcement, and the announcement is not a page of menus -- it carries an embargo
 * notice and a paragraph of prose, so nothing marks it unread and `soleDocumentLink` never runs.
 * Malaysia's Policy Document on Electronic Money sat in the corpus as 2,044 characters of press
 * release for exactly that reason, and it is cited for three cells.
 *
 * What identifies the file is not that it is the only one -- Bank Negara's pages link five, the
 * policy beside its FAQs and two P.U.(A)s -- but that exactly one of them calls itself by the
 * instrument's name. The caller decides whether to adopt it; naming it is all this does.
 */
export function namedDocumentLink(html: string, pageUrl: string, title: string): string | null {
  const $ = cheerio.load(html);
  const found = new Set<string>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !/\.(?:pdf|docx?|rtf)(?:$|\?)/i.test(href)) return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text || !namesTheSame(text, title)) return;
    try {
      const target = new URL(href, pageUrl);
      target.hash = '';
      // A site linking itself under its other name. Bank Negara's pages are served from
      // www.bnm.gov.my and two of them link their own policy at bnm.gov.my, which answers 202 to
      // everything and cost both documents six minutes of backing off before being given up on.
      // The page came from the host we can read, so ask that host for the file it publishes.
      const here = new URL(pageUrl).host;
      if (target.host !== here && target.host.replace(/^www\./i, '') === here.replace(/^www\./i, '')) {
        target.host = here;
      }
      found.add(target.toString());
    } catch {
      /* an href that is not a URL names nothing */
    }
  });
  return found.size === 1 ? [...found][0]! : null;
}

/**
 * The words a link uses when it is pointing at a file rather than naming one.
 *
 * A closed class: what is left of "download the print version" or "(340.7 KB)" once you take away
 * the mechanics of following a link is nothing at all, and what is left of "Enforcement Approach"
 * or "P.U. (B) 76/2026" is the name of some other document. That is the whole difference, and it
 * is a fact about how English links are written rather than about any register -- no word here is
 * a subject, an agency or an instrument.
 */
const POINTING = new Set([
  'a', 'above', 'an', 'and', 'at', 'attached', 'attachment', 'available', 'below', 'click',
  'copy', 'document', 'down', 'download', 'file', 'following', 'for', 'format', 'full', 'get',
  'here', 'in', 'is', 'it', 'link', 'now', 'of', 'on', 'open', 'or', 'page', 'please', 'print',
  'read', 'see', 'the', 'this', 'to', 'version', 'view', 'viewing', 'website',
  // What a site writes beside a link to say how big the file is and what kind it is.
  'doc', 'docx', 'pdf', 'rtf', 'word', 'b', 'kb', 'mb', 'gb', 'byte', 'bytes', 'size',
]);

/** Nothing but the mechanics of following a link: no name of anything is left. */
function pointsRatherThanNames(text: string): boolean {
  const words = text
    .toLowerCase()
    .replace(/[\d.,]+/g, ' ')
    .split(/[^a-z]+/)
    .filter(Boolean);
  return words.every((w) => POINTING.has(w));
}

/**
 * The one file a page offers when its link calls that file no name at all.
 *
 * `soleDocumentLink` runs only where the page was set aside unread, and `namedDocumentLink` only
 * where the link repeats the instrument's name. A registry that publishes each of its policies as
 * a page of one paragraph saying the policy "can be downloaded here" falls between the two: the
 * paragraph is prose, so the page reads, and "here" is not a name, so nothing matches. The
 * substance sits in the file and the register holds the sentence that mentions it.
 *
 * Where the link names something -- "Enforcement Approach", "P.U. (B) 76/2026" -- it is saying
 * which document it points at, and a page whose one file is some other document is a page citing
 * it, not publishing it. Nine media releases about penalties on named banks all link the same
 * enforcement policy, and adopting it would file nine copies of one document under nine wrong
 * names. So only a link that names nothing counts, and the caller still has to weigh what the
 * file says against what the page says.
 */
export function pointedDocumentLink(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const here = new URL(pageUrl).host;
  const found = new Map<string, string[]>();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !/\.(?:pdf|docx?|rtf)(?:$|\?)/i.test(href)) return;
    try {
      const target = new URL(href, pageUrl);
      target.hash = '';
      // The same site under its other name, as `namedDocumentLink` explains.
      if (target.host !== here && target.host.replace(/^www\./i, '') === here.replace(/^www\./i, '')) {
        target.host = here;
      }
      const url = target.toString();
      found.set(url, [...(found.get(url) ?? []), $(el).text().replace(/\s+/g, ' ').trim()]);
    } catch {
      /* an href that is not a URL points at nothing */
    }
  });
  if (found.size !== 1) return null;
  const [url, texts] = [...found][0]!;
  return texts.some(pointsRatherThanNames) ? url : null;
}
