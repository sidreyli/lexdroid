/**
 * Thailand's Council of State law search: its documents are read with a POST, and they arrive
 * already divided into sections, principal Act first and each amending Act's own provisions after.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { Fetcher } from '../src/fetch/index.js';
import { docRequest, ocsKind, ocsStanding, timelineIdOf } from '../src/discover/ocs.js';
import { parseOcs } from '../src/parse/ocs.js';

const servers: Server[] = [];
afterAll(() => {
  for (const s of servers) s.close();
});

function section(seq: number, type: number, label: string, html: string) {
  return { sectionId: seq, sectionTypeId: type, sectionSeq: seq, sectionLabel: label, sectionContent: html };
}

const ACT = {
  sourceUrl: 'https://searchlaw.ocs.go.th/council-of-state/#/public/doc/X',
  doc: {
    lawInfo: { lawNameTh: 'พระราชบัญญัติเงินตรา พ.ศ. 2501', lawNameEn: 'CURRENCY ACT, B.E. 2501 (1958)', publishDateAd: '1958-08-26' },
    lawSections: [
      section(1, 1, 'ชื่อกฎหมาย', '<p>พระราชบัญญัติ</p><p>เงินตรา</p>'),
      section(2, 3, 'คำปรารภ', '<p>โดยที่เป็นการสมควรปรับปรุงกฎหมายว่าด้วยเงินตรา</p>'),
      section(3, 4, 'มาตรา 2', '<p>มาตรา ๒&nbsp; พระราชบัญญัตินี้ให้ใช้บังคับตั้งแต่วันถัดจากวันประกาศ</p>'),
      section(4, 8, 'หมวด / หมวดที่ 1', '<p>หมวด ๑</p><p>เงินตราและหน่วยของเงินตรา</p>'),
      section(5, 4, 'มาตรา 8', '<p>มาตรา ๘ (ยกเลิก)</p>'),
      section(6, 4, 'มาตรา 13 ทวิ', '<p>มาตรา ๑๓ ทวิ เมื่อเห็นสมควร รัฐมนตรีมีอำนาจถอนคืนเหรียญกษาปณ์</p>'),
      section(7, 15, 'หมายเหตุ', '<p>หมายเหตุ :- เหตุผลในการประกาศใช้</p>'),
      section(8, 1, 'ชื่อกฎหมาย ฉบับที่ 2', '<p>พระราชบัญญัติเงินตรา (ฉบับที่ ๒) พ.ศ. ๒๕๑๐</p>'),
      section(9, 4, 'มาตรา 2', '<p>มาตรา ๒ พระราชบัญญัตินี้ให้ใช้บังคับตั้งแต่วันถัดจากวันประกาศในราชกิจจานุเบกษา</p>'),
    ],
    footnoteList: [
      { footnoteDetect: '๑', footnoteContent: 'มาตรา ๔ นิยามคำว่า ยกเลิก' },
      { footnoteDetect: '๒', footnoteContent: 'ราชกิจจานุเบกษา เล่ม ๗๕/ตอนที่ ๖๕/หน้า ๔๐๙/๒๖ สิงหาคม ๒๕๐๑' },
    ],
  },
};

describe('parsing a Council of State law', () => {
  const doc = parseOcs(JSON.stringify(ACT), ACT.sourceUrl);

  it('keeps provisions as sections and the formalities as prose', () => {
    expect(doc.unread).toBeNull();
    expect(doc.title).toBe('พระราชบัญญัติเงินตรา พ.ศ. 2501 (CURRENCY ACT, B.E. 2501 (1958))');
    expect(doc.sections.map((s) => s.label)).toEqual(['2', '8', '13 ทวิ', '2 [พระราชบัญญัติเงินตรา (ฉบับที่ ๒) พ.ศ. ๒๕๑๐]']);
    for (const s of doc.sections) expect(doc.text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });

  it('names the chapter a provision sits in, and the amending Act a transitional provision belongs to', () => {
    expect(doc.sections[1]!.headingPath).toContain('หมวด ๑');
    expect(doc.sections[3]!.headingPath.startsWith('พระราชบัญญัติเงินตรา (ฉบับที่ ๒) พ.ศ. ๒๕๑๐')).toBe(true);
  });

  it('heads a provision with the Thai name only, so the English title is not a keyword match for every section', () => {
    for (const s of doc.sections) expect(s.headingPath).not.toContain('CURRENCY ACT');
    expect(doc.sections[0]!.headingPath.startsWith('พระราชบัญญัติเงินตรา พ.ศ. 2501 >')).toBe(true);
  });

  it('marks a section that is only the note of its repeal', () => {
    expect(doc.sections.map((s) => s.repealed)).toEqual([false, true, false, false]);
  });

  it('keeps the Royal Gazette reference, not the first footnote', () => {
    expect(doc.meta['gazette']).toBe('ราชกิจจานุเบกษา เล่ม ๗๕/ตอนที่ ๖๕/หน้า ๔๐๙/๒๖ สิงหาคม ๒๕๐๑');
  });

  it('splits a regulation served as one block of content at its clause numbers', () => {
    const reg = parseOcs(JSON.stringify({
      sourceUrl: 'u',
      doc: {
        lawInfo: { lawNameTh: 'กฎกระทรวงทดสอบ พ.ศ. 2569' },
        lawSections: [
          section(1, 1, 'ชื่อกฎหมาย', '<p>กฎกระทรวงทดสอบ</p>'),
          section(2, 17, 'บทอาศัยอำนาจ', '<p>อาศัยอำนาจตามความในมาตรา ๕</p>'),
          section(3, 18, 'เนื้อหา', '<p>ข้อ ๑ ให้ผู้ประกอบการแจ้ง</p><p>ความต่อพนักงาน</p><p>ข้อ ๒ กฎกระทรวงนี้ใช้บังคับ</p>'),
        ],
      },
    }), 'u');
    expect(reg.sections.map((s) => s.label)).toEqual([null, 'ข้อ 1', 'ข้อ 2']);
    expect(reg.sections[1]!.text).toContain('ความต่อพนักงาน');
  });

  it('records a law with no sections as unread rather than empty', () => {
    const none = parseOcs(JSON.stringify({ sourceUrl: 'u', doc: { lawInfo: { lawNameTh: 'x' }, lawSections: [] } }), 'u');
    expect(none.sections).toEqual([]);
    expect(none.unread?.reason).toBe('empty');
  });
});

describe('the Council of State listing', () => {
  it('reads an instrument type off the form of its Thai name', () => {
    expect(ocsKind('พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562')).toBe('act');
    expect(ocsKind('พระราชกำหนดการประกอบธุรกิจสินทรัพย์ดิจิทัล พ.ศ. 2561')).toBe('act');
    expect(ocsKind('พระราชกฤษฎีกาว่าด้วยการควบคุมดูแลธุรกิจบริการแพลตฟอร์มดิจิทัล พ.ศ. 2565')).toBe('order');
    expect(ocsKind('กฎกระทรวงกำหนดลักษณะของเหรียญกษาปณ์ พ.ศ. 2569')).toBe('regulation');
    expect(ocsKind('ประกาศกระทรวงพาณิชย์ เรื่อง ...')).toBe('notice');
    expect(ocsKind('ระเบียบกระทรวงการคลังว่าด้วยการจัดซื้อจัดจ้าง พ.ศ. 2560')).toBe('rule');
  });

  it('reads the repeal the Council marks in a law name, though its listing still says state 01', () => {
    expect(ocsStanding('พระราชบัญญัติรถลาก รัตนโกสินทรศก 120 (ยกเลิก)', '01', '2026-09-26').status).toBe('repealed');
    expect(ocsStanding('พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562', '01', '2026-09-26').status).toBe('in-force');
    expect(ocsStanding('พระราชบัญญัติทดสอบ พ.ศ. 2569', '02', '2026-09-26').status).toBeUndefined();
  });

  it('finds the document id in the page address a reader opens', () => {
    expect(timelineIdOf('https://searchlaw.ocs.go.th/council-of-state/#/public/doc/UXdWK2I1NFQ1M0NrYWNKYWpGM3JFdz09'))
      .toBe('UXdWK2I1NFQ1M0NrYWNKYWpGM3JFdz09');
    expect(timelineIdOf('https://searchlaw.ocs.go.th/council-of-state/')).toBeNull();
  });

  it('asks for the same law with the same request, so a second run reads the cache', () => {
    expect(docRequest('A').body).toBe(docRequest('A').body);
    expect(docRequest('A').body).not.toBe(docRequest('B').body);
  });
});

describe('a POST through the fetcher', () => {
  it('sends the body, and caches each body as its own answer', async () => {
    const seen: string[] = [];
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push(`${req.method} ${req.headers['content-type']} ${body}`);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ echo: body }));
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    const url = `http://127.0.0.1:${port}/api/doc`;

    const fetcher = new Fetcher({ db: openDb(':memory:'), sourceMode: 'fetch', minDelayMs: 0 });
    const a = await fetcher.fetch(url, { post: { body: '{"id":"a"}', contentType: 'application/json' } });
    const b = await fetcher.fetch(url, { post: { body: '{"id":"b"}', contentType: 'application/json' } });
    const again = await fetcher.fetch(url, { post: { body: '{"id":"a"}', contentType: 'application/json' } });

    expect(JSON.parse(a.body.toString()).echo).toBe('{"id":"a"}');
    expect(JSON.parse(b.body.toString()).echo).toBe('{"id":"b"}');
    expect(again.fromCache).toBe(true);
    expect(JSON.parse(again.body.toString()).echo).toBe('{"id":"a"}');
    expect(seen).toEqual(['POST application/json {"id":"a"}', 'POST application/json {"id":"b"}']);
  });
});
