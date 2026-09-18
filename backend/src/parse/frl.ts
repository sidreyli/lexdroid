/**
 * The Federal Register of Legislation's authored text.
 *
 * Every Commonwealth compilation is exported from one drafting template, and the structure lives
 * entirely in the class on a flat sequence of paragraphs: ActHead2 is a Part, ActHead5 is a
 * section, and everything between two ActHead5s is the body of the first. So the parser is a
 * single linear pass over that sequence rather than a tree walk, and one small parser covers the
 * whole corpus.
 *
 * Three things it has to get right:
 *
 *   - the contents list is in the body, as TOC paragraphs. Indexing those would give every Act a
 *     second, empty copy of itself whose "provisions" are one line long.
 *   - the endnotes are in the body too, and they are a history of amendments rather than law. A
 *     quote taken from them would cite a repealed form of a provision as though it were in force.
 *   - a long Act is compiled in several volumes. Each provision links to its own volume, because
 *     a citation into volume one for a section in volume three is a link to the wrong page.
 */
import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import { nodeText } from './html-text.js';
import { parseHtml } from './html.js';
import { SectionBuilder, type ParsedDocument, type ParsedSection } from './types.js';
import { PART_MARKER } from '../discover/frl.js';

/** ActHeadN opens a structural container; level 5 is the section itself. */
const CONTAINER: Record<string, number> = { ActHead1: 1, ActHead2: 2, ActHead3: 3, ActHead4: 4 };
const SECTION_CLASS = 'ActHead5';

/**
 * The same structure, marked the other way.
 *
 * ActHeadN belongs to the template Acts are drafted from. Determinations, Instruments, Orders and
 * Standards come from a second template whose paragraphs are styled HP for a Part and HR for a
 * section, and a page exported as EPUB carries those rather than the ActHead classes. Keyed on
 * ActHead alone the pass found nothing, fell through to the generic parser, which found no headings
 * either, and emitted the instrument as one section -- the whole Determination in a single blob.
 *
 * What both templates share is the numbering span: CharChapNo, CharPartNo, CharDivNo, CharSubdivNo
 * and CharSectno mark the number in a heading under either one. So the span is the thing to key on,
 * and it also recovers the headings that carry no heading class at all -- real ones, styled R1 or
 * ListParagraph by whoever drafted the page, which no class-based rule can see.
 *
 * Only a leading span counts. These are character styles, and the register uses them mid-sentence
 * too; a cross-reference to section 4.5 inside a paragraph is not the opening of section 4.5.
 */
const SPAN_CONTAINER: Record<string, number> = {
  CharChapNo: 1,
  CharPartNo: 2,
  CharDivNo: 3,
  CharSubdivNo: 4,
};
const SPAN_SECTION = 'CharSectno';
const STRUCTURAL_SPAN = `span.${[...Object.keys(SPAN_CONTAINER), SPAN_SECTION].join(', span.')}`;

/**
 * And a third template, which names its own heading styles.
 *
 * Short instruments -- exemptions, directions, the ones an authority signs rather than drafts from
 * the full template -- come out styled LDClauseHeading, LDPartHeading and so on, with no numbering
 * span at all: the clause number is a bare span before the heading text. The class name says what
 * the paragraph is, so the pattern reads it rather than listing the styles one by one, and the
 * number is taken only when it is a number, since an unnumbered heading would otherwise be labelled
 * with its own title.
 */
const LD_HEADING = /^LD(Chapter|Part|Division|Subdivision|Clause)Heading$/;
const LD_LEVEL: Record<string, number> = { Chapter: 1, Part: 2, Division: 3, Subdivision: 4 };

/**
 * The blocks a provision is built from.
 *
 * This pass read <p> only, which is every block in the authored pages and most of one exported to
 * EPUB -- but not all of it. There the lettered paragraphs of a section are <li>, and a heading is
 * sometimes <h2>: Part 6 of the Identity Checks Determination is one, so its four sections were
 * filed under Part 5. Reading <p> alone dropped more than half the text of that instrument, and
 * what it dropped was the paragraphs where the obligations are.
 *
 * Nesting is only ever a list inside a list. The outer block's text already contains the inner
 * one's, so taking the outermost and skipping what sits under it keeps every word exactly once.
 */
const BLOCKS = 'p, li, h1, h2, h3, h4, h5, h6';
/** Editorial matter carrying no obligation, and the running header of the compilation. */
const DROP = new Set(['notetext', 'Note', 'Header']);
const NAVIGATION = /^TOC\d?$/;
/** The endnotes begin here, and nothing after them is operative text. */
const ENDNOTES = /^ENotes?Heading/;
/**
 * The same boundary, where the class does not mark it.
 *
 * ENotesHeading belongs to the authored pages. A page exported to EPUB opens its endnotes with an
 * ordinary section heading -- ActHead5 around the word "Endnotes" -- so the pass walked straight in
 * and filed the amendment history as provisions. Every template titles the part the same way, and a
 * provision whose entire text is that one word does not exist, so the word is the reliable mark.
 */
const ENDNOTES_TITLE = /^Endnotes?$/i;

const REPEALED = /\((?:Repealed|Ceased)\)\s*$/i;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

interface Volume {
  url: string | null;
  html: string;
}

/** The merged body back into the volumes it was assembled from, in order. */
function volumes(html: string): Volume[] {
  const re = new RegExp(`<!--${PART_MARKER}:([^>]+?)-->`, 'g');
  const marks = [...html.matchAll(re)];
  if (marks.length === 0) return [{ url: null, html }];
  return marks.map((m, i) => ({
    url: m[1]!,
    html: html.slice(m.index! + m[0].length, i + 1 < marks.length ? marks[i + 1]!.index! : undefined),
  }));
}

function firstClass(el: Element): string {
  return (el.attribs['class'] ?? '').trim().split(/\s+/)[0] ?? '';
}

/** "4 June 2026" as an ISO date, or null if the register wrote something else. */
function isoDate(text: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

/**
 * What the compilation says about itself, on its own first page.
 *
 * A compilation states the date its text is in force at, which is the only acceptable evidence for
 * the "last amended" a row reports: ESCAP's reviewers wrote "no evidence that the Act was last
 * amended in 2023" on somebody's submission, and this is the sentence that answers them.
 */
function readFrontMatter(text: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const number = /\bNo\.\s*(\d+,\s*\d{4})\b/.exec(text);
  if (number) meta['officialNumber'] = `No. ${number[1]!.replace(/\s+/g, ' ')}`;

  const inForce = /shows the text of the law as amended and in force on\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/.exec(text);
  const compiled = /Compilation date:?\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/.exec(text);
  const stated = inForce?.[1] ?? compiled?.[1] ?? null;
  const date = stated ? isoDate(stated) : null;
  if (date) {
    meta['lastAmendedOn'] = date;
    meta['lastAmendedBasis'] = inForce
      ? `The compilation states that it "shows the text of the law as amended and in force on ${stated}".`
      : `The compilation states "Compilation date: ${stated}".`;
  }
  const includes = /Includes amendments:?\s*((?:Act|F\d)[^\n]{0,60})/.exec(text);
  if (includes) meta['includesAmendments'] = includes[1]!.trim();
  return meta;
}

interface Open {
  label: string | null;
  heading: string;
  anchor: string | null;
  body: string[];
}

export function parseFrl(html: string, url: string): ParsedDocument {
  const builder = new SectionBuilder();
  const parts = volumes(html);
  const multiVolume = parts.length > 1;
  const containers: string[] = [];
  let front = '';
  let title: string | null = null;
  let open: Open | null = null;
  let volumeUrl: string | null = null;

  const flush = (): void => {
    if (!open) return;
    const head = [open.label, open.heading].filter(Boolean).join(' ') || 'Provision';
    // One volume is the document itself and a bare fragment lands in it. Several are not, so the
    // provision carries its own volume's link and the citation resolves against that instead.
    const anchor = open.anchor
      ? multiVolume && volumeUrl
        ? `${volumeUrl}#${open.anchor}`
        : open.anchor
      : null;
    builder.add({
      headingPath: [...containers.filter(Boolean), head].join(' > '),
      label: open.label,
      text: open.body.join('\n'),
      page: null,
      language: 'en',
      repealed: REPEALED.test(head),
      anchor,
    });
    open = null;
  };

  outer: for (const volume of parts) {
    volumeUrl = volume.url;
    const $ = cheerio.load(volume.html);
    if (title === null) title = ($('title').first().text() || '').trim() || null;

    for (const el of $(BLOCKS).toArray()) {
      if ($(el).parents(BLOCKS).length > 0) continue;
      const cls = firstClass(el);
      if (ENDNOTES.test(cls)) {
        flush();
        break outer;
      }
      if (NAVIGATION.test(cls) || DROP.has(cls)) continue;

      const text = nodeText([el]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (ENDNOTES_TITLE.test(text)) {
        flush();
        break outer;
      }

      const $el = $(el);
      const span = (sel: string): string => {
        const node = $el.find(sel).first().get(0);
        return node ? nodeText([node]).replace(/\s+/g, ' ').trim() : '';
      };

      // The numbering span only says what this paragraph is when the paragraph opens with it: these
      // are character styles, and the register uses them mid-sentence too.
      const marker = span(STRUCTURAL_SPAN);
      const markerClass = marker && text.startsWith(marker) ? firstClass($el.find(STRUCTURAL_SPAN).first().get(0)!) : '';
      const ld = LD_HEADING.exec(cls)?.[1] ?? '';

      const level = CONTAINER[cls] ?? SPAN_CONTAINER[markerClass] ?? LD_LEVEL[ld];
      if (level !== undefined) {
        flush();
        containers.length = Math.min(containers.length, level - 1);
        containers[level - 1] = text;
        continue;
      }

      if (cls === SECTION_CLASS || markerClass === SPAN_SECTION || ld === 'Clause') {
        flush();
        const numbered = ld ? span('span') : span(`span.${SPAN_SECTION}`);
        const label = /^\d/.test(numbered) ? numbered : null;
        const heading = label && text.startsWith(label) ? text.slice(label.length).trim() : text;
        const anchor = $el.find('a[id]').first().attr('id') ?? el.attribs['id'] ?? null;
        open = { label, heading, anchor, body: [text] };
        continue;
      }

      if (open) open.body.push(text);
      else if (front.length < 4000) front += `${text}\n`;
    }
  }
  flush();

  const meta = readFrontMatter(front);
  if (builder.sections.length === 0) {
    // The template covers principal Acts. Rules, Determinations and Industry Standards are drafted
    // from others whose headings carry none of these classes, so the generic parser takes those.
    const generic = parseHtml(html, url);
    return { ...generic, title: generic.title ?? title, meta: { ...meta, ...generic.meta }, parser: 'frl-generic' };
  }

  return {
    extraction: 'html',
    text: rebuild(builder, front),
    sections: builder.sections,
    unread: null,
    title,
    meta: multiVolume ? { ...meta, volumes: String(parts.length) } : meta,
    parser: 'frl',
  };
}

/**
 * The front matter belongs at the top of the document, and SectionBuilder appends. Prepending it
 * would move every offset, so the sections are shifted by the length that was put in front.
 */
function rebuild(builder: SectionBuilder, front: string): string {
  const head = front.trim();
  if (!head) return builder.text;
  const shift = head.length + 2;
  for (const s of builder.sections as ParsedSection[]) {
    s.charStart += shift;
    s.charEnd += shift;
  }
  return `${head}\n\n${builder.text}`;
}
