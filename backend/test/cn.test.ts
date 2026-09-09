/**
 * The China path: Word extraction, the Chinese statute parser, CJK query building, and the flk
 * adapter's reading of the portal's own metadata.
 *
 * Two layers. Synthetic strings pin the parser's structure logic without a document, and the two
 * real Word files fetched from flk.npc.gov.cn -- the Personal Information Protection Law and the
 * Cybersecurity Law as amended in 2025 -- pin it against text nobody wrote for a test. The counts
 * asserted below (74 and 81 articles) are the counts those statutes actually have.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { docxParagraphs, parseDocx, NotADocx } from '../src/parse/docx.js';
import { parseCn } from '../src/parse/cn.js';
import { detailId, FlkError } from '../src/discover/flk.js';
import { ftsQuery } from '../src/index/index.js';
import type { ParsedDocument } from '../src/parse/types.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const PIPL = join(FIXTURES, '中华人民共和国个人信息保护法_20210820.docx');
const CSL = join(FIXTURES, '中华人民共和国网络安全法_20251028.docx');

const parseFixture = (path: string): ParsedDocument =>
  parseCn(docxParagraphs(readFileSync(path)), 'https://flk.npc.gov.cn/detail?id=test');

function offsetsHold(doc: ParsedDocument): void {
  for (const s of doc.sections) {
    expect(doc.text.slice(s.charStart, s.charEnd), `section ${s.ordinal} (${s.headingPath})`).toBe(s.text);
  }
}

const cn = (body: string): ParsedDocument => parseCn(body.split('\n'), 'https://flk.npc.gov.cn/detail?id=test');
const labels = (doc: ParsedDocument): (string | null)[] => doc.sections.map((s) => s.label);
const byLabel = (doc: ParsedDocument, label: string) => doc.sections.find((s) => s.label === label);

describe('docx extraction', () => {
  it('reads every paragraph of a real Word file in document order', () => {
    const paragraphs = docxParagraphs(readFileSync(PIPL));
    expect(paragraphs.length).toBeGreaterThan(150);
    expect(paragraphs.filter((p) => p.trim())[0]).toBe('中华人民共和国个人信息保护法');
  });

  it('refuses bytes that are not a zip archive rather than reporting an empty document', () => {
    expect(() => docxParagraphs(Buffer.from('<html>not a docx</html>'))).toThrow(NotADocx);
  });

  it('records a non-docx as unread with a reason, never as a document with no text', () => {
    const doc = parseDocx(Buffer.from('<html>not a docx</html>'), 'https://example.gov/x.docx');
    expect(doc.sections).toHaveLength(0);
    expect(doc.unread?.reason).toBe('unsupported-media-type');
  });
});

describe('parseCn structure', () => {
  it('reads chapters as heading context and articles as the citable unit', () => {
    const doc = cn(
      '测试法\n' +
        '（2024年1月1日通过）\n' +
        '第一章　总　则\n' +
        '第一条　为了规范测试活动，制定本法。\n' +
        '第二条　本法适用于中华人民共和国境内的测试活动。\n',
    );
    expect(labels(doc)).toEqual(['第一条', '第二条']);
    expect(byLabel(doc, '第一条')!.headingPath).toBe('第一章 总 则 > 第一条');
    expect(byLabel(doc, '第一条')!.text).toBe('为了规范测试活动，制定本法。');
    expect(doc.meta['adoptedOn']).toBe('2024-01-01');
  });

  it('takes a bare chapter number’s title from the following line', () => {
    const doc = cn('测试法\n第二章\n个人信息处理规则\n第三条　规则如下。\n');
    expect(byLabel(doc, '第三条')!.headingPath).toBe('第二章 个人信息处理规则 > 第三条');
  });

  it('reads an article inserted by amendment', () => {
    const doc = cn('测试法\n第一章　总则\n第七条之一　本条为增补条文。\n');
    expect(labels(doc)).toEqual(['第七条之一']);
  });

  it('makes items citable in their own right', () => {
    const doc = cn(
      '测试法\n第一章　总则\n第十三条　符合下列情形之一的：\n（一）取得个人的同意；\n（二）法律规定的其他情形。\n',
    );
    expect(labels(doc)).toEqual(['第十三条', '第十三条（一）', '第十三条（二）']);
    expect(byLabel(doc, '第十三条（一）')!.headingPath).toBe('第一章 总则 > 第十三条 > （一）');
  });

  it('treats a repeated chapter number as the body starting, not a second chapter', () => {
    const doc = cn(
      '测试法\n目　录\n第一章　总则\n第二章　罚则\n' +
        '第一章　总则\n第一条　第一条文本。\n第二章　罚则\n第二条　第二条文本。\n',
    );
    expect(labels(doc)).toEqual(['第一条', '第二条']);
    expect(byLabel(doc, '第一条')!.headingPath).toBe('第一章 总则 > 第一条');
    expect(byLabel(doc, '第二条')!.headingPath).toBe('第二章 罚则 > 第二条');
  });

  /**
   * The rule the predecessor of this parser got wrong. A 节 heading appears in the body as well as
   * the contents, and mid-chapter -- so treating an unmatched line as continuation text appends a
   * section heading to the article above it and corrupts a provision that may be cited.
   */
  it('reads a mid-chapter 节 as heading context, never as text of the article above it', () => {
    const doc = cn(
      '测试法\n第二章　处理规则\n第一节　一般规定\n第二十七条　第二十七条文本。\n' +
        '第二节　特别规定\n第二十八条　第二十八条文本。\n',
    );
    expect(byLabel(doc, '第二十七条')!.text).toBe('第二十七条文本。');
    expect(byLabel(doc, '第二十七条')!.headingPath).toBe('第二章 处理规则 > 第一节 一般规定 > 第二十七条');
    expect(byLabel(doc, '第二十八条')!.headingPath).toBe('第二章 处理规则 > 第二节 特别规定 > 第二十八条');
  });

  it('continues an open item only while its own sentence is unfinished', () => {
    const doc = cn(
      '测试法\n第一章　总则\n第十三条　符合下列情形之一的：\n' +
        '（一）为订立合同所必需，\n或者为人力资源管理所必需；\n' +
        '（二）法律规定的其他情形。\n' +
        '依照本法其他有关规定，处理个人信息应当取得个人同意。\n',
    );
    // The unpunctuated first line of （一） is finished by the line after it...
    expect(byLabel(doc, '第十三条（一）')!.text).toBe('为订立合同所必需， 或者为人力资源管理所必需；');
    // ...but the line after a CLOSED item belongs to the article, and gets a section of its own
    // carrying the article's heading path and no label, because the source prints no number for it.
    const trailing = doc.sections[doc.sections.length - 1]!;
    expect(trailing.label).toBeNull();
    expect(trailing.headingPath).toBe('第一章 总则 > 第十三条');
    expect(trailing.text).toBe('依照本法其他有关规定，处理个人信息应当取得个人同意。');
  });

  it('keeps further paragraphs of an article that opened no list in the article itself', () => {
    const doc = cn('测试法\n第一章　总则\n第十四条　第一款文本。\n第二款文本。\n');
    expect(labels(doc)).toEqual(['第十四条']);
    expect(byLabel(doc, '第十四条')!.text).toBe('第一款文本。 第二款文本。');
  });

  it('reports a document with no articles as unread rather than as an empty statute', () => {
    const doc = cn('这是一份没有条文的文件。\n');
    expect(doc.sections).toHaveLength(0);
    expect(doc.unread?.reason).toBe('empty');
  });
});

describe('parseCn against the real statutes', () => {
  it('parses the Personal Information Protection Law into its 74 articles', () => {
    const doc = parseFixture(PIPL);
    expect(doc.title).toBe('中华人民共和国个人信息保护法');
    expect(doc.meta['articleCount']).toBe('74');
    expect(doc.meta['adoptedOn']).toBe('2021-08-20');
    expect(doc.unread).toBeNull();
    offsetsHold(doc);
  });

  it('parses the Cybersecurity Law, as amended, into its 81 articles', () => {
    const doc = parseFixture(CSL);
    expect(doc.title).toBe('中华人民共和国网络安全法');
    expect(doc.meta['articleCount']).toBe('81');
    // The document's own 题注 records the original adoption; the 2025 amendment is in the same line.
    expect(doc.meta['adoptedOn']).toBe('2016-11-07');
    expect(doc.meta['adoptedBasis']).toContain('2025年10月28日');
    offsetsHold(doc);
  });

  it('cites PIPL Article 38’s first cross-border condition at the item', () => {
    const s = byLabel(parseFixture(PIPL), '第三十八条（一）')!;
    expect(s.text).toBe('依照本法第四十条的规定通过国家网信部门组织的安全评估；');
    expect(s.headingPath).toBe('第三章 个人信息跨境提供的规则 > 第三十八条 > （一）');
    expect(s.language).toBe('zh');
  });

  it('cites the six-month log retention duty at the item that carries it', () => {
    const s = byLabel(parseFixture(CSL), '第二十三条（三）')!;
    expect(s.text).toContain('不少于六个月');
  });

  it('leaves no chapter or section heading inside the text of any article', () => {
    for (const path of [PIPL, CSL]) {
      const stray = parseFixture(path).sections.filter((s) =>
        /第[〇零一二三四五六七八九十百千两\d]+[节章]\s/.test(s.text),
      );
      expect(stray, `${path}: ${stray.map((s) => s.label).join(', ')}`).toHaveLength(0);
    }
  });
});

describe('ftsQuery on spaceless scripts', () => {
  it('expands a Chinese run into the trigrams the index is built from', () => {
    expect(ftsQuery('个人信息保护')).toBe('"个人信" OR "人信息" OR "信息保" OR "息保护"');
  });

  it('splits on Chinese punctuation and expands each run', () => {
    const q = ftsQuery('数据出境，安全评估')!;
    expect(q).toContain('"数据出"');
    expect(q).toContain('"安全评"');
    expect(q).not.toContain('数据出境，安全评估');
  });

  it('leaves a Latin query byte-identical to what it was before', () => {
    expect(ftsQuery('requirement to store personal data locally')).toBe(
      '"requirement" OR "store" OR "personal" OR "data" OR "locally"',
    );
    expect(ftsQuery('cross-border transfer')).toBe('"cross" OR "border" OR "transfer"');
  });

  it('handles a token mixing scripts', () => {
    const q = ftsQuery('PIPL个人信息')!;
    expect(q).toContain('"pipl"');
    expect(q).toContain('"个人信"');
  });

  it('still answers nothing for a query the trigram index cannot match', () => {
    expect(ftsQuery('数据')).toBeNull();
    expect(ftsQuery('!!')).toBeNull();
  });
});

describe('the flk adapter', () => {
  it('reads the detail id the portal API calls bbbs', () => {
    expect(detailId('https://flk.npc.gov.cn/detail?id=ff8081817b6472a3017b656cc2040044')).toBe(
      'ff8081817b6472a3017b656cc2040044',
    );
  });

  it('refuses a URL that is not a detail page rather than requesting a guess', () => {
    expect(() => detailId('https://flk.npc.gov.cn/')).toThrow(FlkError);
  });
});
