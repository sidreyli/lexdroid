/**
 * A Mongolian instrument the site shows as a scan.
 *
 * legalinfo.mn serves a few instruments as images pasted into the page with no text beside them:
 * a 2013 forestry procedure as six inline base64 PNGs, a 2017 Finance Minister's order as one
 * JPEG linked from /uploads/images/. The HTML parser found an empty content block and recorded
 * each as unread, which was true and was the end of it. Four of 11,980 registered instruments.
 *
 * The OCR text below is what the Mongolian pack returned for the first page of the procedure and
 * for the order, trimmed; the misreads in it ("1.2" for 1.3.2) are the engine's own and are kept,
 * since the sectioning has to live with them.
 */
import { describe, expect, it } from 'vitest';
import { legalinfoScans, parseLegalinfoScan } from '../src/parse/legalinfo.js';
import type { OcrPage } from '../src/parse/ocr.js';

const URL_ = 'https://legalinfo.mn/mn/detail?lawId=9181';

const page = (body: string) => `<!doctype html><html><body>
  <div class="law_content">
    <div class="nom-more-header"><ul><li><a><img src="assets/custom/img/ico/pdf_export.png">Pdf</a></li></ul></div>
    <div class="maincontenter">
      <div class="nom-more-divider"><img src="https://legalinfo.mn/storage/uploads/files/soyombo1.png"></div>
      <div class="nomigration">${body}</div>
    </div>
  </div></body></html>`;

describe('the scans a page shows', () => {
  it('finds a scan pasted into the page and one linked from it, in order', () => {
    const html = page(`<p><img src="data:image/png;base64,iVBORw0KGgo="></p><p><img src="/uploads/images/setguul_6_unshilt59.jpg"></p>`);
    expect(legalinfoScans(html, URL_)).toEqual([
      'data:image/png;base64,iVBORw0KGgo=',
      'https://legalinfo.mn/uploads/images/setguul_6_unshilt59.jpg',
    ]);
  });

  it('takes neither the State emblem nor the toolbar icons for a page of the instrument', () => {
    expect(legalinfoScans(page('<p>Текст</p>'), URL_)).toEqual([]);
  });
});

const ocr = (text: string, confidence = 80, n = 1): OcrPage => ({ page: n, lines: text.split('\n').filter(Boolean), confidence, text });

const PROCEDURE = ocr(`1 1
д14|
Байгаль ор фогоо бууг:       йдын
Улсын тусгАй хэрэгцээний гїзийн ойд ойн
Нэг Нийглэгүндэгтэл

1.1.Энэ журмын зорилго нь улсын тусгай хэрэгцээний газрын ойд явуулах ойн аж
ахуйн арга хэмжээтэй холбогдон үүсэх харилцааг зохицуулахад оршино

1.3.Улсын тусгай хэрэгцээний газрын ойд явуулах ойн аж ахуйн арга хэмжээнд
дарх үйл ажиллагааг хомаоруулаа:
1.3.1. ойд ажиглалт сулалгаа явуулах:

1.4. Улсын тусгай хэрэгцээний тазрын ойд явуулах ойн аж ахуйн арга хэмжээг ойн
тооллого, зохион байгуулалгын ажлын тайлан материалд тулгуурлан, ойн менежментийн
төлөвлөгөөний дагуу хэрэгжүүлж шаардагдах зардлыг тусгай хэрэгцээний газрыг`);

const PROCEDURE_2 = ocr(`эзэмшигч, ашиглагч тусгай хамгаалалттай газрын захиргаа нь тухайн жилийн
төсөвт тусган хэрэгжүүлнэ.

2
2.1. Ойн аж ахуйн арга хэмжээг гэрээгээр гүйцэтгүүлнэ.`, 80, 2);

describe('a scanned instrument, read from its OCR', () => {
  it('is sectioned on the points it is drafted in, as its text would have been', () => {
    const doc = parseLegalinfoScan([PROCEDURE], URL_);
    expect(doc.unread).toBeNull();
    expect(doc.extraction).toBe('ocr');
    expect(doc.sections.map((s) => s.label)).toEqual(['1.1', '1.3', '1.4']);
    // A line the engine wrapped belongs to the point it continues.
    expect(doc.sections[0]!.text).toContain('харилцааг зохицуулахад оршино');
    // A sub-point stays inside its point, as it does on a page of text.
    expect(doc.sections[1]!.text).toContain('ойд ажиглалт');
  });

  it('drops what OCR made of a seal or the edge of the paper', () => {
    const doc = parseLegalinfoScan([PROCEDURE], URL_);
    expect(doc.text).not.toContain('д14|');
    expect(doc.text).not.toMatch(/^1 1$/m);
  });

  it('carries a point cut by a page break on to the next page', () => {
    const doc = parseLegalinfoScan([PROCEDURE, PROCEDURE_2], URL_);
    const point = doc.sections.find((s) => s.label === '1.4')!;
    expect(point.text).toContain('төсөвт тусган хэрэгжүүлнэ');
    expect(doc.sections.map((s) => s.label)).toContain('2.1');
  });

  it('does not take a line that begins mid-reference for an article heading', () => {
    // "...Газрын тухай хуулийн 16 / дүгээр зүйлд заасан..." -- in article 16 of the Land Law.
    const doc = parseLegalinfoScan([ocr(`1.1.Энэ журмын зорилго нь ойн аж ахуйн арга хэмжээтэй холбогдон үүсэх харилцааг зохицуулахад оршино.

1.2. Улсын тусгай хэрэгцээний газрын ой гэдэгт Газрын тухай хуулийн 16
дүгээр зүйлд заасан газрын ой хамаарна.

1.3. Ойн аж ахуйн арга хэмжээг менежментийн төлөвлөгөөний дагуу хэрэгжүүлнэ.`)], URL_);
    expect(doc.sections.map((s) => s.label)).toEqual(['1.1', '1.2', '1.3']);
    expect(doc.sections[1]!.text).toContain('16 дүгээр зүйлд заасан');
  });

  it('gives a point back the stop OCR dropped, where it is the point that comes next', () => {
    const doc = parseLegalinfoScan([ocr(`1. Цусны салбар төвийн үйл ажиллагааны дүрмийг нэгдүгээр хавсралтаар баталсугай.
2 Батлагдсан журам, хяналтын хуудсыг үйл ажиллагаандаа мөрдөж ажиллахыг үүрэг болгосугай.
3 Холбогдох журмын хэрэгжилтийн явцад мэргэжил арга зүйгээр хангаж ажиллахыг үүрэг болгосугай.
2008 оны тушаалын 1 дүгээр хавсралтыг хүчингүй болсонд тооцсугай.`)], URL_);
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2', '3']);
    // A year opening a line is not point 2008.
    expect(doc.sections[2]!.text).toContain('2008 оны тушаалын');
  });

  it('reads an annex scanned after its order as a block of its own', () => {
    const order = ocr(`БАЙГАЛЬ ОРЧИН, НОГООН ХӨГЖЛИЙН САЙДЫН ТУШААЛ

1. Улсын тусгай хэрэгцээний газрын ойд ойн аж ахуйн арга хэмжээ явуулах журмыг хавсралтын ёсоор баталсугай.
2. Энэхүү журмын хэрэгжилтийг зохион байгуулж ажиллахыг үүрэг болгосугай.`);
    const annex = ocr(`Байгаль орчин, ногоон хөгжлийн сайдын
2013 оны 04 сарын 04 өдрийн
А-134 дугаар тушаалын хавсралт

${PROCEDURE.text!.split('\n').slice(5).join('\n')}`, 80, 2);
    const doc = parseLegalinfoScan([order, annex], URL_);
    expect(doc.sections.map((s) => s.label)).toEqual(['1', '2', '1.1', '1.3', '1.4']);
    expect(doc.sections[2]!.headingPath).toMatch(/^Хавсралт/);
    expect(doc.sections[0]!.headingPath).not.toMatch(/Хавсралт/);

    // The ministry's seal stamped across the header, as OCR read it on the real procedure: the
    // order still said it approves an annex, and the next page does not go on with its points.
    const sealed = ocr(`Байгаль орфин фогоо т
13 дїы й ийн
Я- зар вфралт

${PROCEDURE.text!.split('\n').slice(5).join('\n')}`, 80, 2);
    expect(parseLegalinfoScan([order, sealed], URL_).sections.map((s) => s.label)).toEqual(['1', '2', '1.1', '1.3', '1.4']);
  });

  it('keeps a second page of an order in the order, where it goes on with the order\'s points', () => {
    const order = ocr(`1. Цусны албаны үйл ажиллагаанд мөрдөгдөх журмыг хавсралтын ёсоор баталсугай.
2. Батлагдсан журмыг үйл ажиллагаандаа мөрдөж ажиллахыг эрүүл мэндийн байгууллагын дарга нарт үүрэг болгосугай.`);
    const more = ocr(`3. Энэ тушаал батлагдан гарсантай холбогдуулан Эрүүл мэндийн сайдын 2008 оны 268 дугаар тушаалыг хүчингүй болсонд тооцсугай.`, 80, 2);
    const doc = parseLegalinfoScan([order, more], URL_);
    expect(doc.sections.map((s) => [s.label, /Хавсралт/.test(s.headingPath)])).toEqual([['1', false], ['2', false], ['3', false]]);
  });

  it('holds the offset invariant every citation rests on', () => {
    const doc = parseLegalinfoScan([PROCEDURE, PROCEDURE_2], URL_);
    for (const s of doc.sections) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });

  it('is left unread, and says why, when the engine could not read it', () => {
    const doc = parseLegalinfoScan([ocr('монголулсын\nсангийн СЕЙДВ ТУушллл\nцаживининшүнваэнимилааншаж', 17)], URL_);
    expect(doc.sections).toEqual([]);
    expect(doc.unread?.reason).toBe('ocr-below-threshold');
    expect(doc.unread?.detail).toContain('17% confidence');
  });
});
