/**
 * Reading a document from Mongolia's Unified Legal Information System.
 *
 * The generic HTML path does two things wrong here, and both are silent.
 *
 * It never finds the document. `legalinfo.mn` serves one page per instrument with the text in a
 * `.law_content` block and the site's furniture around it, so the generic parse takes the whole
 * page: the Anti-Corruption Law arrived as 112,095 characters beginning
 * "+(976)-11-323317 info@legalinstitute.mn Тусламж A A A Бүртгүүлэх Нэвтрэх" -- a phone number,
 * an email and the login links. Scoped to the block it is 52,296 characters of law.
 *
 * And it cannot see where one provision ends. `PROVISION_LINE` in html.ts matches a leading
 * number followed by a delimiter and a space; a Mongolian article is written
 * "1 дүгээр зүйл.Хуулийн зорилт" -- the number, two words, then a full stop with no space after
 * it. So the Anti-Corruption Law parsed to a single section of 112 KB.
 *
 * What this reads instead is the structure the drafter used: chapters for the heading path, and
 * as the citable unit the article (N дугаар зүйл) where the instrument has articles, or else the
 * shallowest numbered point it has -- "1." in a resolution, "2.3." in a procedure (журам), which
 * is how a журам is cited ("энэ журмын 2.2-т").
 *
 * Measured against 24 real pages, four more things the first version of this parser got wrong,
 * each of them silent:
 *
 *  - It read only `<p>`. The site nests `<div>` inside `<p>`, which HTML parsing turns into an
 *    empty paragraph and an orphaned div, so provisions 18.2.2 and 18.4.16 of the Anti-Corruption
 *    Law never reached the corpus. Text is now read block by block from the whole content block.
 *  - It flattened superscripts. An article inserted by amendment is "2<sup>1</sup> дүгээр зүйл",
 *    article 2¹; read as text it became "21 дүгээр зүйл", beside the real article 21, so a citation
 *    of article 21 could resolve to either. The Auto Transport Law has five of them.
 *  - It split sub-points. "1.1." matched the numbered-paragraph pattern as paragraph 1, so a
 *    resolution with points 1, 1.1, 1.2, 2 stored three sections labelled "1".
 *  - It dropped any paragraph containing "@", which is furniture on this site but also any
 *    provision that states an address.
 *
 * And one thing no parse of the page could fix: a resolution that approves a procedure "per the
 * annex" does not carry the annex. The site serves it on a page of its own, so the adapter fetches
 * it and appends it (see `resolveDocument` in src/discover/legalinfo.ts), and this reads each
 * annex as its own block, under its own name.
 */
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { nodeText } from './html-text.js';
import { SectionBuilder, type ParsedDocument } from './types.js';

/** Where the instrument's own text lives, most specific first. */
const CONTENT = ['.law_content', '.main-huuliin-content', '.maincontenter'];

/**
 * An annex the adapter fetched and appended to the page it belongs to. The site serves each on its
 * own page, so the resolution's page alone says "approved per the annex" and holds none of what
 * was approved.
 */
export const ANNEX = 'section.lexdroid-annex';

/** Superscript digits, for the articles and points an amendment inserts: 2¹, 19². */
const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};
const SUP = '[⁰¹²³⁴⁵⁶⁷⁸⁹]';

/**
 * An article heading, in either of the two forms Mongolian drafting uses.
 *
 * An ordinary Law numbers them: "1 дүгээр зүйл.Хуулийн зорилт" -- article one, on the purpose of
 * the law. The Constitution spells the ordinal out instead: "Нэгдүгээр зүйл.", "Хоёрдугаар
 * зүйл.". Matching only the first form is why the Constitution parsed to 203 pieces of mean 269
 * characters -- it fell through to the numbered fallback and split on sub-clauses.
 *
 * Both endings appear because the ordinal is inflected, and neither is optional: "зүйл" on its
 * own is the ordinary noun for a thing, and the Constitution's article 7 contains "соёлын
 * дурсгалт зүйл" -- cultural artefacts -- which is not an article heading.
 *
 * The optional leading word is what makes the Constitution parse at all. Mongolian builds a
 * compound ordinal from two words -- "Арван нэгдүгээр зүйл" is ten-one-th, article 11 -- so a
 * pattern anchored on a single token finds the first ten articles and then stops. Measured on the
 * Constitution: 16 headings without it, 71 with it -- the site marks 71 article headings, one of
 * them the inserted article 19¹.
 */
const ARTICLE = /^((?:\S+\s+)?\S*(?:дугаар|дүгээр))\s+зүйл/iu;

/** The citable label: the numeral where the drafter used one (with its superscript), the ordinal word where not. */
function articleLabel(matched: string): string {
  return new RegExp(`^\\d+${SUP}*`, 'u').exec(matched)?.[0] ?? matched.trim();
}

/**
 * A numbered point: "1.", "2.Уг", "1.1.нийслэл", "2¹.1.". The label is the whole dotted number and
 * its depth is how many parts it has. Each part is at most three digits, so a date written
 * "2022.01.18" is not read as point 2022.01.
 *
 * The stop after the number must not be followed by another digit, and a number of two or more
 * parts may end in a space instead: the military ranks procedure writes "2.4 Цэргийн" between
 * "2.3." and "3.1.", and without both rules that one missing stop read as point 2 and turned the
 * whole procedure into a single section.
 */
const POINT = new RegExp(
  `^(\\d{1,3}${SUP}*(?:\\.\\d{1,3}${SUP}*)*)\\s*[.)](?!\\d)|^(\\d{1,3}${SUP}*(?:\\.\\d{1,3}${SUP}*)+)\\s`,
  'u',
);

function pointOf(text: string): { label: string; depth: number } | null {
  const m = POINT.exec(text);
  const label = m?.[1] ?? m?.[2];
  return label ? { label, depth: label.split('.').length } : null;
}

/**
 * "НЭГДҮГЭЭР БҮЛЭГ" -- chapter one -- with its name either on the same line or in the next
 * paragraph.
 *
 * No `\b` anywhere in this file. JavaScript's word boundary is defined against `\w`, which is
 * ASCII, so it never matches beside a Cyrillic letter -- `/\bБҮЛЭГ/.test('НЭГДҮГЭЭР БҮЛЭГ')` is
 * false. It fails silently and in the direction that looks like working code: the first draft of
 * this parser detected no chapters at all on the real Anti-Corruption Law.
 */
const CHAPTER = /^[^.]{0,48}бүлэг\s*$/iu;
const CHAPTER_NAMED = /^(?:\S+\s+)?\S*(?:дугаар|дүгээр)\s+бүлэг\s*[.:]\s*\S/iu;

/**
 * The heading of a part of a procedure (журам): "Нэг.Нийтлэг үндэслэл", "Хоёр. Зөвлөл байгуулах",
 * or in Roman numerals, "II. ЗӨВЛӨЛИЙН БҮРЭЛДЭХҮҮН". A cardinal word, not an ordinal -- the
 * points beneath are numbered 1.1, 2.1 after it.
 */
const PART = new RegExp(
  '^(?:нэг|хоёр|гурав|дөрөв|тав|зургаа|долоо|найм|ес|арав|' +
    'арван\\s+(?:нэг|хоёр|гурав|дөрөв|тав|зургаа|долоо|найм|ес)|хорь|' +
    '[IVXLC]{1,6})\\s*\\.\\s*\\S',
  'iu',
);

/** Every letter capitalised: "1. НИЙТЛЭГ ҮНДЭСЛЭЛ" is a heading, where "1. Зөвлөл нь..." is a point. */
function allCaps(text: string): boolean {
  const letters = text.replace(/[^\p{L}]/gu, '');
  return letters.length >= 4 && letters === letters.toUpperCase();
}

/** The toolbar the page puts above the text: listen, Pdf, Word, print, share. */
const TOOLBAR = /^(?:Сонсох|Pdf|Word|Хэвлэх|Хуваалцах|Текст томруулах|A)(?:[\s/]|$)/iu;

/** A paragraph that is furniture rather than law: the toolbar, a bare phone number, a bare address. */
function isFurniture(text: string): boolean {
  return (
    text.length < 2 ||
    TOOLBAR.test(text) ||
    /^[+0-9()\s-]{7,}$/.test(text) ||
    /^\S+@\S+\.\S+$/.test(text)
  );
}

/**
 * The site's note that a provision was repealed, in its own words: "/Энэ заалтыг 2023 оны 07
 * дугаар сарын 07-ны өдрийн хуулиар хүчингүй болсонд тооцсон./". It follows the struck-through
 * text it refers to.
 */
const REPEAL_NOTE = /^\/.*хүчингүй болсонд тооцсон.*\/?$/iu;

/** Any of the site's notes on the text's history, which it writes between slashes. */
const EDITORIAL_NOTE = /^\/.*\/\.?$/u;

/**
 * The note that repeals the provision it stands under, not one of its parts. The site says which:
 * "Энэ зүйлийг" is this article, "Энэ хэсгийг" this part (6.1), "Энэ заалтыг" this clause (6.1.1).
 * Reading any repeal note near the top as the article's own is how article 6 of the Auto Transport
 * Law -- in force, with only clause 6.1.1 repealed -- came to be excluded from evidence.
 */
function repealsItself(line: string, unit: 'article' | 'point'): boolean {
  const noun = unit === 'article' ? 'зүйлийг' : '(?:хэсгийг|заалтыг)';
  return new RegExp(`/\\s*Энэ ${noun}[^/]*хүчингүй болсонд тооцсон`, 'iu').test(line);
}

interface Paragraph {
  text: string;
  /** Struck through on the site: repealed wording, still shown. */
  struck: boolean;
  /** A line of a table. "1.Автобензин" in a tax table is a row, not point 1 of the instrument. */
  inTable: boolean;
}

/**
 * Zero-width spaces, joiners and byte-order marks. The site pads signature blocks with runs of
 * U+200B, and a quote typed by a person never contains one, so it could not be matched back.
 */
const INVISIBLE = /[​-‍⁠﻿]/g;

const clean = (t: string): string => t.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();

/** One block of the page -- the instrument, or one annex -- as paragraphs, in document order. */
function paragraphsOf($: cheerio.CheerioAPI, block: cheerio.Cheerio<AnyNode>): Paragraph[] {
  // The per-provision icons (compare, copy) and the empty comparison panels the page fills in on
  // click. Neither carries law.
  block.find('.icon-s, i.fa, script, style').remove();
  block.find('sup').each((_, e) => {
    const t = $(e).text().trim();
    if (/^\d+$/.test(t)) $(e).replaceWith(t.replace(/\d/g, (d) => SUPERSCRIPT[d]!));
  });

  const struck = new Set(block.find('strike, s, del').toArray().map((e) => clean($(e).text())).filter(Boolean));

  // A table row on one line, its cells apart: "1. | Төсөвт байгууллагуудын халаалт | Төг/м3 | 2830".
  // Read cell by cell, a tariff arrived as a column of categories and then a column of prices,
  // and nothing in the text said which price was whose.
  const tabled = new Set<string>();
  for (const tr of block.find('tr').toArray()) {
    if (!tr.parent) continue;
    const row = $(tr)
      .children('td, th')
      .toArray()
      .map((c) => clean(nodeText([c])))
      .filter(Boolean)
      .join(' | ');
    if (row) tabled.add(row);
    $(tr).replaceWith($('<p></p>').text(row));
  }

  return nodeText(block.toArray())
    .split('\n')
    .map(clean)
    .filter((t) => t && !isFurniture(t))
    .map((text) => ({ text, struck: struck.has(text), inTable: tabled.has(text) }));
}

/**
 * Where the signature block begins: the run of lines at the end that are all in capitals --
 * "МОНГОЛ УЛСЫН ЕРӨНХИЙ САЙД Г.ЗАНДАНШАТАР", "ДАРГА", "Ш.МАНДАХНАР". It names who signed, and
 * belongs to the document but to no provision; left in, it was read as part of the last point.
 */
function signatureStart(paragraphs: Paragraph[]): number {
  let i = paragraphs.length;
  while (i > 0) {
    const t = paragraphs[i - 1]!.text;
    if (t.length > 120 || /\d/.test(t) || !allCaps(t)) break;
    i -= 1;
  }
  return i;
}

/**
 * Read one block into the builder: its front matter and signatures as prose, its provisions as
 * sections. Each block chooses its own citable unit, because the procedure a resolution approves
 * is numbered 1.1, 2.1 while the resolution numbers its points 1, 2.
 *
 * `annex` is the annex's own name, which heads every path inside it, and whether the portal lists
 * it as repealed -- in which case every provision in it is.
 */
function readBlock(builder: SectionBuilder, paragraphs: Paragraph[], annex: { name: string; repealed: boolean } | null): void {
  // The signature block closes the document and belongs to no provision.
  const signature = signatureStart(paragraphs);
  const body = paragraphs.slice(0, signature);
  /** A line that may open a provision or a chapter: not a table row, not the signature. */
  const structural = body.filter((p) => !p.inTable);

  // The citable unit: articles where the instrument has them; otherwise the shallowest numbered
  // point it has, so that 1.1 and 1.2 stay inside point 1 of a resolution, and a procedure whose
  // points begin at 1.1 is cited at 1.1.
  const articles = structural.filter((p) => ARTICLE.test(p.text)).length;
  // A depth-1 line in capitals is a part heading ("1. НИЙТЛЭГ ҮНДЭСЛЭЛ"), not a point.
  const pointDepths = structural
    .map((p) => ({ p, n: pointOf(p.text) }))
    .filter(({ p, n }) => n !== null && !(n.depth === 1 && allCaps(p.text)))
    .map(({ n }) => n!.depth);
  const unitDepth = pointDepths.length > 0 ? Math.min(...pointDepths) : null;

  // Nothing numbered at all -- a tariff, a quota table, a short notice. Read as prose it would be
  // stored and never found, since only sections are indexed; so the whole of it is one provision.
  if (articles === 0 && unitDepth === null) {
    const [first, ...rest] = body;
    if (first) {
      builder.add({
        headingPath: annex ? `Хавсралт: ${annex.name}` : first.text.slice(0, 120),
        label: null,
        text: [first, ...rest].map((p) => p.text).join('\n'),
        page: null,
        language: null,
        repealed: annex?.repealed ?? false,
        anchor: null,
      });
    }
    for (const p of paragraphs.slice(signature)) builder.addProse(p.text);
    return;
  }

  let chapter: string | null = null;
  let subpart: string | null = null;
  /** The provision being accumulated, or null while we are still in the front matter. */
  let open: { label: string | null; heading: string; body: Paragraph[]; struck: boolean } | null = null;

  const close = (): void => {
    if (!open) return;
    const live = open.body.filter((b) => !b.struck && !REPEAL_NOTE.test(b.text));
    builder.add({
      headingPath: [annex ? `Хавсралт: ${annex.name}` : null, chapter, subpart, open.heading].filter(Boolean).join(' > '),
      label: open.label,
      text: [open.heading, ...open.body.map((b) => b.text)].join('\n'),
      page: null,
      // Left to the export's own detection, which reads the provision's text against the
      // economy's declared languages -- see languageOf in src/export/index.ts.
      language: null,
      // Repealed when the site's note says so of this provision itself -- in its heading line or
      // straight beneath it -- or when everything in it is struck through: an article whose points
      // were all repealed one by one is no longer law either. And every provision of an annex the
      // portal lists as repealed.
      repealed:
        (annex?.repealed ?? false) ||
        [open.heading, open.body[0]?.text ?? ''].some((l) => repealsItself(l, articles > 0 ? 'article' : 'point')) ||
        (open.struck && live.length === 0) ||
        (open.body.length > 0 && live.length === 0 && open.body.some((b) => b.struck)),
      anchor: null,
    });
    open = null;
  };

  /**
   * A part within a chapter, in an instrument cited by article. The Constitution's third chapter,
   * on the structure of the State, divides into "НЭГ. Монгол Улсын Их Хурал", "ХОЁР. Монгол Улсын
   * Ерөнхийлөгч" and so on; an article there sits under both.
   */
  const isSubpart = (p: Paragraph): boolean => {
    const word = p.text.split('.')[0]!;
    return !p.inTable && articles > 0 && PART.test(p.text) && word === word.toUpperCase();
  };

  const isContainer = (p: Paragraph, next: Paragraph | undefined): boolean => {
    if (p.inTable) return false;
    if (CHAPTER.test(p.text) || CHAPTER_NAMED.test(p.text)) return true;
    if (articles > 0) return false;
    if (PART.test(p.text)) return true;
    const n = pointOf(p.text);
    return n !== null && n.depth === 1 && allCaps(p.text) && (next === undefined || pointOf(next.text)?.depth !== 1);
  };

  const unitOf = (p: Paragraph): { label: string } | null => {
    if (p.inTable) return null;
    if (articles > 0) {
      const m = ARTICLE.exec(p.text);
      return m ? { label: articleLabel(m[1] ?? '') } : null;
    }
    const n = pointOf(p.text);
    return n && unitDepth !== null && n.depth === unitDepth ? { label: n.label } : null;
  };

  for (let i = 0; i < body.length; i += 1) {
    const p = body[i]!;
    const next = body[i + 1];

    // A chapter heading names what follows and is not itself a provision. Its own name may sit
    // in the next paragraph: "НЭГДҮГЭЭР БҮЛЭГ" then "НИЙТЛЭГ ҮНДЭСЛЭЛ".
    // Kept in the document text as well as the heading path: the stored text is the whole of what
    // was read, and a heading missing from it is a document that no longer says its own structure.
    if (isContainer(p, next)) {
      close();
      subpart = null;
      if (CHAPTER.test(p.text) && next && !unitOf(next) && !isContainer(next, body[i + 2])) {
        chapter = `${p.text} ${next.text}`;
        builder.addProse(p.text);
        builder.addProse(next.text);
        i += 1;
      } else {
        chapter = p.text;
        builder.addProse(p.text);
      }
      continue;
    }
    if (isSubpart(p)) {
      close();
      subpart = p.text;
      builder.addProse(p.text);
      continue;
    }

    const unit = unitOf(p);
    if (unit) {
      close();
      open = { label: unit.label, heading: p.text, body: [], struck: p.struck };
      continue;
    }

    // Before the first provision this is the front matter -- the instrument type, its date, its
    // number, its title. Kept in the document text, because a citation offset has to index into
    // the whole of what was read, but not a citable section of its own.
    //
    // Under a heading it is not front matter. The military ranks procedure opens its first part
    // with three unnumbered paragraphs -- its purpose, and what a rank is -- and as prose they were
    // stored where nothing could search them. They are a provision without a number.
    //
    // The site's own editorial notes ("/Энэ бүлгийн гарчигт ... нэмэлт оруулсан/" -- this chapter's
    // title was amended by...) say what happened to the text and are not a provision of it.
    if (open) open.body.push(p);
    else if (chapter !== null && !EDITORIAL_NOTE.test(p.text)) open = { label: null, heading: p.text, body: [], struck: p.struck };
    else builder.addProse(p.text);
  }
  close();
  for (const p of paragraphs.slice(signature)) builder.addProse(p.text);
}

export function parseLegalinfo(html: string, url: string): ParsedDocument {
  const $ = cheerio.load(html);
  // Each annex carries its own page's content block, so the instrument's is the first one outside them.
  const main = CONTENT.map((s) => $(s).filter((_, e) => $(e).closest(ANNEX).length === 0).first()).find(
    (el) => el.length > 0,
  );
  const annexes = $(ANNEX).toArray();

  const builder = new SectionBuilder();
  if (main) readBlock(builder, paragraphsOf($, main), null);
  for (const a of annexes) {
    const el = $(a);
    const content = CONTENT.map((s) => el.find(s).first()).find((x) => x.length > 0) ?? el;
    readBlock(builder, paragraphsOf($, content), {
      name: el.attr('data-title') ?? 'Хавсралт',
      repealed: /хүчингүй/iu.test(el.attr('data-status') ?? ''),
    });
  }

  if (!builder.text) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      title: null,
      meta: {},
      parser: 'legalinfo',
      unread: {
        reason: 'empty',
        detail: main ? `${url} has no text inside its content block.` : `${url} has no content block.`,
      },
    };
  }

  return {
    extraction: 'html',
    text: builder.text,
    sections: builder.sections,
    // The register already carries the instrument's name from the listing, and picking it out of
    // the front matter means choosing between "МОНГОЛ УЛСЫН ХУУЛЬ" and the title beneath it on a
    // heuristic that is wrong for orders. Left to the register rather than guessed.
    title: null,
    meta: {},
    parser: 'legalinfo',
    unread: null,
  };
}
