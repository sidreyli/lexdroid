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
 * The styled-heading pass (see `walk`). A style names itself a heading when it says Head or Heading
 * -- LI-Heading2, Clauseheadding, LDSecHead -- or carries a heading level the way FSCh5Section does,
 * and an <hN> is one by definition. Running headers, table and contents headings and the headings of
 * notes and front matter say Head too, and head nothing operative.
 */
const STYLED_HEADING = /[Hh]ead|h[1-6](?=[A-Z]|$)/;
const NOT_A_PROVISION_HEADING = /Header|TOC|Table|Front|Contents|ENote|Note/i;
function isStyledHeading(tag: string, cls: string): boolean {
  return (/^h[1-6]$/.test(tag) || STYLED_HEADING.test(cls)) && !NOT_A_PROVISION_HEADING.test(cls);
}
const STYLED_CONTAINER = /^(Chapter|Part|Division|Subdivision|Schedule)\s+[0-9A-Z]/;
const STYLED_LEVEL: Record<string, number> = { Chapter: 1, Schedule: 1, Part: 2, Division: 3, Subdivision: 4 };
/** 5, 12A, 1.2.1—3, 44.0.1. -- a number, then the words of the heading. */
const PROVISION_NUMBER = /^(\d+[A-Z]{0,3}(?:[.\-–—]\d+[A-Z]{0,3})*)\.?\s+(?=\S)/;
/** Standard 1, Rule 4A -- a provision that names its kind before its number. */
const PROVISION_NAMED = /^((?:Article|Clause|Item|Paragraph|Regulation|Rule|Section|Standard)\s+\d+[A-Z]{0,3}(?:\.\d+[A-Z]{0,3})*)\b\.?\s*/;
/** A heading is a caption. A numbered paragraph longer than this is a subclause, not a heading. */
const HEADING_MAX = 200;

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
 *
 * The word alone is not enough, because a compilation lists its own parts before it prints any of
 * them and the last line of that list is this one. Endnotes come after the operative text, so the
 * boundary only counts once there is operative text to end: before the first provision the word is
 * a contents entry, and a compiled Act that opens with one lost all 1,257 of its sections to it.
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

/** Exposed for the test that holds the register's dates to dates that exist. */
export const __isoDate = (text: string): string | null => isoDate(text);

/** "4 June 2026" as an ISO date, or null if the register wrote something else. */
function isoDate(text: string): string | null {
  const m = /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2]!.toLowerCase());
  if (month < 0) return null;
  // A day the month does not have is a misreading, not a date: "31 February" is refused.
  const day = Number(m[1]);
  const year = Number(m[3]);
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return null;
  return `${m[3]}-${String(month + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
}

/**
 * What the compilation says about itself, on its own first page.
 *
 * A compilation states the date its text is in force at, which is the only acceptable evidence for
 * the "last amended" a row reports. A date the source does not state is a date nobody can check.
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

interface Walk {
  builder: SectionBuilder;
  front: string;
  title: string | null;
  volumes: number;
}

/**
 * A walk over the paragraphs, reading the headings one of two ways.
 *
 * The first way is the templates above, recognised by the classes they use. The second is for
 * pages drafted outside those templates -- the instruments an agency writes in its own house style,
 * standards bodies' codes, determinations typed into a blank document -- and it is run only when
 * the first found nothing, so a page one of the templates can read is never read any differently.
 *
 * What that second way asks is the question a reader asks of an unfamiliar page: is this paragraph
 * styled as a heading, and does its text say what it heads? A heading that names a Chapter, Part,
 * Division, Subdivision or Schedule opens a container; one that opens with a provision number
 * opens a provision. The style is needed because numbers open ordinary paragraphs too -- the
 * subclauses under a clause, the items of a list -- and the number is needed because a heading
 * without one is a caption inside a provision, not the start of a new one.
 */
function walk(html: string, styled: boolean): Walk {
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
  let started = false;
  const body = (text: string): void => {
    if (open) open.body.push(text);
    else if (!started && front.length < 4000) front += `${text}\n`;
    // The templates put nothing between a Part heading and its first section, so what reaches here
    // is contents and boilerplate. A page drafted outside them can put a Standard's whole text under
    // a heading with no number, and dropping it lost four fifths of one code of practice: here the
    // text opens a provision of its own instead.
    else if (styled) open = { label: null, heading: '', anchor: null, body: [text] };
  };
  const enter = (level: number, text: string): void => {
    flush();
    containers.length = Math.min(containers.length, level - 1);
    containers[level - 1] = text;
  };

  // Endnotes close the volume they sit in, not the compilation: a long Act is compiled in several
  // volumes and each one repeats them, so stopping the whole pass at the first set throws away every
  // volume after it -- two thirds of a seven volume Act.
  for (const volume of parts) {
    // And each volume reprints the contents, so "have we reached operative text yet" has to be asked
    // of this volume, not of the compilation. Asked of the compilation, volume one answers for all of
    // them and volumes two onward end at their own contents page.
    const volumeStart = builder.sections.length;
    volumeUrl = volume.url;
    const $ = cheerio.load(volume.html);
    // The page's own contents list links to each of its headings, which marks them where the
    // drafter styled one by hand -- bold, no class -- and no style name can.
    const listed = styled
      ? new Set($('p[class^="TOC"] a[href^="#"]').map((_, a) => ($(a).attr('href') ?? '').slice(1)).get())
      : new Set<string>();
    if (title === null) title = ($('title').first().text() || '').trim() || null;

    for (const el of $(BLOCKS).toArray()) {
      if ($(el).parents(BLOCKS).length > 0) continue;
      const cls = firstClass(el);
      if (ENDNOTES.test(cls)) {
        flush();
        break;
      }
      if (NAVIGATION.test(cls) || DROP.has(cls)) continue;

      const text = nodeText([el]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      if (ENDNOTES_TITLE.test(text) && (open || builder.sections.length > volumeStart)) {
        flush();
        break;
      }

      const $el = $(el);
      const span = (sel: string): string => {
        const node = $el.find(sel).first().get(0);
        return node ? nodeText([node]).replace(/\s+/g, ' ').trim() : '';
      };
      const anchorOf = (): string | null => $el.find('a[id]').first().attr('id') ?? el.attribs['id'] ?? null;

      if (styled) {
        const linked = listed.size > 0 && [el.attribs['id'], ...$el.find('a[id]').map((_, a) => $(a).attr('id')).get()].some((id) => id && listed.has(id));
        if (!linked && !isStyledHeading(el.tagName, cls)) {
          body(text);
          continue;
        }
        const container = STYLED_CONTAINER.exec(text)?.[1];
        if (container) {
          enter(STYLED_LEVEL[container]!, text);
          continue;
        }
        const numbered = text.length <= HEADING_MAX ? PROVISION_NUMBER.exec(text) ?? PROVISION_NAMED.exec(text) : null;
        if (numbered) {
          flush();
          started = true;
          open = { label: numbered[1]!, heading: text.slice(numbered[0].length).trim(), anchor: anchorOf(), body: [text] };
          continue;
        }
        body(text);
        continue;
      }

      // The numbering span only says what this paragraph is when the paragraph opens with it: these
      // are character styles, and the register uses them mid-sentence too.
      const marker = span(STRUCTURAL_SPAN);
      const markerClass = marker && text.startsWith(marker) ? firstClass($el.find(STRUCTURAL_SPAN).first().get(0)!) : '';
      const ld = LD_HEADING.exec(cls)?.[1] ?? '';

      const level = CONTAINER[cls] ?? SPAN_CONTAINER[markerClass] ?? LD_LEVEL[ld];
      if (level !== undefined) {
        enter(level, text);
        continue;
      }

      if (cls === SECTION_CLASS || markerClass === SPAN_SECTION || ld === 'Clause') {
        flush();
        const numbered = ld ? span('span') : span(`span.${SPAN_SECTION}`);
        const label = /^\d/.test(numbered) ? numbered : null;
        const heading = label && text.startsWith(label) ? text.slice(label.length).trim() : text;
        open = { label, heading, anchor: anchorOf(), body: [text] };
        continue;
      }

      body(text);
    }

    // A provision does not run across a volume boundary. Left open, volume one's last section
    // swallowed volume two's front matter, and the contents entry for the endnotes then closed that
    // volume before it had printed a word: four of a five volume Act read as two.
    flush();
  }
  return { builder, front, title, volumes: parts.length };
}

export function parseFrl(html: string, url: string): ParsedDocument {
  let read = walk(html, false);
  let parser = 'frl';
  if (read.builder.sections.length === 0) {
    // None of the templates. Two numbered headings is the least that says the page has provisions
    // to split into; a single one is as likely a title that happens to open with a number.
    const styled = walk(html, true);
    if (styled.builder.sections.length >= 2) {
      read = styled;
      parser = 'frl-styled';
    }
  }

  const meta = readFrontMatter(read.front);
  if (read.builder.sections.length === 0) {
    // Nothing in the page is styled as a numbered heading, so the generic parser takes it.
    const generic = parseHtml(html, url);
    return { ...generic, title: generic.title ?? read.title, meta: { ...meta, ...generic.meta }, parser: 'frl-generic' };
  }

  return {
    extraction: 'html',
    text: rebuild(read.builder, read.front),
    sections: read.builder.sections,
    unread: null,
    title: read.title,
    meta: read.volumes > 1 ? { ...meta, volumes: String(read.volumes) } : meta,
    parser,
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
