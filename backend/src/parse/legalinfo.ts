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
 * it. So the Anti-Corruption Law parsed to a single section of 112 KB. A section is the unit
 * retrieval ranks and the reader reads, so one blob means the cell searched a document it could
 * not see into and reported no restriction. The Constitution fared worse for being noisier: 199
 * "sections" split on bare sub-clause numbers, one of them 85 KB, several in the English
 * translation the same page carries.
 *
 * What this reads instead is the structure the drafter used: chapters (БҮЛЭГ) for the heading
 * path, articles (N дугаар зүйл) as the citable unit, and for a short instrument that has no
 * articles -- a ministerial order is typically four numbered paragraphs -- the numbered
 * paragraphs themselves.
 */
import * as cheerio from 'cheerio';
import { SectionBuilder, type ParsedDocument } from './types.js';

/** Where the instrument's own text lives, most specific first. */
const CONTENT = ['.law_content', '.main-huuliin-content', '.maincontenter'];

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
 * The full stop that follows carries no space, which is what defeated `PROVISION_LINE`.
 *
 * The optional leading word is what makes the Constitution parse at all. Mongolian builds a
 * compound ordinal from two words -- "Арван нэгдүгээр зүйл" is ten-one-th, article 11, and
 * "Хорин гуравдугаар зүйл" is article 23 -- so a pattern anchored on a single token finds the
 * first ten articles and then stops. Measured on the Constitution: 16 headings without it, 70
 * with it, and 70 is the number of articles it has.
 */
const ARTICLE = /^((?:\S+\s+)?\S*(?:дугаар|дүгээр))\s+зүйл/iu;

/** The citable label: the numeral where the drafter used one, the ordinal word where not. */
function articleLabel(matched: string): string {
  return /^\d+/.exec(matched)?.[0] ?? matched.trim();
}

/**
 * "НЭГДҮГЭЭР БҮЛЭГ" -- chapter one. Its name is the paragraph after it.
 *
 * No `\b` anywhere in this file. JavaScript's word boundary is defined against `\w`, which is
 * ASCII, so it never matches beside a Cyrillic letter -- `/\bБҮЛЭГ/.test('НЭГДҮГЭЭР БҮЛЭГ')` is
 * false. It fails silently and in the direction that looks like working code: the first draft of
 * this parser detected no chapters at all on the real Anti-Corruption Law and produced heading
 * paths with the chapter missing, which reads exactly like a document that has no chapters.
 */
const CHAPTER = /^[^.]{0,48}БҮЛЭГ\s*$/iu;

/** "1." or "2.Уг тушаалын" -- a numbered paragraph, with or without the space. */
const NUMBERED = /^(\d+)\s*[.)]/u;

/** The toolbar the page puts above the text: listen, Pdf, Word, print, share. */
const TOOLBAR = /^(?:Сонсох|Pdf|Word|Хэвлэх|Хуваалцах|Текст томруулах|A)(?:[\s/]|$)/iu;

/** A paragraph that is furniture rather than law. */
function isFurniture(text: string): boolean {
  return text.length < 2 || TOOLBAR.test(text) || /^[+0-9()\s-]{7,}$/.test(text) || /@/.test(text);
}

export function parseLegalinfo(html: string, url: string): ParsedDocument {
  const $ = cheerio.load(html);
  const main = CONTENT.map((s) => $(s).first()).find((el) => el.length > 0) ?? $('body');

  const paragraphs = main
    .find('p')
    .toArray()
    .map((p) => $(p).text().replace(/\s+/g, ' ').trim())
    .filter((t) => t && !isFurniture(t));

  if (paragraphs.length === 0) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      title: null,
      meta: {},
      parser: 'legalinfo',
      unread: { reason: 'empty', detail: `${url} has no paragraphs inside its content block.` },
    };
  }

  const builder = new SectionBuilder();
  let chapter: string | null = null;
  /** The article being accumulated, or null while we are still in the front matter. */
  let open: { label: string | null; heading: string; body: string[] } | null = null;

  const close = (): void => {
    if (!open) return;
    builder.add({
      headingPath: [chapter, open.heading].filter(Boolean).join(' > '),
      label: open.label,
      text: [open.heading, ...open.body].join('\n'),
      page: null,
      // Left to the export's own detection, which reads the provision's text against the
      // economy's declared languages -- see languageOf in src/export/index.ts. Guessing per
      // paragraph here would be a second, weaker answer to a question already answered.
      language: null,
      repealed: /хүчингүй болсон|хүчингүй болгосон/iu.test(open.body.join(' ').slice(0, 300)),
      anchor: null,
    });
    open = null;
  };

  const articles = paragraphs.filter((t) => ARTICLE.test(t)).length;
  /** A short instrument has no articles; its numbered paragraphs are the provisions. */
  const unit = articles > 0 ? ARTICLE : NUMBERED;

  for (let i = 0; i < paragraphs.length; i += 1) {
    const text = paragraphs[i]!;

    // A chapter heading names what follows and is not itself a provision. Its own name sits in
    // the next paragraph: "НЭГДҮГЭЭР БҮЛЭГ" then "НИЙТЛЭГ ҮНДЭСЛЭЛ".
    if (articles > 0 && CHAPTER.test(text)) {
      close();
      const name = paragraphs[i + 1];
      if (name && !unit.test(name) && !CHAPTER.test(name)) {
        chapter = `${text} ${name}`.replace(/\s+/g, ' ').trim();
        i += 1;
      } else {
        chapter = text;
      }
      continue;
    }

    const match = unit.exec(text);
    if (match) {
      close();
      const raw = match[1] ?? '';
      open = { label: unit === ARTICLE ? articleLabel(raw) : raw || null, heading: text, body: [] };
      continue;
    }

    // Before the first provision this is the front matter -- the instrument type, its date, its
    // number, its title. Kept in the document text, because a citation offset has to index into
    // the whole of what was read, but not a citable section of its own.
    if (open) open.body.push(text);
    else builder.addProse(text);
  }
  close();

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
