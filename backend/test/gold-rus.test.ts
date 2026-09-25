/**
 * Russia, read from real IPS pages and checked against what the pages themselves say.
 *
 * Every fixture in test/fixtures/rus is a pravo.gov.ru/proxy/ips response kept as the bytes the
 * system served -- windows-1251 -- and decoded here through decodeBody, the same path a fetched
 * page takes. The one exception is the Code of Administrative Offences: the system's viewer cuts
 * it off at 747,740 bytes, so the adapter reads it from the system's own export, and the fixture
 * is that export's text cut at the start of Chapter 5, to keep the repository small.
 *
 * Expectations come from the source. The article count is the number of `<p class="H">Статья`
 * headings on the page; superscripts are the `span.W9` the page wraps them in; repeals are the
 * system's own "(Утратил силу ...)" notes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeBody } from '../src/fetch/decode.js';
import { htmlFromMhtml, truncated } from '../src/discover/ips.js';
import { parseIps } from '../src/parse/ips.js';
import type { ParsedDocument } from '../src/parse/types.js';

const FIXTURES = join(__dirname, 'fixtures', 'rus');
const source = (name: string): string =>
  decodeBody({ body: readFileSync(join(FIXTURES, `${name}.html`)), mediaType: 'text/html', charset: null });
const read = (name: string): ParsedDocument => parseIps(source(name), `fixture:${name}`);
const section = (doc: ParsedDocument, label: string, annex = false) => {
  const s = doc.sections.find((x) => x.label === label && x.headingPath.startsWith('Приложение') === annex);
  if (!s) throw new Error(`no section labelled ${label}`);
  return s;
};
const range = (a: number, b: number): string[] => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));

const ALL = ['decree-763', 'law-152-fz', 'law-149-fz', 'government-resolution-1119', 'code-administrative-offences-section-i-ch1-4'];

describe('every Russian fixture', () => {
  it.each(ALL)('%s decodes from windows-1251, holds the offset invariant, and has unique labels', (name) => {
    const doc = read(name);
    expect(doc.unread).toBeNull();
    expect((doc.text.match(/[Ѐ-ӿ]/g) ?? []).length).toBeGreaterThan(1000);
    for (const s of doc.sections) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
    const seen = new Map<string, string[]>();
    for (const s of doc.sections) {
      if (s.label === null) continue;
      const container = s.headingPath.startsWith('Приложение') ? s.headingPath.split(' > ')[0]! : '';
      const list = seen.get(container) ?? [];
      expect(list, `${s.label} twice in ${container || 'the instrument'}`).not.toContain(s.label);
      seen.set(container, [...list, s.label]);
    }
  });

  it.each(ALL)('%s carries none of the viewer\'s furniture', (name) => {
    const doc = read(name);
    for (const junk of ['Complex', '@page', 'mso-', 'MicrosoftInternetExplorer4', 'Страница №']) expect(doc.text).not.toContain(junk);
  });

  it.each(ALL)('%s has one section for every article heading the page marks', (name) => {
    const html = source(name);
    const headings = (html.match(/<p class="?H"?[^>]*>(?:\s|<[^>]+>)*Статья(?:\s|&nbsp;)/g) ?? []).length;
    const doc = read(name);
    expect(doc.sections.filter((s) => /^Статья\s/.test(s.headingPath.split(' > ').at(-1)!)).length).toBe(headings);
  });

  it.each(ALL)('%s keeps every line of its text', (name) => {
    const html = source(name);
    const flat = read(name).text.replace(/\s+/g, ' ');
    const body = html.slice(html.search(/<p[\s>]/));
    for (const m of body.matchAll(/>([^<>]*[\u0400-\u04ff]{2}[^<>]*)</g)) {
      const t = m[1]!.replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
      if (!t || t.includes('&') || t.startsWith('<!--')) continue;
      expect(flat, t).toContain(t);
    }
  });
});

describe('a Federal law: 152-ФЗ On personal data', () => {
  const doc = read('law-152-fz');

  it('has its 30 articles, the inserted ones cited by their superscripts', () => {
    expect(doc.sections.map((s) => s.label)).toEqual([
      ...range(1, 10), '10¹', '11', '12', '13', '13¹', ...range(14, 18), '18¹', '19', '20', '21', '22', '22¹', '23', '23¹', '24', '25',
    ]);
  });

  it('files each article under its chapter', () => {
    expect(section(doc, '1').headingPath).toBe('Глава 1. Общие положения > Статья 1. Сфера действия настоящего Федерального закона');
    expect(section(doc, '18¹').headingPath).toMatch(/^Глава 4\. Обязанности оператора > Статья 18¹\. /);
    expect(section(doc, '25').headingPath).toMatch(/^Глава 6\. Заключительные положения > /);
  });

  it('keeps an article\'s parts inside it, a repealed part without repealing the article', () => {
    const a25 = section(doc, '25');
    expect(a25.text).toContain('2¹. Операторы, которые осуществляли обработку персональных данных до 1 июля 2011 года');
    expect(a25.text).toContain('3. (Часть утратила силу - Федеральный закон от 25.07.2011 № 261-ФЗ)');
    expect(a25.repealed).toBe(false);
  });

  it('keeps the system\'s edition notes with the article they describe', () => {
    expect(section(doc, '10¹').text).toContain('(Дополнение статьей - Федеральный закон от 30.12.2020 № 519-ФЗ)');
  });

  it('keeps the signature out of the last article, and in the text', () => {
    expect(section(doc, '25').text).not.toContain('Путин');
    expect(doc.text).toContain('Президент Российской Федерации В.Путин');
    expect(doc.title).toBe('ФЕДЕРАЛЬНЫЙ ЗАКОН О персональных данных');
  });
});

describe('a much-amended law: 149-ФЗ On information', () => {
  it('cites the hyphenated insertions 10²⁻¹ and 15³⁻² apart from 10² and 15³', () => {
    const labels = read('law-149-fz').sections.map((s) => s.label);
    expect(labels.slice(9, 19)).toEqual(['10', '10¹', '10²', '10²⁻¹', '10²⁻²', '10³', '10⁴', '10⁵', '10⁶', '10⁷']);
    expect(labels).toContain('15³⁻²');
    expect(labels).toContain('15⁶⁻¹');
  });
});

describe('a Presidential decree: 763 on publication of acts', () => {
  const doc = read('decree-763');

  it('is cited by its points, with the inserted point 2¹ repealed as the system says', () => {
    expect(doc.sections.filter((s) => !s.headingPath.startsWith('Приложение')).map((s) => s.label)).toEqual([
      '1', '2', '2¹', ...range(3, 14),
    ]);
    expect(doc.sections.filter((s) => s.repealed).map((s) => s.label)).toEqual(['2¹']);
  });

  it('keeps a point\'s unnumbered sub-paragraphs inside it', () => {
    expect(section(doc, '13').text).toContain('в месячный срок привести свои нормативные акты в соответствие с настоящим Указом.');
  });

  it('reads its annex as a block of its own, named by its title and numbered afresh', () => {
    const annex = doc.sections.filter((s) => s.headingPath.startsWith('Приложение'));
    expect(annex.map((s) => s.label)).toEqual(range(1, 5));
    expect(annex[0]!.headingPath).toMatch(/^Приложение: ПЕРЕЧЕНЬ актов Президента Российской Федерации, признанных утратившими силу > 1\. /);
    expect(section(doc, '14').text).not.toContain('Ельцин');
  });
});

describe('a Government resolution that approves requirements: 1119', () => {
  const doc = read('government-resolution-1119');

  it('keeps its two operative points, and the requirements it approves as their own block', () => {
    expect(doc.sections.filter((s) => !s.headingPath.startsWith('Приложение')).map((s) => s.label)).toEqual(['1', '2']);
    const annex = doc.sections.filter((s) => s.headingPath.startsWith('Приложение'));
    expect(annex.map((s) => s.label)).toEqual(range(1, 17));
    expect(annex[0]!.headingPath).toMatch(/^Приложение: ТРЕБОВАНИЯ к защите персональных данных при их обработке в информационных системах персональных данных/);
  });

  it('does not repeal a point for repealing an older resolution', () => {
    expect(section(doc, '2').text).toMatch(/^2\. Признать утратившим силу постановление/);
    expect(section(doc, '2').repealed).toBe(false);
  });
});

describe('a Code: the Code of Administrative Offences, section I', () => {
  const doc = read('code-administrative-offences-section-i-ch1-4');

  it('files each article under its section and then its chapter', () => {
    expect(section(doc, '3.6').headingPath).toBe('РАЗДЕЛ I. ОБЩИЕ ПОЛОЖЕНИЯ > ГЛАВА 3. АДМИНИСТРАТИВНОЕ НАКАЗАНИЕ > Статья 3.6.');
    expect(section(doc, '1.1').headingPath).toMatch(/^РАЗДЕЛ I\. ОБЩИЕ ПОЛОЖЕНИЯ > ГЛАВА 1\. ЗАДАЧИ И ПРИНЦИПЫ /);
  });

  it('repeals the article whose heading stands alone above the system\'s repeal note', () => {
    expect(doc.sections.filter((s) => s.repealed).map((s) => s.label)).toEqual(['3.6']);
    expect(section(doc, '3.6').text).toContain('(Статья утратила силу - Федеральный закон от 28.12.2010 № 398-ФЗ)');
  });

  it('cites decimal articles with their insertions: 1.3¹, 2.6², 4.1²', () => {
    const labels = doc.sections.map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(['1.3¹', '2.6¹', '2.6²', '2.9¹', '4.1¹', '4.1²']));
    expect(labels.at(-1)).toBe('4.8');
  });
});

describe('reading a long document whole', () => {
  it('knows a page the viewer cut off from one it served whole', () => {
    expect(truncated(source('law-152-fz'))).toBe(false);
    // The Code of Administrative Offences as the viewer serves it: cut inside a link.
    const cut = '<p><span class="mark">(Дополнение статьей - Федеральный закон <a class="doclink" href="?docbody=&nd=102362472" target="contents"> </div> </div> </body> </html>';
    expect(truncated(cut)).toBe(true);
  });

  it('takes the HTML out of the system\'s export archive', () => {
    const archive = Buffer.from(
      [
        'MIME-Version: 1.0',
        'Content-Type: multipart/related; boundary="----=_NextPart_01CAD650.0093E2A0"',
        '',
        '------=_NextPart_01CAD650.0093E2A0',
        'Content-Location: file:///C:/B1334631/001.htm',
        'Content-Transfer-Encoding: quoted-printable',
        'Content-Type: text/html; charset="windows-1251"',
        '',
        '<p class=3D"H">=D1=F2=E0=F2=FC=FF 1.1.</p>',
        '------=_NextPart_01CAD650.0093E2A0--',
      ].join('\r\n'),
      'latin1',
    );
    const part = htmlFromMhtml(archive)!;
    expect(part.charset).toBe('windows-1251');
    expect(decodeBody({ body: part.html, mediaType: 'text/html', charset: part.charset })).toBe('<p class="H">Статья 1.1.</p>');
  });
});
