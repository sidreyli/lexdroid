/**
 * Parse a law as the Council of State's document service returns it: already divided into its
 * sections, each labelled and typed.
 *
 * A consolidated Thai Act is the principal text followed by the provisions of each amending Act
 * that still stand on their own -- commencement, transitional and savings sections. Those carry
 * the amending Act's section numbers, so "มาตรา 2" occurs once for the principal Act and once for
 * every amendment. Each is kept, labelled with the Act it belongs to, so a citation never points
 * at the principal Act's section 2 when it meant an amendment's.
 */
import * as cheerio from 'cheerio';
import type { OcsResolved, OcsSection } from '../discover/ocs.js';
import { SectionBuilder, type ParsedDocument } from './types.js';

/** The service's section types, as they occur across its documents. */
const TITLE = 1;
const PROVISION = 4;
const AUTHORITY = 17;
const CONTENT = 18;
const SCHEDULE = 20;
/** Chapter and part headings: they head the provisions that follow, and are not provisions. */
const HEADING_LABEL = /^(?:หมวด|ส่วน|ลักษณะ|บรรพ|บท)/;

const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const arabic = (s: string): string => s.replace(/[๐-๙]/g, (d) => String(THAI_DIGITS.indexOf(d)));

function textOf(html: string): string {
  const $ = cheerio.load(`<body>${html}</body>`);
  $('br').replaceWith('\n');
  $('p, div, tr, li').each((_, el) => {
    $(el).append('\n');
  });
  return $('body')
    .text()
    .replace(/ /g, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function unread(url: string, reason: 'parse-error' | 'empty', detail: string, title: string | null = null): ParsedDocument {
  return { extraction: 'none', text: '', sections: [], unread: { reason, detail: `${url} ${detail}` }, title, meta: {}, parser: 'ocs' };
}

/** A provision whose whole remaining text is the note that it was repealed. */
function isRepealed(text: string): boolean {
  return text.length < 80 && /\(ยกเลิก\)\s*$/.test(text);
}

/**
 * The clauses of a regulation or notification the service returns as one block of content.
 * Split where a paragraph opens with its clause number ("ข้อ ๑"), so each clause is citable.
 */
function clauses(text: string): { label: string | null; text: string }[] {
  const out: { label: string | null; text: string }[] = [];
  let current: { label: string | null; lines: string[] } = { label: null, lines: [] };
  for (const line of text.split('\n')) {
    const m = /^ข้อ\s*([๐-๙0-9]+(?:\/[๐-๙0-9]+)?(?:\s*(?:ทวิ|ตรี|จัตวา|เบญจ|ฉ|สัตต|อัฏฐ|นว))?)\s/.exec(line.trim() + ' ');
    if (m) {
      if (current.lines.join('').trim()) out.push({ label: current.label, text: current.lines.join('\n') });
      current = { label: `ข้อ ${arabic(m[1]!.trim())}`, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.join('').trim()) out.push({ label: current.label, text: current.lines.join('\n') });
  return out;
}

export function parseOcs(raw: string, url: string): ParsedDocument {
  let payload: OcsResolved;
  try {
    payload = JSON.parse(raw) as OcsResolved;
  } catch {
    return unread(url, 'parse-error', 'did not contain a valid Council of State payload.');
  }
  const info = payload?.doc?.lawInfo ?? {};
  const english = info.lawNameEn?.trim() || null;
  const thai = info.lawNameTh?.replace(/\s+/g, ' ').trim() || null;
  const title = thai ? (english ? `${thai} (${english})` : thai) : english;
  const sections: OcsSection[] = Array.isArray(payload?.doc?.lawSections) ? payload.doc.lawSections : [];
  if (sections.length === 0) return unread(url, 'empty', 'exposed no sections; the service holds this law only as a scanned file.', title);

  const builder = new SectionBuilder();
  let seenTitle = false;
  /** The amending instrument whose provisions follow, once the principal text has ended. */
  let amending: string | null = null;
  let heading: string | null = null;

  for (const s of [...sections].sort((a, b) => a.sectionSeq - b.sectionSeq)) {
    const type = Number(s.sectionTypeId);
    const label = (s.sectionLabel ?? '').replace(/\s+/g, ' ').trim();
    const text = textOf(s.sectionContent ?? '');
    if (!text) continue;

    if (type === TITLE) {
      if (seenTitle) {
        amending = text.replace(/\s+/g, ' ');
        heading = null;
      }
      seenTitle = true;
      builder.addProse(text);
      continue;
    }

    const provisional = type === PROVISION || type === AUTHORITY || type === CONTENT || type === SCHEDULE;
    if (!provisional && text.length < 300 && (HEADING_LABEL.test(label) || HEADING_LABEL.test(text))) {
      heading = text.replace(/\s+/g, ' ');
      builder.addProse(text);
      continue;
    }

    // The Thai name alone. The heading is indexed with the provision, and an English title on
    // every section of a Thai Act makes every one of them a keyword match for any English word in
    // the title -- "country" put the Cleanliness Act's 200 sections first for a question about
    // sending data abroad. The English name stays on the document, where it names the instrument.
    const owner = amending ?? thai ?? title;
    if (type === PROVISION) {
      const number = /^มาตรา\s*(.+)$/.exec(label)?.[1]?.trim() ?? (label || null);
      const cited = number ? (amending ? `${number} [${amending}]` : number) : null;
      builder.add({
        headingPath: [owner, heading, label || null].filter(Boolean).join(' > '),
        label: cited,
        text,
        page: null,
        language: 'th',
        repealed: isRepealed(text),
        anchor: null,
      });
      continue;
    }

    if (type === CONTENT || type === AUTHORITY || type === SCHEDULE) {
      const parts = type === CONTENT ? clauses(text) : [{ label: null, text }];
      for (const part of parts) {
        const cited = part.label ? (amending ? `${part.label} [${amending}]` : part.label) : null;
        builder.add({
          headingPath: [owner, heading, part.label ?? (label || null)].filter(Boolean).join(' > '),
          label: cited,
          text: part.text,
          page: null,
          language: 'th',
          repealed: isRepealed(part.text),
          anchor: null,
        });
      }
      continue;
    }

    // The signature, preamble, countersignature and the note of reasons: part of the document,
    // not provisions of it.
    builder.addProse(text);
  }

  if (builder.sections.length === 0) {
    return unread(url, 'empty', 'held a title and formalities but no provisions.', title);
  }

  const meta: Record<string, string> = {};
  if (english) meta['englishTitle'] = english;
  if (info.publishDateAd) meta['published'] = info.publishDateAd;
  if (info.effectiveDateStartAd) meta['currentFrom'] = info.effectiveDateStartAd;
  const gazette = (payload.doc.footnoteList ?? []).find((f) => /ราชกิจจานุเบกษา/.test(f.footnoteContent ?? ''));
  if (gazette?.footnoteContent) meta['gazette'] = gazette.footnoteContent.trim();

  return { extraction: 'html', text: builder.text, sections: builder.sections, unread: null, title, meta, parser: 'ocs' };
}
