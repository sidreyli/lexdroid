/**
 * Reading a Mongolian instrument, and the two silent failures that came before this parser.
 *
 * Measured on three real documents from legalinfo.mn before it existed:
 *
 *   Anti-Corruption Law          1 section of 112,095 characters
 *   its transitional law         1 section, beginning with a phone number
 *   the Constitution           199 "sections", one of them 85 KB, several in English
 *
 * Both failures are invisible downstream. A section is the unit retrieval ranks and the reader
 * reads, so a document that arrives as one blob is a document the cell searched and could not see
 * into -- and the cell then reports that it found no restriction. Nothing throws and no count is
 * short.
 *
 * The causes were separate. The generic path never found the instrument, taking the whole page
 * including the site's phone number, email and login links; and it could not see where a
 * provision began, because `PROVISION_LINE` wants a leading number, a delimiter and a space,
 * while a Mongolian article reads "1 дүгээр зүйл.Хуулийн зорилт" -- number, two words, full stop,
 * no space.
 */
import { describe, expect, it } from 'vitest';
import { parseLegalinfo } from '../src/parse/legalinfo.js';

const page = (body: string) => `<!doctype html><html><body>
  <div class="tw-topbar-right"><p>+(976)-11-323317</p><p>info@legalinstitute.mn</p></div>
  <div class="law_content"><div class="toolbar"><p>Сонсох</p><p>Pdf</p><p>Word</p></div>
  ${body}</div></body></html>`;

/** An ordinary Law: numbered articles, sub-clauses beneath them, chapters above. */
const LAW = page(`
  <p>МОНГОЛ УЛСЫН ХУУЛЬ</p>
  <p>2006 оны 7 дугаар сарын 6-ны өдөр</p>
  <p>АВЛИГЫН ЭСРЭГ ХУУЛЬ</p>
  <p>НЭГДҮГЭЭР БҮЛЭГ</p>
  <p>НИЙТЛЭГ ҮНДЭСЛЭЛ</p>
  <p>1 дүгээр зүйл.Хуулийн зорилт</p>
  <p>1.1.Энэ хуулийн зорилт нь авлигатай тэмцэх үйл ажиллагааг зохицуулахад оршино.</p>
  <p>2 дугаар зүйл.Хууль тогтоомж</p>
  <p>2.1.Авлигын эсрэг хууль тогтоомж нь Үндсэн хуулиас бүрдэнэ.</p>`);

/** The Constitution: the ordinal is spelled out, and past ten it is two words. */
const CONSTITUTION = page(`
  <p>МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬ</p>
  <p>Нэгдүгээр зүйл.</p>
  <p>1.Монгол Улс бол тусгаар тогтносон, бүрэн эрхт улс мөн.</p>
  <p>Аравдугаар зүйл.</p>
  <p>1.Монгол Улс олон улсын эрх зүйн нийтээр хүлээн зөвшөөрсөн хэм хэмжээг баримтална.</p>
  <p>Арван нэгдүгээр зүйл.</p>
  <p>1.Эх орноо хамгаалах нь төрийн үүрэг мөн.</p>
  <p>Хорин гуравдугаар зүйл.</p>
  <p>1.Улсын Их Хурлын гишүүн бол ард түмний элч мөн.</p>`);

/** A ministerial order: no articles at all, just numbered paragraphs. */
const ORDER = page(`
  <p>ХӨДӨЛМӨРИЙН САЙДЫН ТУШААЛ</p>
  <p>Дугаар А/123</p>
  <p>1. Хөнгөн ажлын төрлийг хавсралтаар баталсугай.</p>
  <p>2.Уг тушаалын биелэлтэд хяналт тавьж ажиллахыг даалгасугай.</p>`);

describe('a Mongolian instrument', () => {
  it('is read from the content block, not from the page around it', () => {
    const doc = parseLegalinfo(LAW, 'https://legalinfo.mn/mn/detail?lawId=8928');
    expect(doc.text).not.toContain('976)-11-323317');
    expect(doc.text).not.toContain('legalinstitute.mn');
    expect(doc.text).not.toContain('Сонсох');
    expect(doc.text).toContain('Авлигын эсрэг хууль тогтоомж');
  });

  it('cites an article by its number, with the chapter above it', () => {
    const doc = parseLegalinfo(LAW, 'u');
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections[0]!.label).toBe('1');
    expect(doc.sections[0]!.headingPath).toBe('НЭГДҮГЭЭР БҮЛЭГ НИЙТЛЭГ ҮНДЭСЛЭЛ > 1 дүгээр зүйл.Хуулийн зорилт');
  });

  it('keeps an article and the sub-clauses beneath it in one section', () => {
    // 1.1 is not a provision of its own; it is part of article 1, and a reader asked whether
    // article 1 states a duty needs the words that state it.
    const doc = parseLegalinfo(LAW, 'u');
    expect(doc.sections[0]!.text).toContain('1 дүгээр зүйл.Хуулийн зорилт');
    expect(doc.sections[0]!.text).toContain('1.1.Энэ хуулийн зорилт');
  });

  it('reads a spelled-out ordinal, including the two-word compounds past ten', () => {
    // "Арван нэгдүгээр" is ten-one-th, article 11; "Хорин гуравдугаар" is article 23. A pattern
    // anchored on a single token finds the first ten articles of the Constitution and then stops
    // -- measured, 16 against the 70 it has.
    const doc = parseLegalinfo(CONSTITUTION, 'u');
    expect(doc.sections.map((s) => s.label)).toEqual([
      'Нэгдүгээр',
      'Аравдугаар',
      'Арван нэгдүгээр',
      'Хорин гуравдугаар',
    ]);
  });

  it('does not take the ordinary noun "зүйл" for an article heading', () => {
    // The Constitution's article 7 says "соёлын дурсгалт зүйл" -- cultural artefacts. The word
    // means a thing; only the ordinal in front of it makes it an article.
    const doc = parseLegalinfo(page('<p>Нэгдүгээр зүйл.</p><p>1.Соёлын дурсгалт зүйл хамгаалагдана.</p>'), 'u');
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0]!.text).toContain('Соёлын дурсгалт зүйл');
  });

  it('falls back to numbered paragraphs where an instrument has no articles', () => {
    // A ministerial order is four numbered paragraphs, and the second of them writes "2.Уг" with
    // no space after the stop -- which the generic pattern requires.
    const doc = parseLegalinfo(ORDER, 'u');
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2']);
    expect(doc.sections[1]!.text).toContain('хяналт тавьж');
  });

  it('holds the offset invariant every citation rests on', () => {
    for (const html of [LAW, CONSTITUTION, ORDER]) {
      const doc = parseLegalinfo(html, 'u');
      for (const s of doc.sections) {
        expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
      }
    }
  });

  it('records a page with no content block as unread rather than as an empty document', () => {
    const doc = parseLegalinfo('<html><body><div>nothing</div></body></html>', 'u');
    expect(doc.sections).toEqual([]);
    expect(doc.unread?.reason).toBe('empty');
  });
});
