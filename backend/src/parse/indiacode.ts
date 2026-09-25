/** Parse the structured provision payload assembled from India Code's public DSpace API. */
import * as cheerio from 'cheerio';
import type { IndiaCodeItem, IndiaCodeResolved } from '../discover/indiacode.js';
import { SectionBuilder, type ParsedDocument } from './types.js';

interface MetadataValue {
  value?: string;
  language?: string | null;
}

function values(item: IndiaCodeItem, key: string): MetadataValue[] {
  return item.metadata?.[key] ?? [];
}

function value(item: IndiaCodeItem, key: string): string | null {
  const raw = values(item, key)[0]?.value;
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/** India Code stores provision bodies as small HTML fragments with br/hr formatting. */
function legalText(raw: string): string {
  const $ = cheerio.load(`<body>${raw}</body>`);
  $('br').replaceWith('\n');
  $('hr').replaceWith('\n');
  return $('body')
    .text()
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function languageOf(text: string, stated: string | null | undefined): string | null {
  if (stated && /^[a-z]{2,3}(?:-|$)/i.test(stated)) return stated.toLowerCase();
  const devanagari = (text.match(/[\u0900-\u097f]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (devanagari > latin && devanagari > 3) return 'hi';
  if (latin > 3) return 'en';
  return null;
}

function labelOf(section: IndiaCodeItem): string | null {
  const raw =
    value(section, 'dc.identifier.section_number') ??
    value(section, 'dc.identifier.rule_number') ??
    value(section, 'dc.identifier.regulation_number') ??
    value(section, 'dc.identifier.order_number');
  return raw ? raw.replace(/^section\s+/i, '').trim() : null;
}

function pageOf(section: IndiaCodeItem): number | null {
  const raw = value(section, 'dc.identifier.page_number');
  if (!raw) return null;
  const page = Number.parseInt(raw, 10);
  return Number.isInteger(page) && page > 0 ? page : null;
}

function isRepealed(item: IndiaCodeItem): boolean {
  return value(item, 'dc.identifier.repealed')?.toLowerCase() === 'true';
}

/** Every metadata field that actually carries authored provision text, including regional twins. */
function provisionBodies(section: IndiaCodeItem): { text: string; language: string | null }[] {
  const out: { text: string; language: string | null }[] = [];
  const seen = new Set<string>();
  for (const [key, entries] of Object.entries(section.metadata ?? {})) {
    if (!/(?:section|rule|regulation|order).*page_note|page_note.*(?:regional|hindi)/i.test(key)) continue;
    for (const entry of entries) {
      if (!entry.value) continue;
      const text = legalText(entry.value);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ text, language: languageOf(text, entry.language) });
    }
  }
  return out;
}

function officialNumber(item: IndiaCodeItem): string | null {
  const collection = value(item, 'dc.identifier.collection')?.toUpperCase();
  const act = value(item, 'dc.identifier.act_number');
  const year = value(item, 'dc.date.act_year') ?? value(item, 'dc.date.issued')?.slice(0, 4) ?? null;
  if (collection === 'ACT' && act) return `Act No. ${act}${year ? ` of ${year}` : ''}`;
  return (
    value(item, 'dc.identifier.notification_number') ??
    value(item, 'dc.identifier.rule_number') ??
    value(item, 'dc.identifier.regulation_number') ??
    value(item, 'dc.identifier.order_number') ??
    value(item, 'dc.identifier.givenid')
  );
}

export function parseIndiaCode(raw: string, url: string): ParsedDocument {
  let payload: IndiaCodeResolved;
  try {
    payload = JSON.parse(raw) as IndiaCodeResolved;
  } catch {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      unread: { reason: 'parse-error', detail: `${url} did not contain a valid India Code payload.` },
      title: null,
      meta: {},
      parser: 'indiacode',
    };
  }

  const possibleItem = payload?.item;
  const title = possibleItem
    ? (possibleItem.name ?? value(possibleItem, 'dc.title') ?? '').replace(/\s+/g, ' ').trim() || null
    : null;
  if (!possibleItem?.metadata || !Array.isArray(payload.sections)) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      unread: { reason: 'parse-error', detail: `${url} contained no India Code item or section list.` },
      title,
      meta: {},
      parser: 'indiacode',
    };
  }
  const item = possibleItem;

  const builder = new SectionBuilder();
  for (const section of payload.sections) {
    const label = labelOf(section);
    const heading = (section.name ?? value(section, 'dc.title') ?? '').replace(/\s+/g, ' ').trim();
    const bodies = provisionBodies(section);
    for (const body of bodies) {
      const prefix = [label ? `Section ${label}` : null, heading].filter(Boolean).join(' — ');
      builder.add({
        headingPath: [title, prefix].filter(Boolean).join(' > '),
        label,
        text: [prefix, body.text].filter(Boolean).join('\n'),
        page: pageOf(section),
        language: body.language,
        repealed: isRepealed(section) || /\b(?:repealed|omitted)\b/i.test(heading),
        anchor: null,
      });
    }
  }

  if (builder.sections.length === 0) {
    return {
      extraction: 'none',
      text: '',
      sections: [],
      unread: {
        reason: 'empty',
        detail: `${url} exposed neither structured provision text nor an official PDF to read.`,
      },
      title,
      meta: {},
      parser: 'indiacode',
    };
  }

  const meta: Record<string, string> = {};
  const number = officialNumber(item);
  const jurisdiction = value(item, 'dc.identifier.state_name');
  const ministry = value(item, 'dc.identifier.ministry_name');
  if (number) meta['officialNumber'] = number;
  if (jurisdiction) meta['jurisdiction'] = jurisdiction;
  if (ministry) meta['ministry'] = ministry;

  return {
    extraction: 'html',
    text: builder.text,
    sections: builder.sections,
    unread: null,
    title,
    meta,
    parser: 'indiacode',
  };
}
