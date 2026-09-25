/**
 * Sectioning a Lao instrument, read by OCR from a gazette scan.
 *
 * Every document the Lao Official Gazette publishes is an image-only PDF, so the text arrives
 * through Tesseract at 60-86 confidence per page. `sectionise` in pdf.ts knows English, Malay and
 * Hindi drafting and nothing of Lao; given a Lao decision it found no provision at all and stored
 * the document as one section. This reads the structure Lao drafting uses, as OCR actually
 * delivers it -- measured on four gazette documents (a Bank of the Lao PDR decision, a Ministry of
 * Industry and Commerce decision, a Government decree and the Cybersecurity Law):
 *
 *   ພາກທີ I  <title on the next line>     a part    -- its Roman numeral does not survive OCR:
 *                                                    "ພາກທີ |[", "ພາກທີ [![|", "ພາກທີ ໄ ງ"
 *   ໝວດທີ 1  <title on the next line>     a chapter -- ໝ is often read as ບນ or ຫນ: "ບນວດທີ 2"
 *   ມາດຕາ 1 ຈຸດປະສົງ                      an article, the citable unit, title on the same line
 *
 * Two things are therefore inferred rather than read, and every inference is recorded.
 *
 *  - A part's number. Parts are numbered by their order in the document, which is how the drafter
 *    numbered them, and named by their title line, which OCR reads well.
 *  - An article's number, where OCR misread it and the sequence around it says what it is. Lao
 *    articles run 1, 2, 3 without gaps or insertions, and OCR reads most numbers right: the payment
 *    systems decision has articles 1-59 and OCR read six wrong -- 30 as "390", 31 as "81", 33 as
 *    "393", 35 as "395", 39 as "99", and 53 as "55", which then collided with the real 55. Where
 *    the neighbours agree on what a number must be, the section takes that label; the text is kept
 *    exactly as read. A number whose neighbours do not agree keeps what OCR read.
 *
 * Nothing here normalises the stored text. Matching is done on a copy with the Lao vowel written
 * one way and spacing collapsed; what is stored is what OCR returned, so the offset invariant and
 * the record of what the scan said both hold.
 */
import type { PageText } from './pdf.js';
import { SectionBuilder } from './types.js';

const LAO_DIGITS = '໐໑໒໓໔໕໖໗໘໙';
const DIGIT = `[0-9${LAO_DIGITS}]`;

/** Lao digits as ASCII: "໑໒" is 12. */
function ascii(n: string): string {
  return n.replace(new RegExp(`[${LAO_DIGITS}]`, 'gu'), (d) => String(LAO_DIGITS.indexOf(d)));
}

/** The copy of a line that patterns are matched against: ໍ + າ as ຳ, spacing collapsed, leading OCR punctuation gone. */
function key(line: string): string {
  return line
    .replace(/ໍາ/g, 'ຳ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,·:;'"“”‘’\-–—|/\\]+/u, '')
    .trim();
}

/** "ມາດຕາ 12 ...", tolerating the space OCR sometimes puts inside the word. */
const ARTICLE = new RegExp(`^ມາ\\s*ດ\\s*ຕາ\\s*(${DIGIT}{1,4})(?!${DIGIT})`, 'u');

/** "ພາກທີ ..." -- a part. Not "ພາກສ່ວນທີ່" (the parties concerned), which has a word between. */
const PART = /^ພາກ\s*ທີ(?:\s|$)/u;

/**
 * "ໝວດທີ 2", and every way OCR has been measured writing ໝ on these scans: ຫມ, ບນ, ຫນ, ບຫ, ຫພ, and
 * a bare ຫ -- the dangerous goods decree alone reads its chapters as "ຫນວດທີ 1", "ບນວດທີ 2",
 * "ບຫວດທີ 3", "ຫວດທີ 5" and "ຫພວດທີ 8". The number is required: it is always printed, and it is
 * what keeps a body line that happens to start with ວດ-words from being taken for a chapter.
 */
const CHAPTER = new RegExp(`^(?:ໝ|ຫມ|ບນ|ຫນ|ບຫ|ຫພ|ຫ)ວດ\\s*ທີ\\s*(${DIGIT}{1,3})(?!${DIGIT})`, 'u');

/** The national letterhead every act opens with: "ສາທາລະນະລັດ ປະຊາທິປະໄຕ ປະຊາຊົນລາວ". */
const LETTERHEAD = /^ສາທາລະນະລັດ\s*ປະຊາທິປະໄຕ\s*ປະຊາຊົນລາວ$/u;

/** The office that signs, which opens the signature block: governor, minister, prime minister, president, head. */
const SIGNATORY = /(?:ຜູ້ວ່າການ|ຜູ້ວາການ|ລັດຖະມົນຕີ|ນາຍົກລັດຖະມົນຕີ|ປະທານປະເທດ|ປະທານສະພາແຫ່ງຊາດ|ປະທານ|ຫົວໜ້າ|ຫົວຫນ້າ|ລັດຖະມົນຕີວ່າການ)/u;

/**
 * A line that is not text: stamp and seal debris, a mangled page number. Lao text always has a
 * run of three Lao letters somewhere in it -- a syllable and its vowel and tone marks -- and the
 * debris a seal leaves never does: "ຈ . ພມ #+", "ມູ່", "74".
 */
function isDebris(line: string): boolean {
  const t = line.replace(/\s+/g, '');
  if (t.length <= 3) return true;
  // A word of four Lao letters, in the line as printed: seal debris is short syllables apart --
  // "ຫຈ ແພ ພູເ" above the Cybersecurity Law's first part -- which run together once spaces go.
  if (!line.split(/\s+/).some((w) => /[ກ-໿]{4}/u.test(w))) return true;
  const lao = (t.match(/[ກ-໿]/gu) ?? []).length;
  const digits = (t.match(/[0-9]/g) ?? []).length;
  return lao + digits < t.length * 0.5;
}

export interface LaoSectioning {
  builder: SectionBuilder;
  /** Each label that came from the sequence rather than from what OCR read: "30 (read 390)". */
  inferred: string[];
  /** Page-edge lines dropped as debris, by page: "p4: 74". */
  dropped: string[];
}

interface Line {
  text: string;
  key: string;
  page: number;
}

export function isMostlyLao(pages: PageText[]): boolean {
  const all = pages.map((p) => p.lines.join('')).join('');
  const lao = (all.match(/[຀-໿]/gu) ?? []).length;
  const letters = (all.match(/\p{L}/gu) ?? []).length;
  return letters > 0 && lao / letters > 0.6;
}

export function sectioniseLao(pages: PageText[]): LaoSectioning {
  const dropped: string[] = [];
  // Page furniture: the first and last line of a page, where it is debris -- a page number OCR
  // mangled into "74" or "ມູ່". Only at the edges, where a printer puts it.
  const lines: Line[] = [];
  for (const p of pages) {
    p.lines.forEach((text, i) => {
      const edge = i === 0 || i === p.lines.length - 1;
      if (!text.trim()) return;
      if (edge && isDebris(text)) {
        dropped.push(`p${p.page}: ${text.trim()}`);
        return;
      }
      lines.push({ text, key: key(text), page: p.page });
    });
  }

  // Article numbers as read, then repaired where the sequence says what they are.
  const heads = lines.map((l, i) => ({ i, m: ARTICLE.exec(l.key) })).filter((x) => x.m !== null);
  const read = heads.map((h) => Number(ascii(h.m![1]!)));

  // A gazetted law is a bundle: the President's decree promulgating it (articles 1-2), the
  // National Assembly's resolution adopting it (articles 1-2), then the law (articles 1-79 for the
  // Cybersecurity Law). Each act numbers from 1, and read as one sequence the law's articles 1 and
  // 2 were the third copies of those labels. An act starts where an article reads 1 and the next
  // reads 2.
  const restarts = new Set<number>();
  for (let k = 1; k < read.length - 1; k += 1) if (read[k] === 1 && read[k + 1] === 2) restarts.add(k);

  const labels = read.map(String);
  const inferred: string[] = [];
  for (let k = 0; k < read.length; k += 1) {
    const expected = k === 0 || restarts.has(k) ? 1 : Number(labels[k - 1]) + 1;
    if (read[k] === expected) continue;
    // The next heading, or the one after it, has to confirm the position: n+1 or n+2 where n is
    // the number this one should be. Without that the sequence says nothing and OCR is believed.
    // The last article has nothing after it to confirm it, so it keeps what OCR read.
    const confirms = read[k + 1] === expected + 1 || read[k + 2] === expected + 2;
    if (confirms && Number.isFinite(expected)) {
      labels[k] = String(expected);
      inferred.push(`${expected} (read ${read[k]})`);
    }
  }
  const labelAt = new Map(heads.map((h, k) => [h.i, labels[k]!]));

  const builder = new SectionBuilder();
  // The signature: on the last page, the first line naming the office that signs after the final
  // article heading opens. Everything from it on is the signature and the seal.
  const lastHead = heads.at(-1)?.i ?? -1;
  const lastPage = pages.at(-1)?.page;
  let signature = lines.length;
  for (let i = lastHead + 1; i < lines.length; i += 1) {
    if (lines[i]!.page === lastPage && lines[i]!.key.length < 60 && SIGNATORY.test(lines[i]!.key)) {
      signature = i;
      break;
    }
  }

  // Where each act of a bundle begins: from the signature that closes the act before it, or the
  // national letterhead that opens this one, whichever comes first after the previous article's
  // heading -- so one act's signature is not read as the last article of the one before.
  const blockStarts: { at: number; name: string | null }[] = [];
  const restartHeads = [...restarts].map((k) => heads[k]!.i);
  for (const headAt of restartHeads) {
    const after = heads.filter((h) => h.i < headAt).at(-1)?.i ?? -1;
    let at = headAt;
    for (let j = after + 1; j < headAt; j += 1) {
      if ((lines[j]!.key.length < 60 && SIGNATORY.test(lines[j]!.key)) || LETTERHEAD.test(lines[j]!.key)) {
        at = j;
        break;
      }
    }
    blockStarts.push({ at, name: null });
  }
  // Each act before the last is named, by its type and the subject line under it; the last is the
  // instrument the register filed, and its provisions carry no prefix.
  const bounds = [0, ...blockStarts.map((b) => b.at), lines.length];
  const blockName = (from: number, to: number): string => {
    const front = lines.slice(from, to).map((l) => l.key);
    const type = front.some((t) => /ລັດຖະດຳລັດ|ອອກລັດຖະດຳລັດ/u.test(t))
      ? 'ລັດຖະດຳລັດ'
      : front.some((t) => /^ມະຕິ$/u.test(t) || /^ມະຕິ\s/u.test(t))
        ? 'ມະຕິ'
        : null;
    const subject = front.find((t) => /^(?:ກ່ຽວກັບ|ກຽວກັບ|ວ່າດ້ວຍ|ວາດ້ວຍ)/u.test(t)) ?? null;
    return [type, subject].filter(Boolean).join(' ') || 'ບົດນຳ';
  };
  const firstHeadIn = (from: number, to: number): number => heads.find((h) => h.i >= from && h.i < to)?.i ?? to;
  const containers = bounds.slice(0, -1).map((from, b) =>
    b === bounds.length - 2 ? null : blockName(from, firstHeadIn(from, bounds[b + 1]!)),
  );
  const blockAt = new Map(bounds.slice(1, -1).map((at, b) => [at, b + 1]));

  let block: string | null = containers[0] ?? null;
  let part: string | null = null;
  let partCount = 0;
  let chapter: string | null = null;
  let open: { label: string | null; heading: string; body: string[]; page: number } | null = null;

  const close = (): void => {
    if (!open) return;
    builder.add({
      headingPath: [block, part, chapter, key(open.heading)].filter(Boolean).join(' > '),
      label: open.label,
      text: [open.heading, ...open.body].join('\n'),
      page: open.page,
      language: 'lo',
      // "(ຍົກເລີກ)" -- repealed -- where the drafter marks an article as removed.
      repealed: /ຍົກເລີກ/u.test(key(open.heading)) && open.body.join('').length < 200,
      anchor: null,
    });
    open = null;
  };

  const structural = (l: Line): boolean => ARTICLE.test(l.key) || PART.test(l.key) || CHAPTER.test(l.key);

  /**
   * The title of a part or chapter: the lines after its heading and before the next piece of
   * structure, at most two -- the decree's chapter 4 is "ການອະນຸຍາດ ແລະ ການດຳເນີນ ການຂົນສົ່ງ..."
   * over two lines -- skipping debris the scan left between them. How many lines it took is
   * returned so they are written as prose and not read again.
   */
  const titleAfter = (i: number): { title: string | null; used: number } => {
    const parts: string[] = [];
    let used = 0;
    for (let j = i + 1; j < signature && j <= i + 3; j += 1) {
      const l = lines[j]!;
      if (structural(l)) break;
      used += 1;
      if (isDebris(l.text)) continue;
      // Trailing specks the scan left: "ບົດບັນຍັດທົ່ວໄປ ."
      parts.push(l.key.replace(/[\s.,·:;'"|/\\]+$/u, ''));
      if (parts.length === 2) break;
    }
    // Only a title if structure follows it: two lines of body after a heading are body.
    const next = lines[i + 1 + used];
    if (parts.length === 0 || (next && !structural(next) && parts.length === 2)) {
      return parts.length ? { title: parts[0]!, used: used - (parts.length === 2 ? 1 : 0) } : { title: null, used };
    }
    const title = parts.join(' ');
    return title.length <= 200 ? { title, used } : { title: null, used: 0 };
  };

  for (let i = 0; i < signature; i += 1) {
    const l = lines[i]!;

    const b = blockAt.get(i);
    if (b !== undefined) {
      close();
      block = containers[b] ?? null;
      part = null;
      partCount = 0;
      chapter = null;
    }

    if (PART.test(l.key)) {
      close();
      partCount += 1;
      const { title, used } = titleAfter(i);
      // The Roman numeral does not survive OCR; the order of the parts is the numbering.
      part = `ພາກທີ ${partCount}${title ? ` ${title}` : ''}`;
      chapter = null;
      for (let j = i; j <= i + used; j += 1) builder.addProse(lines[j]!.text);
      i += used;
      continue;
    }

    const c = CHAPTER.exec(l.key);
    if (c) {
      close();
      const { title, used } = titleAfter(i);
      chapter = `ໝວດທີ ${ascii(c[1]!)}${title ? ` ${title}` : ''}`;
      for (let j = i; j <= i + used; j += 1) builder.addProse(lines[j]!.text);
      i += used;
      continue;
    }

    const label = labelAt.get(i);
    if (label !== undefined) {
      close();
      open = { label, heading: l.text, body: [], page: l.page };
      continue;
    }

    if (open) open.body.push(l.text);
    else builder.addProse(l.text);
  }
  close();
  for (const l of lines.slice(signature)) builder.addProse(l.text);

  return { builder, inferred, dropped };
}
