/**
 * Reading a document from Russia's official legal information system (pravo.gov.ru/proxy/ips).
 *
 * The gazette at publication.pravo.gov.ru serves viewer shells -- 21 KB of HTML, 300 characters of
 * metadata and "Страница № 1 из 11" -- with the text in a PDF under a path robots.txt disallows.
 * IPS, on the same government domain with nothing disallowed, serves the full consolidated text as
 * HTML: `?doc_itself=&nd=<id>&page=all`. It is windows-1251, which fetch/decode.ts now reads.
 *
 * The generic HTML path cannot read it. Its provision pattern wants a leading number, and a Russian
 * article is headed "Статья 1. Сфера действия..." -- a word first. What IPS gives instead is markup
 * that says what each paragraph is, measured on Decree 763 and Law 152-ФЗ:
 *
 *   p.T   bold centred -- the instrument's type and title, an annex's title
 *   p.C   centred      -- "РОССИЙСКАЯ ФЕДЕРАЦИЯ", the list of amending acts
 *   p.H   bold, hanging -- "Глава 1. Общие положения", "Статья 1. Сфера действия ..."
 *   p.I   left         -- "Принят Государственной Думой ...", the signature
 *   p.S   right block  -- "Приложение к Указу Президента ... от 23 мая 1996 г. № 763"
 *   p.P   note         -- "(Дополнение статьей - Федеральный закон от 30.12.2020 № 519-ФЗ)"
 *   span.W9            -- a superscript: "Статья 10<span class=W9>1</span>" is article 10¹
 *
 * The superscript is the same trap Mongolia had. Read as text, 152-ФЗ's inserted articles 10¹, 13¹,
 * 18¹ and 23¹ become "Статья 101", "131", "181", "231" -- numbers of articles that do not exist.
 *
 * The citable unit is the article where the instrument has articles (a Law, a Code); otherwise the
 * numbered point (a Decree, a Government resolution), with its sub-points "1)" and "а)" inside it.
 * An annex -- "Приложение", or the rules a resolution approves under "УТВЕРЖДЕНЫ" -- is its own
 * block under its own name, numbered afresh.
 */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { nodeText } from './html-text.js';
import { SectionBuilder, type ParsedDocument } from './types.js';

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
const SUP = '[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]';
const NUM = `\\d{1,4}${SUP}*`;

/** "Статья 1.", "Статья 10¹.", "Статья 15.1." -- the label is the number, superscript and all. */
const ARTICLE = new RegExp(`^Статья\\s+(${NUM}(?:\\.${NUM})*)\\s*\\.?`, 'u');

/**
 * A numbered point: "1.", "2¹.", "3.1.". Only the full stop: Russian drafting numbers sub-points
 * "1)" and "а)", and those belong inside the point above them.
 */
const POINT = new RegExp(`^(\\d{1,3}${SUP}*(?:\\.\\d{1,3}${SUP}*)*)\\.(?!\\d)|^(\\d{1,3}${SUP}*(?:\\.\\d{1,3}${SUP}*)+)\\s`, 'u');

function pointOf(text: string): { label: string; depth: number } | null {
  const m = POINT.exec(text);
  const label = m?.[1] ?? m?.[2];
  return label ? { label, depth: label.split('.').length } : null;
}

/**
 * The containers, outermost first. A Code has parts, sections, subsections, chapters and
 * paragraphs (§); a Law usually chapters alone. Each is given its level so that a new chapter
 * closes the paragraph above it but not the section.
 */
const CONTAINERS: { level: number; pattern: RegExp }[] = [
  { level: 0, pattern: /^ЧАСТЬ\s+(?:ПЕРВАЯ|ВТОРАЯ|ТРЕТЬЯ|ЧЕТВЕРТАЯ|ЧЕТВЁРТАЯ|ПЯТАЯ)/u },
  { level: 1, pattern: /^(?:Раздел|РАЗДЕЛ)\s+[IVXLC\d]+/u },
  { level: 2, pattern: /^(?:Подраздел|ПОДРАЗДЕЛ)\s+[IVXLC\d]+/u },
  { level: 3, pattern: new RegExp(`^(?:Глава|ГЛАВА)\\s+(?:${NUM}(?:\\.${NUM})*|[IVXLC]+)`, 'u') },
  { level: 4, pattern: new RegExp(`^§\\s*${NUM}`, 'u') },
];

function containerLevel(text: string): number | null {
  return CONTAINERS.find((c) => c.pattern.test(text))?.level ?? null;
}

/**
 * The system's notes on the text's history, in parentheses: "(В редакции Федерального закона
 * ...)", "(Дополнение статьей - ...)", "(Часть утратила силу - ...)". Part of the text, never a
 * provision of their own.
 */
const NOTE = /^\((?:[А-ЯЁа-яё]+\s+)?(?:в\s+редакции|утратил[аио]?\s+силу|дополнени|исключ|признан|приостановлен|вступает\s+в\s+силу)/iu;

/** "(Утратил силу - ...)", "(Статья утратила силу - ...)": the system's note that a provision is gone. */
const REPEAL = /^\((?:[А-ЯЁа-яё]+\s+)?утратил[аио]?\s+силу/iu;

/**
 * A provision the system says is repealed: its heading reads "Статья 4. (Утратила силу - ...)" or
 * "2¹. (Утратил силу - Указ ...)", or the heading stands alone and the note is the line beneath it
 * -- "Статья 5.2." then "(Статья утратила силу - Федеральный закон от 04.07.2003 № 94-ФЗ)", which
 * is how the Code of Administrative Offences writes all of its repealed articles. A repeal note
 * further down, on one of its parts, repeals the part and not the provision.
 */
function repealedByHeading(heading: string, first: string | undefined): boolean {
  const rest = heading.replace(ARTICLE, '').replace(POINT, '').trim();
  return REPEAL.test(rest) || (rest === '' && first !== undefined && REPEAL.test(first));
}

/** The signature and the place, date and number beneath it: "Президент Российской Федерации В.Путин", "Москва, Кремль", "27 июля 2006 года", "№ 152-ФЗ". */
const SIGNATURE_LINE = /^(?:Москва|Президент Российской Федерации|Председатель Правительства|Министр|Руководитель|Директор|№\s*\S+$|\d{1,2}\s+[а-яё]+\s+\d{4}\s*(?:года|г\.)?$|_{3,}$)/u;

/** Where an annex begins: "Приложение к Указу ...", or the rules a resolution approves: "УТВЕРЖДЕНЫ постановлением ...". */
const ANNEX_START = /^(?:Приложение|ПРИЛОЖЕНИЕ|УТВЕРЖДЕН[АЫО]?|УТВЕРЖДЁН)(?:\s|$|\s*№|\s*к\s)/u;

interface Paragraph {
  text: string;
  /** The IPS paragraph class: T, C, H, I, S, P, or '' for body text. */
  role: string;
}

function paragraphsOf(html: string): Paragraph[] {
  const $ = cheerio.load(html);
  const root = $('div.doc_content').first().length ? $('div.doc_content').first() : $('body');
  root.find('script, style').remove();
  root.find('span.W9, sup').each((_, e) => {
    const t = $(e).text().trim();
    // Hyphenated too: 149-ФЗ numbers articles 10²⁻¹ and 15³⁻², written 10<W9>2-1</W9>.
    if (/^\d+(?:-\d+)*$/.test(t)) $(e).replaceWith(t.replace(/[\d-]/g, (d) => (d === '-' ? '⁻' : SUPERSCRIPT[d]!)));
  });
  // A line break inside one paragraph -- "Приложение<br>к Указу Президента" -- is still one line.
  root.find('br').replaceWith(' ');
  return root
    .find('p')
    .toArray()
    .map((p) => ({
      text: nodeText([p as AnyNode]).replace(/[​-‍⁠﻿]/g, '').replace(/\s+/g, ' ').trim(),
      role: ($(p).attr('class') ?? '').trim(),
    }))
    .filter((p) => p.text && !/^_+$/.test(p.text));
}

/** Where the signature block starts: the run of signature lines closing the block. */
function signatureStart(paragraphs: Paragraph[]): number {
  let i = paragraphs.length;
  while (i > 0 && (SIGNATURE_LINE.test(paragraphs[i - 1]!.text) || paragraphs[i - 1]!.role === 'I')) i -= 1;
  // "Принят Государственной Думой" is role I too, but it opens the document; it is not a signature.
  return i;
}

function readBlock(builder: SectionBuilder, paragraphs: Paragraph[], annex: string | null): void {
  const signature = signatureStart(paragraphs);
  const body = paragraphs.slice(0, signature);

  const articles = body.filter((p) => ARTICLE.test(p.text)).length;
  const depths = body
    .filter((p) => !NOTE.test(p.text) && containerLevel(p.text) === null)
    .map((p) => pointOf(p.text)?.depth)
    .filter((d): d is number => d !== undefined);
  const unitDepth = articles > 0 ? null : depths.length > 0 ? Math.min(...depths) : null;

  // Nothing numbered: a list, a short act. One provision, so that it is searched at all.
  if (articles === 0 && unitDepth === null) {
    const text = body.map((p) => p.text).join('\n');
    if (text) {
      builder.add({
        headingPath: annex ?? body[0]!.text.slice(0, 120),
        label: null, text, page: null, language: null, repealed: false, anchor: null,
      });
    }
    for (const p of paragraphs.slice(signature)) builder.addProse(p.text);
    return;
  }

  const stack: (string | undefined)[] = [];
  let open: { label: string | null; heading: string; body: string[] } | null = null;

  const close = (): void => {
    if (!open) return;
    builder.add({
      headingPath: [annex, ...stack.filter(Boolean), open.heading].filter(Boolean).join(' > '),
      label: open.label,
      text: [open.heading, ...open.body].join('\n'),
      page: null,
      // Left to the export's detection against the economy's declared languages.
      language: null,
      repealed: open.label !== null && repealedByHeading(open.heading, open.body[0]),
      anchor: null,
    });
    open = null;
  };

  const unitOf = (p: Paragraph): string | null => {
    if (articles > 0) return ARTICLE.exec(p.text)?.[1] ?? null;
    const n = pointOf(p.text);
    return n && n.depth === unitDepth ? n.label : null;
  };

  for (const p of body) {
    const level = containerLevel(p.text);
    if (level !== null) {
      close();
      stack.length = level;
      stack[level] = p.text;
      builder.addProse(p.text);
      continue;
    }

    const label = unitOf(p);
    if (label !== null) {
      close();
      open = { label, heading: p.text, body: [] };
      continue;
    }

    if (open) open.body.push(p.text);
    else if (stack.some(Boolean) && !NOTE.test(p.text)) open = { label: null, heading: p.text, body: [] };
    else builder.addProse(p.text);
  }
  close();
  for (const p of paragraphs.slice(signature)) builder.addProse(p.text);
}

export function parseIps(html: string, url: string): ParsedDocument {
  const paragraphs = paragraphsOf(html);
  if (paragraphs.length === 0) {
    return {
      extraction: 'none', text: '', sections: [], title: null, meta: {}, parser: 'ips',
      unread: { reason: 'empty', detail: `${url} has no paragraphs in its document body.` },
    };
  }

  // The instrument, then each annex: an annex begins at its "Приложение" / "УТВЕРЖДЕНЫ" block and
  // is named by the title that follows it.
  const starts = paragraphs
    .map((p, i) => ((p.role === 'S' || p.role === 'C' || p.role === '') && ANNEX_START.test(p.text) && i > 0 ? i : -1))
    .filter((i) => i > 0)
    // A run of annex lines ("Приложение", "к постановлению ...") is one start.
    .filter((i, k, all) => k === 0 || i !== all[k - 1]! + 1);

  const builder = new SectionBuilder();
  const bounds = [0, ...starts, paragraphs.length];
  readBlock(builder, paragraphs.slice(0, bounds[1]), null);
  for (let b = 1; b < bounds.length - 1; b += 1) {
    const part = paragraphs.slice(bounds[b], bounds[b + 1]);
    // The annex's header -- "Приложение к Указу ...", "УТВЕРЖДЕНЫ постановлением ..." -- and the
    // title beneath it, up to its first numbered line. The title names the annex.
    let k = 0;
    while (
      k < part.length &&
      (ANNEX_START.test(part[k]!.text) || ['S', 'T', 'C'].includes(part[k]!.role)) &&
      !ARTICLE.test(part[k]!.text) &&
      !pointOf(part[k]!.text)
    ) {
      builder.addProse(part[k]!.text);
      k += 1;
    }
    const head = part.slice(0, k);
    const title = head.filter((h) => h.role === 'T').map((h) => h.text).join(' ') || head.map((h) => h.text).join(' ');
    readBlock(builder, part.slice(k), `Приложение: ${title}`.slice(0, 200));
  }

  return {
    extraction: 'html',
    text: builder.text,
    sections: builder.sections,
    // The title block: the bold centred lines before the first heading of the body.
    title:
      paragraphs
        .slice(0, Math.max(0, paragraphs.findIndex((p) => containerLevel(p.text) !== null || ARTICLE.test(p.text) || pointOf(p.text) !== null)))
        .filter((p) => p.role === 'T')
        .map((p) => p.text)
        .join(' ') || null,
    meta: {},
    parser: 'ips',
    unread: builder.sections.length === 0 ? { reason: 'empty', detail: `${url} yielded no provisions.` } : null,
  };
}
