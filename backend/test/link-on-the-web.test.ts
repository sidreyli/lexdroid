/**
 * A link to a file on the editor's own desktop is not a document the page publishes.
 *
 * Mongolia's legalinfo.mn carries links like file:///Users/.../08-ne-89.doc beside a law; followed,
 * each failed as a refusal would, and three in a row stopped the read of every law after them.
 */
import { describe, expect, it } from 'vitest';
import { namedDocumentLink, pointedDocumentLink } from '../src/parse/html.js';

const page = 'https://legalinfo.mn/mn/detail?lawId=16230';

describe('a link to a local file', () => {
  it('is not taken for the file a page names', () => {
    const html = '<a href="file:///Users/editor/Desktop/08-ne-89.doc">Ашигт малтмалын тухай</a>';
    expect(namedDocumentLink(html, page, 'Ашигт малтмалын тухай')).toBeNull();
  });

  it('is not taken for the file a page points at', () => {
    const html = '<a href="file:///Users/editor/Desktop/21-ne-053.docx">download</a>';
    expect(pointedDocumentLink(html, page)).toBeNull();
  });

  it('leaves a web link as it was', () => {
    const html = '<a href="/files/law.pdf">download</a>';
    expect(pointedDocumentLink(html, page)).toBe('https://legalinfo.mn/files/law.pdf');
  });
});
