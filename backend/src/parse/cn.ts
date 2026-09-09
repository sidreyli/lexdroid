/**
 * Chinese national law, as published by flk.npc.gov.cn.
 *
 * China is the first CJK economy, and its statutes share no numbering vocabulary with the three
 * common-law economies: there is no "Part / s 26 / (1) / (a)" anywhere. The shape is
 *
 *     第一章　总　则                 a Chapter -- context, not a citable unit
 *     第一节　一般规定               a Section within a Chapter -- also context
 *     第一条　为了保护个人信息权益... an Article. THE citable unit, and numbered continuously and
 *                                    uniquely across the whole instrument regardless of which
 *                                    Chapter or Section it falls under
 *     （一）取得个人的同意；          an Item -- the closest analogue to a lettered "(a)" paragraph,
 *                                    and citable: ESCAP evidence for indicator 7.3 turns on the
 *                                    six-month log-retention duty in one item of one article
 *
 * Labels keep the SOURCE numeral -- "第三十八条", not "Article 38". A Chinese-reading reviewer
 * recognises 第三十八条 as a citation on sight, exactly as `s 26` reads as one to a reviewer of the
 * Singapore text, and converting it would trade that for nothing.
 *
 * Verified against the real Personal Information Protection Law and Cybersecurity Law Word files
 * from flk.npc.gov.cn. Three things about those documents drive the code below and none of them
 * are guessable from a specification:
 *
 *  1. The instrument opens with a 目录 that RE-LISTS every chapter heading before the body starts.
 *     "第一章" appears at line 3 and again at line 14. Parsing both makes two chapters sharing one
 *     number, so a repeat of an already-seen chapter is read as the body beginning.
 *  2. 节 headings appear in the BODY as well as the contents, and mid-chapter: PIPL line 72 is
 *     "第二节 敏感个人信息的处理规则" sitting directly after Article 27. Treating an unmatched line
 *     as continuation text -- which is what a port of the predecessor does -- appends that heading
 *     to Article 27 and corrupts the text of a provision that may be cited. They are matched here
 *     and become heading context instead.
 *  3. An unmarked line following an item list is the ARTICLE's next paragraph, not more of the last
 *     item, once that item reads as complete. PIPL 第十三条 ends its list at （七）"...其他情形。"
 *     and then continues "依照本法其他有关规定…" -- which belongs to the article. Terminal
 *     punctuation (。 or ；) is what separates the two cases; "：" is deliberately excluded because
 *     it INTRODUCES a list rather than closing one.
 *
 * What this deliberately does not do is manufacture 款 anchors. Chinese statutes break an article
 * into paragraphs with a plain paragraph break, cited by position ("第一款") but never printed with
 * a marker. Those paragraphs are recorded as sections carrying the article's heading path and a
 * null label -- present, searchable and attributable, claiming no number the source does not print.
 */
import { SectionBuilder, type ParsedDocument } from './types.js';

/** The digits a Chinese statute numbers with. Arabic numerals are accepted alongside them. */
const CN_NUMERAL = '[〇零一二三四五六七八九十百千两]+';
const CHAPTER = new RegExp(`^第(${CN_NUMERAL}|\\d+)章\\s*(.*)$`);
const SUBCHAPTER = new RegExp(`^第(${CN_NUMERAL}|\\d+)节\\s*(.*)$`);
/** "第七条之一" -- an article inserted by amendment between 第七条 and 第八条. */
const ARTICLE = new RegExp(`^第(${CN_NUMERAL}|\\d+)条(?:之(${CN_NUMERAL}|\\d+))?\\s*(.*)$`);
const ITEM = /^[（(]([一二三四五六七八九十百]+)[）)]\s*(.*)$/;
const TOC_HEADING = /^目\s*录$/;
/** A bare page number: provenance, not text. */
const PAGE_NUMBER = /^\d{1,4}$/;
/** The adoption line a statute opens with: "（2021年8月20日第十三届全国人大常委会第三十次会议通过）". */
const ADOPTION = /^[（(].*?(\d{4})年(\d{1,2})月(\d{1,2})日.*(?:通过|公布|修订|修正)/;

/**
 * An item reads as finished once its own text ends this way, and a further unmarked line then
 * belongs to the article rather than to the item. "：" is excluded on purpose -- see the header.
 */
const TERMINAL = ['。', '；'];

const OPENERS = [ARTICLE, CHAPTER, SUBCHAPTER, ITEM];

/** Collapse runs of whitespace, including the full-width 　 used for indentation and padding. */
const clean = (s: string): string => s.replace(/\s+/g, ' ').trim();

interface Pending {
  headingPath: string;
  label: string | null;
  text: string;
}

export interface ParseCnOptions {
  /** The instrument's title, when discovery already knows it from the portal's own metadata. */
  title?: string | null;
}

export function parseCn(paragraphs: string[], url: string, opts: ParseCnOptions = {}): ParsedDocument {
  const lines = paragraphs.map(clean);
  const documentTitle = opts.title?.trim() || lines.find(Boolean) || null;

  const meta: Record<string, string> = {};
  const pending: Pending[] = [];

  let chapter = '';
  let subchapter = '';
  let article: Pending | null = null;
  let articlePath = '';
  let item: Pending | null = null;
  let itemsSeen = false;

  let started = false;
  let inToc = false;
  let chapterAwaitingTitle = false;
  const tocSeen = new Set<string>();
  const preamble: string[] = [];
  let unplaced = 0;

  const path = (...parts: string[]): string => parts.filter(Boolean).join(' > ');

  for (const line of lines) {
    if (!line) continue;
    if (PAGE_NUMBER.test(line)) continue;
    // A running-header repeat of the instrument's own title is not a provision of it.
    if (documentTitle && line === documentTitle && started) continue;

    if (TOC_HEADING.test(line)) {
      inToc = true;
      continue;
    }

    const chapterMatch = CHAPTER.exec(line);
    if (chapterMatch) {
      const number = `第${chapterMatch[1]}章`;
      if (inToc) {
        // The same chapter number coming round a second time is the real body starting.
        if (tocSeen.has(number)) inToc = false;
        else {
          tocSeen.add(number);
          continue;
        }
      }
      const heading = clean(chapterMatch[2] ?? '');
      chapter = heading ? `${number} ${heading}` : number;
      subchapter = '';
      article = null;
      item = null;
      itemsSeen = false;
      started = true;
      // A chapter number printed alone takes its title from the following line.
      chapterAwaitingTitle = !heading;
      continue;
    }

    if (chapterAwaitingTitle) {
      chapterAwaitingTitle = false;
      if (!OPENERS.some((p) => p.test(line))) {
        chapter = `${chapter} ${line}`;
        continue;
      }
    }

    const subchapterMatch = SUBCHAPTER.exec(line);
    if (subchapterMatch) {
      if (inToc) continue;
      const number = `第${subchapterMatch[1]}节`;
      const heading = clean(subchapterMatch[2] ?? '');
      subchapter = heading ? `${number} ${heading}` : number;
      article = null;
      item = null;
      itemsSeen = false;
      started = true;
      continue;
    }

    const articleMatch = ARTICLE.exec(line);
    if (articleMatch) {
      if (inToc) continue;
      const label = `第${articleMatch[1]}条` + (articleMatch[2] ? `之${articleMatch[2]}` : '');
      articlePath = path(chapter, subchapter, label);
      article = { headingPath: articlePath, label, text: clean(articleMatch[3] ?? '') };
      pending.push(article);
      item = null;
      itemsSeen = false;
      started = true;
      continue;
    }

    // Anything before the first chapter or article is the long title and the adoption note.
    if (!started) {
      preamble.push(line);
      continue;
    }
    if (inToc) continue;

    const itemMatch = ITEM.exec(line);
    if (itemMatch && article) {
      const label = `${article.label}（${itemMatch[1]}）`;
      item = { headingPath: path(articlePath, `（${itemMatch[1]}）`), label, text: clean(itemMatch[2] ?? '') };
      pending.push(item);
      itemsSeen = true;
      continue;
    }

    // An unmarked line. Three cases, in order of how tightly it binds to what came before.
    if (item && !TERMINAL.some((p) => item!.text.endsWith(p))) {
      // The open item has not finished its sentence, so this is the rest of it.
      item.text = item.text ? `${item.text} ${line}` : line;
      continue;
    }
    item = null;
    if (!article) {
      unplaced += 1;
      continue;
    }
    if (!itemsSeen) {
      // A further 款 of an article that never opened a list: part of the same provision.
      article.text = article.text ? `${article.text} ${line}` : line;
      continue;
    }
    // A 款 following a closed item list. Its own section, carrying the article's heading path and
    // no label, because the source prints no number for it.
    pending.push({ headingPath: articlePath, label: null, text: line });
  }

  const adoption = preamble.find((l) => ADOPTION.test(l));
  if (adoption) {
    const m = ADOPTION.exec(adoption)!;
    // Adoption is not commencement -- PIPL was adopted 2021-08-20 and took effect 2021-11-01 -- so
    // it is recorded under its own name. Claiming it as a commencement date would be exactly the
    // unevidenced timeframe ESCAP's reviewers send back.
    meta['adoptedOn'] = `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
    meta['adoptedBasis'] = adoption;
  }
  if (unplaced > 0) meta['unplacedLines'] = String(unplaced);

  const builder = new SectionBuilder();
  for (const line of preamble) builder.addProse(line);
  for (const p of pending) {
    builder.add({
      headingPath: p.headingPath,
      label: p.label,
      text: p.text,
      page: null,
      language: 'zh',
      repealed: false,
      // flk.npc.gov.cn renders its detail page client-side and publishes no per-article fragment,
      // so there is nothing to deep link to. The label is what a citation carries.
      anchor: null,
    });
  }

  if (builder.sections.length === 0) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      unread: {
        reason: 'empty',
        detail: `${url} yielded no 第N条 articles; it may not be a Chinese statute in the flk.npc.gov.cn format.`,
      },
      title: documentTitle,
      meta,
      parser: 'cn',
    };
  }

  meta['articleCount'] = String(pending.filter((p) => p.label && !p.label.includes('（')).length);

  return {
    extraction: 'plain',
    text: builder.text,
    sections: builder.sections,
    unread: null,
    title: documentTitle,
    meta,
    parser: 'cn',
  };
}
