import { describe, expect, it } from 'vitest';
import { eaeuRows, kindOfRow, wordFileOf, wordToHtml } from '../src/discover/eaeu.js';
import { parseIps } from '../src/parse/ips.js';

const BASE = 'https://docs.eaeunion.org';

const ROW = (section: string, name: string, title: string, href: string): string => `
  <div class="DocSearchResult_Item">
    <div class="DocSearchResult_Item__Date"> ${section} </div>
    <a target="_blank" href="${href}" class="DocSearchResult_Item__Link"> ${name} </a>
    <div class="DocSearchResult_Item__Text"> ${title} </div>
    <div class="DocSearchResult_Item__Dates">
      <div class="DocSearchResult_Item__DatesLeft"><div>Дата принятия документа: 21.09.2026</div></div>
      <div class="DocSearchResult_Item__DatesRight"><div>Дата вступления в силу: 03.10.2026</div></div>
    </div>
  </div>`;

const LISTING = `<div class="SearchResult_Heading__Counter"> Результаты: найдено <b>792</b> </div>
<div class="DocSearchResult_Items">
${ROW('Акты Евразийской экономической комиссии – Коллегия Евразийской экономической комиссии – Решения – 2026', 'Решение Коллегии ЕЭК № 124', 'О временном неприменении антидемпинговой меры', '/documents/463/10925/')}
${ROW('Официальные сообщения Евразийской экономической комиссии', 'Уведомление Департамента защиты внутреннего рынка', 'О публикации доклада', '/documents/166/10926/')}
</div>`;

describe('the Eurasian Economic Union legal portal', () => {
  it('reads each row of a listing, its dates and the total the page states', () => {
    const { rows, stated } = eaeuRows(LISTING, BASE);
    expect(stated).toBe(792);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: 'Решение Коллегии ЕЭК № 124',
      url: `${BASE}/documents/463/10925/`,
      adopted: '2026-09-21',
      inForceFrom: '2026-10-03',
    });
  });

  it('keeps the Union’s acts and sets aside notices, judgments and internal orders', () => {
    const act = (section: string, name: string) => kindOfRow({ section, name });
    expect(act('Акты Евразийской экономической комиссии – Коллегия – Решения – 2026', 'Решение Коллегии ЕЭК № 124')).toEqual({ kind: 'regulation' });
    expect(act('Международные договоры', 'Договор о Евразийском экономическом союзе')).toEqual({ kind: 'act' });
    expect(act('Акты Евразийской экономической комиссии – Коллегия – Рекомендации', 'Рекомендация Коллегии ЕЭК № 21')).toEqual({ kind: 'guideline' });
    expect(act('Официальные сообщения Евразийской экономической комиссии', 'Уведомление Департамента')).toEqual({ setAside: 'notice-of-an-act' });
    expect(act('Акты Евразийской экономической комиссии – Коллегия – Распоряжения', 'Распоряжение Коллегии ЕЭК № 145')).toEqual({ setAside: 'internal-order' });
    expect(act('Акты Суда Евразийского экономического союза', 'Решение Суда ЕАЭС')).toEqual({ setAside: 'court-judgment' });
  });

  it('finds the Word file a document page offers beside its scan', () => {
    const page = '<a href="/upload/iblock/008/x/Reshenie-122.pdf">Скачать</a><a href="/upload/iblock/4fc/y/Reshenie-122.docx">Скачать</a>';
    expect(wordFileOf(page, `${BASE}/documents/463/10923/`)).toBe(`${BASE}/upload/iblock/4fc/y/Reshenie-122.docx`);
    expect(wordFileOf('<a href="/x.pdf">Скачать</a>', BASE)).toBeNull();
  });

  it('reads a Word file as numbered points, a superscript kept as one', () => {
    const p = (runs: string) => `<w:p><w:pPr><w:jc w:val="both"/></w:pPr>${runs}</w:p>`;
    const r = (t: string, sup = false) => `<w:r>${sup ? '<w:rPr><w:vertAlign w:val="superscript"/></w:rPr>' : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
    const xml = `<w:document><w:body>
      ${p(r('РЕШЕНИЕ'))}
      ${p(r('1. Внести в классификатор льгот &quot;кодом АК&quot;;'))}
      ${p(r('2') + r('1', true) + r('. Товары для личного пользования &lt;1&gt;'))}
      ${p(r('2. Настоящее Решение вступает в силу.'))}
    </w:body></w:document>`;
    const html = wordToHtml(xml);
    expect(html).toContain('<p>1. Внести в классификатор льгот "кодом АК";</p>');
    expect(html).toContain('<sup>1</sup>');
    const parsed = parseIps(html, `${BASE}/x.docx`);
    expect(parsed.sections.map((s) => s.label)).toEqual(['1', '2¹', '2']);
    expect(parsed.sections[1]!.text).toContain('Товары для личного пользования <1>');
  });
});
