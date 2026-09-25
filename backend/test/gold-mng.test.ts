/**
 * Mongolia, read from real pages and checked against what the pages themselves say.
 *
 * Every fixture in test/fixtures/mng is a legalinfo.mn page as fetched, trimmed to its content
 * block. The expectations are not the parser's output written down: they come from the source --
 * the site marks each article heading as its own block (`data-pp="1"`), so a law's article count
 * is on the page; the struck-through text and the repeal notes are the site's; the points of a
 * resolution were read off the page.
 *
 * What these guard, each found on a document an earlier parser was believed to read correctly:
 *
 *  - the Anti-Corruption Law's inserted articles 2¹ and 32¹, flattened to "21" and "321" so two
 *    sections were labelled 21;
 *  - its provisions 18.2.2 and 18.4.16, lost because the site nests a <div> inside a <p>;
 *  - the Constitution's article 19¹, which makes it 71 articles, not 70;
 *  - a resolution's points 1.1 and 1.2 stored as three sections all labelled "1";
 *  - article 6 of the Auto Transport Law, in force, excluded as repealed because its clause 6.1.1
 *    was; and a tariff resolution's point that repeals an older resolution, excluded likewise;
 *  - chapter headings missing from the stored text, and signatures read as part of the last point.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLegalinfo } from '../src/parse/legalinfo.js';
import type { ParsedDocument } from '../src/parse/types.js';

const FIXTURES = join(__dirname, 'fixtures', 'mng');
const read = (name: string): ParsedDocument =>
  parseLegalinfo(readFileSync(join(FIXTURES, `${name}.html`), 'utf8'), `fixture:${name}`);
const range = (a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const section = (doc: ParsedDocument, label: string) => {
  const s = doc.sections.find((x) => x.label === label);
  if (!s) throw new Error(`no section labelled ${label}`);
  return s;
};

const ALL = [
  'anti-corruption-law',
  'constitution',
  'auto-transport-law',
  'fuel-excise-law',
  'government-resolution-137',
  'presidential-decree-21',
  'tariff-resolution-table',
  'parliament-resolution-07',
  'citizens-council-procedure-annex',
];

describe('every Mongolian fixture', () => {
  it.each(ALL)('%s holds the offset invariant, has unique labels, and carries no page furniture', (name) => {
    const doc = read(name);
    expect(doc.unread).toBeNull();
    expect(doc.sections.length).toBeGreaterThan(0);
    for (const s of doc.sections) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    const labels = doc.sections.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const junk of ['976)-11-323317', 'legalinstitute.mn', 'Сонсох', 'Хуваалцах', 'Нэвтрэх', '​']) {
      expect(doc.text).not.toContain(junk);
    }
  });

  it.each(ALL)('%s keeps every line of its content block', (name) => {
    // Nothing the drafter wrote may be missing from the stored text: a line that is not there
    // cannot be retrieved, read or cited.
    const html = readFileSync(join(FIXTURES, `${name}.html`), 'utf8');
    const doc = read(name);
    const flat = doc.text.replace(/\s+/g, ' ');
    const block = html.slice(html.indexOf('law_content'));
    for (const m of block.matchAll(/>([^<>]*[Ѐ-ӿ][^<>]*)</g)) {
      const t = m[1]!.replace(/&nbsp;/g, ' ').replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
      if (!t || /^(Сонсох|Хэвлэх|Хуваалцах)/.test(t) || t.includes('&')) continue;
      expect(flat, t).toContain(t);
    }
  });
});

describe('an ordinary Law: the Anti-Corruption Law', () => {
  const doc = read('anti-corruption-law');

  it('has the 37 articles the page marks, inserted ones cited as 2¹ and 32¹', () => {
    expect(doc.sections.map((s) => s.label)).toEqual([
      '1', '2', '2¹', ...range(3, 32), '32¹', '33', '34', '35',
    ]);
  });

  it('files each article under its chapter, in the chapter\'s own words', () => {
    expect(section(doc, '2¹').headingPath).toBe(
      'НЭГДҮГЭЭР БҮЛЭГ НИЙТЛЭГ ҮНДЭСЛЭЛ > 2¹ дүгээр зүйл.Авлигатай тэмцэх үндэсний хөтөлбөр',
    );
    expect(section(doc, '15').headingPath).toMatch(/^ДӨРӨВДҮГЭЭР БҮЛЭГ АВЛИГАТАЙ ТЭМЦЭХ БАЙГУУЛЛАГА, ТҮҮНИЙ БҮРЭН ЭРХ > /);
    expect(section(doc, '33').headingPath).toMatch(/^ЗУРГАДУГААР БҮЛЭГ БУСАД ЗҮЙЛ > /);
  });

  it('keeps the chapter headings in the stored text', () => {
    expect(doc.text).toContain('НЭГДҮГЭЭР БҮЛЭГ');
    expect(doc.text).toContain('ТАВДУГААР БҮЛЭГ');
  });

  it('reads the provisions the site nests a <div> inside a <p> for', () => {
    expect(section(doc, '18').text).toContain('18.2.2.мэдүүлэг гаргагчийн ирүүлсэн хүсэлтийн дагуу');
    expect(section(doc, '18').text).toContain('18.4.16.хөрөнгө, орлогын мэдүүлэгтэй холбоотой');
  });

  it('keeps a repealed point beside the site\'s note that repealed it, without repealing the article', () => {
    const a29 = section(doc, '29');
    expect(a29.text).toContain('29.3.Авлигатай тэмцэх газрын тухайн жилийн төсвийг');
    expect(a29.text).toContain('2015 оны 11 дүгээр сарын 10-ны өдрийн хуулиар хүчингүй болсонд тооцсон');
    expect(a29.repealed).toBe(false);
  });
});

describe('the Constitution', () => {
  const doc = read('constitution');

  it('has 71 articles, spelled-out ordinals, including the inserted 19¹', () => {
    const labels = doc.sections.map((s) => s.label);
    expect(labels).toHaveLength(71);
    expect(labels.slice(0, 3)).toEqual(['Нэгдүгээр', 'Хоёрдугаар', 'Гуравдугаар']);
    expect(labels.slice(17, 21)).toEqual(['Арван наймдугаар', 'Арван есдүгээр', 'Арван ес¹дүгээр', 'Хорьдугаар']);
    expect(labels.at(-1)).toBe('Далдугаар');
  });

  it('files articles under its six chapters', () => {
    const chapters = new Set(doc.sections.map((s) => s.headingPath.split(' > ')[0]));
    expect([...chapters]).toEqual([
      'НЭГДҮГЭЭР БҮЛЭГ МОНГОЛ УЛСЫН БҮРЭН ЭРХТ БАЙДАЛ',
      'ХОЁРДУГААР БҮЛЭГ ХҮНИЙ ЭРХ, ЭРХ ЧӨЛӨӨ',
      'ГУРАВДУГААР БҮЛЭГ МОНГОЛ УЛСЫН ТӨРИЙН БАЙГУУЛАЛ',
      'ДӨРӨВДҮГЭЭР БҮЛЭГ МОНГОЛ УЛСЫН ЗАСАГ ЗАХИРГАА, НУТАГ ДЭВСГЭРИЙН НЭГЖ, ТҮҮНИЙ УДИРДЛАГА',
      'ТАВДУГААР БҮЛЭГ МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛИЙН ЦЭЦ',
      'ЗУРГАДУГААР БҮЛЭГ МОНГОЛ УЛСЫН ҮНДСЭН ХУУЛЬД НЭМЭЛТ, ӨӨРЧЛӨЛТ ОРУУЛАХ',
    ]);
  });
});

describe('a much-amended Law: the Auto Transport Law', () => {
  const doc = read('auto-transport-law');

  it('cites its five inserted articles by their superscripts', () => {
    expect(doc.sections.map((s) => s.label)).toEqual([
      ...range(1, 6), '6¹', '7', '8', '9', '9¹', ...range(10, 17), '17¹', '18', '19', '19¹', '19²', ...range(20, 23),
    ]);
  });

  it('repeals the article the site says was repealed, and not the one that only lost a clause', () => {
    expect(doc.sections.filter((s) => s.repealed).map((s) => s.label)).toEqual(['9¹']);
    expect(section(doc, '6').text).toContain('6.1.1. /Энэ заалтыг 2008 оны 12 дугаар сарын 19-ний өдрийн хуулиар хүчингүй болсонд тооцсон/');
  });
});

describe('a Law with a rate table: the fuel excise law', () => {
  const doc = read('fuel-excise-law');

  it('has its nine articles, and the table stays inside the article that sets the rates', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(range(1, 9));
    const a6 = section(doc, '6');
    expect(a6.text).toContain('1.Автобензин');
    expect(a6.text).toContain('20350');
  });
});

describe('resolutions, decrees and orders: numbered points', () => {
  it('keeps sub-points inside the point they belong to', () => {
    // Government resolution 137: points 1 and 2, with 1.1 and 1.2 beneath point 1.
    const doc = read('government-resolution-137');
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2']);
    expect(section(doc, '1').text).toContain('1.1.нийслэл Улаанбаатар хотын');
    expect(section(doc, '1').text).toContain('1.2.Ногоон нуурын 1008 айлын');
  });

  it('leaves the preamble and the signatures out of every point, and keeps both in the text', () => {
    const doc = read('government-resolution-137');
    expect(section(doc, '1').text.startsWith('1.Бүгд Найрамдах Хятад Ард Улсын')).toBe(true);
    expect(section(doc, '2').text).not.toContain('ЕРӨНХИЙ САЙД');
    expect(doc.text).toContain('МОНГОЛ УЛСЫН ЕРӨНХИЙ САЙД Г.ЗАНДАНШАТАР');
    expect(doc.text).toContain('ТОГТООХ нь:');
  });

  it('reads a presidential decree and a parliament resolution by their points', () => {
    expect(read('presidential-decree-21').sections.map((s) => s.label)).toEqual(['1', '2']);
    expect(read('parliament-resolution-07').sections.map((s) => s.label)).toEqual(['1', '2']);
  });

  it('does not repeal a point for repealing something else', () => {
    // "...тогтоолыг хүчингүй болсонд тооцсугай" -- this point repeals an older resolution; it is
    // itself the operative law.
    const doc = read('presidential-decree-21');
    expect(section(doc, '2').text).toContain('хүчингүй болсонд тооцсугай');
    expect(section(doc, '2').repealed).toBe(false);
  });

  it('closes the last point before the signatories', () => {
    const doc = read('tariff-resolution-table');
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2', '3']);
    expect(section(doc, '3').text).not.toContain('ДАРГА');
    expect(doc.text).toContain('Ш.МАНДАХНАР');
  });
});

describe('a procedure (журам) published as an annex', () => {
  const doc = read('citizens-council-procedure-annex');

  it('is cited at its points, 1.1 to 6.9, the way the procedure cites itself', () => {
    expect(doc.sections.map((s) => s.label)).toEqual([
      '1.1', '1.2', '1.3', '2.1', '2.2', '2.3', '2.4', '3.1', '3.2', '4.1', '5.1',
      '6.1', '6.2', '6.3', '6.4', '6.5', '6.6', '6.7', '6.8', '6.9',
    ]);
  });

  it('files each point under its part, named with a cardinal word', () => {
    expect(section(doc, '1.1').headingPath).toMatch(/^Нэг\.Нийтлэг үндэслэл > 1\.1\./);
    expect(section(doc, '6.9').headingPath).toMatch(/^Зургаа\.Зөвлөлийн үйл ажиллагааны зохион байгуулалт > 6\.9\./);
  });
});
