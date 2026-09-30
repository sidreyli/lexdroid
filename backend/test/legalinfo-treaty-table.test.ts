/**
 * legalinfo.mn's international-treaty pages, laid out entirely in <tr> rows.
 *
 * The site's domestic laws print each line in a <p>, which is what `parseLegalinfo` was built
 * against. Its treaty pages -- the Paris Convention, the PCT, TRIPS, the MIGA convention -- print
 * every line of the whole page as a one-cell table row instead, and `paragraphsOf`'s `inTable`
 * flag, meant to keep an embedded tariff schedule's rows out of the count of numbered provisions,
 * caught every line of these pages the same way: `structural` (the lines `readBlock` looks for an
 * article or a point in) came out empty, so the Paris Convention -- with `ARTICLE`-matching
 * headings on 67 of its own lines -- fell to the "nothing numbered" branch and stored as one
 * 59,283-character section headed by its own first line, exactly as measured against
 * a Mongolian run's corpus (doc#988) on 30 September 2026.
 */
import { describe, expect, it } from 'vitest';
import { parseLegalinfo } from '../src/parse/legalinfo.js';

const page = (body: string) => `<!doctype html><html><body>
  <div class="law_content"><div class="toolbar"><p>Сонсох</p><p>Pdf</p><p>Word</p></div>
  ${body}</div></body></html>`;

/** Shaped like the Paris Convention's own page: every line a one-cell <tr>, not a <p>. */
const TREATY = page(`
  <table>
    <tr><td>МОНГОЛ УЛСЫН ОЛОН УЛСЫН ГЭРЭЭ</td></tr>
    <tr><td>АЖ YЙЛДВЭРИЙН ӨМЧИЙГ ХАМГААЛАХ ТУХАЙ ПАРИСЫН КОНВЕНЦ</td></tr>
    <tr><td>1 дүгээр зүйл</td></tr>
    <tr><td>Холбоо байгуулах; аж үйлдвэрийн өмчийн хамрах хүрээ</td></tr>
    <tr><td>(1) Энэ Конвенцийг соёрхон баталсан орнууд аж үйлдвэрийн өмчийг хамгаалах зорилгоор холбоо байгуулна.</td></tr>
    <tr><td>2 дугаар зүйл</td></tr>
    <tr><td>Холбооны гишүүн орны харьяатад зориулсан үндэсний горим</td></tr>
    <tr><td>(1) Холбооны аливаа гишүүн орны харьяат энэ Конвенцоор олгогдсон давуу эрхийг эдэлнэ.</td></tr>
    <tr><td>3 дугаар зүйл</td></tr>
    <tr><td>Зарим этгээдийг холбооны гишүүн орны харьяаттай адилтган авч үзнэ</td></tr>
  </table>
`);

/** An ordinary law with one small tariff schedule among its <p> provisions -- the case `inTable` exists for. */
const LAW_WITH_TARIFF = page(`
  <p>МОНГОЛ УЛСЫН ХУУЛЬ</p>
  <p>1 дүгээр зүйл.Хуулийн зорилт</p>
  <p>1.1.Энэ хуулийн зорилт нь татварын хувь хэмжээг тогтооход оршино.</p>
  <table>
    <tr><td>1.Автобензин</td><td>100</td></tr>
    <tr><td>2.Дизель түлш</td><td>80</td></tr>
  </table>
  <p>2 дугаар зүйл.Татвар ногдуулах журам</p>
  <p>2.1.Татварыг улирал бүр ногдуулна.</p>`);

describe('a treaty page laid out entirely in table rows', () => {
  const doc = parseLegalinfo(TREATY, 'https://legalinfo.mn/mn/detail?lawId=1219');

  it('is cut at its article headings instead of landing in one section', () => {
    expect(doc.sections.length).toBeGreaterThan(1);
  });

  it('finds every article the page has', () => {
    expect(doc.sections.map((s) => s.headingPath).some((h) => h.includes('1 дүгээр зүйл'))).toBe(true);
    expect(doc.sections.map((s) => s.headingPath).some((h) => h.includes('2 дугаар зүйл'))).toBe(true);
    expect(doc.sections.map((s) => s.headingPath).some((h) => h.includes('3 дугаар зүйл'))).toBe(true);
  });

  it('keeps each article\'s own text with it', () => {
    const two = doc.sections.find((s) => s.headingPath.includes('2 дугаар зүйл'));
    expect(two?.text).toContain('давуу эрхийг эдэлнэ');
  });
});

describe('an embedded tariff table among ordinary provisions', () => {
  // The fix for the treaty page must not stop a genuine schedule's rows from being excluded: a
  // small table sitting among mostly-<p> provisions is still read as a table, not as more articles.
  const doc = parseLegalinfo(LAW_WITH_TARIFF, 'https://legalinfo.mn/mn/detail?lawId=1');

  it('does not turn the tariff rows into provisions of their own', () => {
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2']);
  });

  it('keeps the tariff rows as text under whichever provision was open', () => {
    const all = doc.sections.map((s) => s.text).join('\n');
    expect(all).toContain('Автобензин');
  });
});
