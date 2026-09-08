/**
 * Derive the indicator model from ESCAP's own documents.
 *
 *   docs/database/ESCAP-RDTII-2.1_ Round 1 Database.xlsx   sheet "RDTII 2.1 Methodology"
 *   docs/framework/ESCAP-RDTII-2.1- Non-regulatory indicators.md
 *   docs/finals/OUTPUT_TEMPLATE_FINAL_ROUND.md             sheet "Indicator Reference"
 *
 * Nothing here is transcribed by hand. If ESCAP corrects their methodology sheet, this script is
 * re-run and the rubric changes with it. Every field lands in data/rubric.json with provenance
 * naming the document and the row it came from.
 *
 * The script asserts loudly rather than guessing. A criteria cell whose bands do not line up with
 * its scores, an indicator ID that arrived as a number, a non-regulatory indicator that turned up
 * in the regulatory sheet -- each of those is a finding about the source, printed and counted, not
 * quietly smoothed over.
 *
 *   npm run -w backend derive-rubric
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import type { Indicator, IndicatorShape, Pillar, Rubric, ScoreBand } from '../src/rubric/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..');
const repoRoot = join(backendRoot, '..');
const docs = join(repoRoot, 'docs');

const METHODOLOGY_XLSX = join(docs, 'database', 'ESCAP-RDTII-2.1_ Round 1 Database.xlsx');
const METHODOLOGY_SHEET = 'RDTII 2.1 Methodology';
const NON_REGULATORY_MD = join(docs, 'framework', 'ESCAP-RDTII-2.1- Non-regulatory indicators.md');
const OUTPUT_TEMPLATE_MD = join(docs, 'finals', 'OUTPUT_TEMPLATE_FINAL_ROUND.md');

/** ESCAP counts 61 regulatory indicators and 14 non-regulatory ones. Both are asserted below. */
const EXPECTED_REGULATORY = 61;
const EXPECTED_NON_REGULATORY = 14;

/**
 * Indicator shape, with the sentence from ESCAP that assigns it.
 *
 * Everything not named here is provision-level, which is the overwhelming majority. These are the
 * exceptions, and they are exceptions because ESCAP says so in as many words.
 */
const SHAPE_OVERRIDES: Record<string, { shape: IndicatorShape; basis: string }> = {
  '7.1': {
    shape: 'framework',
    basis:
      'OUTPUT_TEMPLATE Indicator Reference, pillar 7: 7.1 and 7.2 are answered once for the ' +
      'economy. Citing individual provisions against them "are not discoveries and score zero".',
  },
  '7.2': {
    shape: 'framework',
    basis:
      'OUTPUT_TEMPLATE Indicator Reference, pillar 7: 7.1 and 7.2 are answered once for the ' +
      'economy. Citing individual provisions against them "are not discoveries and score zero".',
  },
  '8.1': {
    shape: 'framework',
    basis:
      'METHODOLOGY band text for 8.1: "No intermediary liability framework in place" / "Sectoral ' +
      'framework in place" / "Horizontal framework in place". The question is about a framework, ' +
      'and its absence is the top band, which no single provision can evidence.',
  },
  '8.2': {
    shape: 'framework',
    basis:
      'METHODOLOGY band text for 8.2: identical to 8.1, over illegal activity other than ' +
      'copyright infringement.',
  },
  '12.9': {
    shape: 'framework',
    basis:
      'METHODOLOGY band text for 12.9: "No consumer protection legal framework applicable to ' +
      'online commerce" / "Consumer protection law applicable to online commerce".',
  },
  '3.4': {
    shape: 'practice',
    basis:
      'ESCAP-RDTII-2.1 guide: 3.4 scores on whether a screening mechanism has actually been used ' +
      'to block an investment, so documented cases and official reports are admissible evidence.',
  },
  '5.3': {
    shape: 'practice',
    basis:
      'ESCAP-RDTII-2.1 guide: 5.3 turns on observed market practice rather than statutory text, ' +
      'so official reports are admissible alongside primary law.',
  },
  '9.1': {
    shape: 'practice',
    basis:
      'ESCAP-RDTII-2.1 guide: 9.1 turns on observed blocking practice rather than statutory text, ' +
      'so official reports and documented cases are admissible alongside primary law.',
  },
};

/**
 * Two kinds of thing go wrong here, and they deserve different treatment.
 *
 * A 'note' is a quirk of ESCAP's own documents that we have understood and accounted for. It is
 * printed every run so it stays visible, but it does not fail anything.
 *
 * A 'defect' means the rubric we just wrote cannot be trusted -- the indicator count is wrong, a
 * scoring cell would not parse, a non-regulatory indicator leaked into scope. Those fail the run,
 * because every downstream cell count depends on this file being right.
 */
type Severity = 'note' | 'defect';
const findings: { severity: Severity; message: string }[] = [];
function note(message: string): void {
  findings.push({ severity: 'note', message });
}
function defect(message: string): void {
  findings.push({ severity: 'defect', message });
}

/** A cell as ESCAP stored it, with no numeric coercion anywhere on the path. */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join('').trim();
    }
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return String(v.result ?? '').trim();
  }
  return String(v).trim();
}

/** Collapse the whitespace a spreadsheet cell carries without touching the words. */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Split ESCAP's criteria prose into bands.
 *
 * The markers are "1)", "2)", ... and the same shape occurs twice inside the prose itself, both
 * times in cells we cannot afford to mangle:
 *
 *   - indicator 1.4 ends "(0.25 for each measure, up to 1)". Handled by scanning strictly in
 *     sequence -- having found "5)" we only ever look for "6)", so a trailing "1)" is invisible.
 *   - indicator 6.2 band 1 ends "OR more than one measure in category (2)", a cross-reference to
 *     its own band 2 and the clause its score function turns on. Handled by requiring whitespace
 *     before the digit, which "(2)" does not have.
 */
function splitCriteria(text: string): string[] {
  const parts: string[] = [];
  let cursor = 0;
  let n = 1;
  let startOfCurrent = -1;

  for (;;) {
    const marker = new RegExp(`(?:^|\\s)${n}\\s*\\)`, 'g');
    marker.lastIndex = cursor;
    const hit = marker.exec(text);
    if (!hit) break;
    const markerEnd = hit.index + hit[0].length;
    if (startOfCurrent >= 0) parts.push(tidy(text.slice(startOfCurrent, hit.index)));
    startOfCurrent = markerEnd;
    cursor = markerEnd;
    n += 1;
  }
  if (startOfCurrent >= 0) parts.push(tidy(text.slice(startOfCurrent)));
  return parts.filter((p) => p.length > 0);
}

/** "1 0.75 0.50 0.25 0" -- possibly newline separated, possibly a lone number. */
function splitScores(text: string): number[] {
  return tidy(text)
    .split(/[\s,]+/)
    .filter((t) => /^-?\d+(\.\d+)?$/.test(t))
    .map(Number);
}

function buildBands(criteriaText: string, scoresText: string, id: string): ScoreBand[] {
  const criteria = splitCriteria(criteriaText);
  const scores = splitScores(scoresText);

  if (criteria.length === 0) {
    defect(`${id}: criteria cell produced no bands. Cell was: ${tidy(criteriaText).slice(0, 120)}`);
    return [];
  }
  if (criteria.length !== scores.length) {
    defect(
      `${id}: ${criteria.length} criteria bands but ${scores.length} scores ` +
        `(${scores.join(', ')}). Bands recorded without scores rather than guessed at.`,
    );
    return criteria.map((criterion, i) => ({ score: Number.NaN, criterion, ordinal: i + 1 }));
  }
  return criteria.map((criterion, i) => ({ score: scores[i]!, criterion, ordinal: i + 1 }));
}

/** Carve the "Exception: ..." clause out of the policy-issue text. */
function splitException(category: string): { category: string; exception: string | null } {
  const m = category.match(/\bException[s]?\s*:\s*/i);
  if (!m || m.index === undefined) return { category: tidy(category), exception: null };
  return {
    category: tidy(category.slice(0, m.index)),
    exception: tidy(category.slice(m.index + m[0].length)),
  };
}

/**
 * The fourteen indicators ESCAP draws from WITS, V-Dem and treaty participation lists.
 *
 * The PDF extraction interleaves the ID column with the description column, so the IDs are read
 * off the line starts and the count is asserted rather than trusted.
 */
function readNonRegulatory(): { ids: string[]; locator: string } {
  const text = readFileSync(NON_REGULATORY_MD, 'utf8');
  const ids: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{1,2}\.\d{1,2})(?:\s|$)/);
    if (m && !ids.includes(m[1]!)) ids.push(m[1]!);
  }
  if (ids.length !== EXPECTED_NON_REGULATORY) {
    defect(
      `Non-regulatory list: read ${ids.length} indicator IDs, expected ${EXPECTED_NON_REGULATORY}. ` +
        `Read: ${ids.join(', ')}`,
    );
  }
  return { ids, locator: 'the non-regulatory indicator table' };
}

/** Cross-check the IDs against the finals Indicator Reference sheet, which is independent. */
function readTemplateIds(): Set<string> {
  const text = readFileSync(OUTPUT_TEMPLATE_MD, 'utf8');
  const ids = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*\|\s*(\d{1,2}(?:\.\d{1,2}){1,2})\s*\|/);
    if (m) ids.add(m[1]!);
  }
  return ids;
}

async function main(): Promise<void> {
  const derivedAt = new Date().toISOString();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(METHODOLOGY_XLSX);
  const sheet = wb.getWorksheet(METHODOLOGY_SHEET);
  if (!sheet) throw new Error(`Sheet "${METHODOLOGY_SHEET}" not found in ${METHODOLOGY_XLSX}`);

  const methodologyDoc = relative(repoRoot, METHODOLOGY_XLSX).replace(/\\/g, '/');
  const indicators: Indicator[] = [];
  const pillarOrder: number[] = [];
  const pillarNames = new Map<number, string>();
  const pillarIndicators = new Map<number, string[]>();

  let currentPillar: { id: number; name: string } | null = null;

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return; // header

    const a = cellText(row.getCell(1)); // Pillar_ID
    const bCell = row.getCell(2); // Indicator_ID, or the pillar name on a pillar row
    const b = cellText(bCell);

    // A pillar row: the pillar number in column A, its name in column B.
    if (/^\d+$/.test(a) && b && !/^\d/.test(b)) {
      currentPillar = { id: Number(a), name: tidy(b) };
      if (!pillarNames.has(currentPillar.id)) {
        pillarNames.set(currentPillar.id, currentPillar.name);
        pillarIndicators.set(currentPillar.id, []);
        pillarOrder.push(currentPillar.id);
      }
      return;
    }

    if (!b) return; // spacer row

    // An indicator row.
    // ESCAP's own template warns that "entered as a number, 12.10 collapses to 12.1 and 4.01 to
    // 4.1, and the two are different indicators". Most cells in this sheet are in fact numeric, so
    // the storage type alone says nothing. What betrays a lost trailing zero is an ID that sorts
    // *backwards* against the one above it inside the same pillar.
    if (typeof bCell.value === 'number' && currentPillar) {
      const siblings = pillarIndicators.get(currentPillar.id) ?? [];
      const previous = siblings[siblings.length - 1];
      if (previous !== undefined && Number(b) < Number(previous)) {
        note(
          `${b} appears after ${previous} in pillar ${currentPillar.id}, which is out of order. ` +
            `Stored as a number, its true label is almost certainly ${b}0. ESCAP's finals ` +
            `Indicator Reference ships the same collapsed label, so it is kept verbatim here and ` +
            `the export will match their sheet.`,
        );
      }
    }
    if (!currentPillar) {
      defect(`Row ${rowNumber}: indicator "${b}" appears before any pillar heading. Skipped.`);
      return;
    }

    const id = b;
    const rawCategory = cellText(row.getCell(3));
    const criteriaText = cellText(row.getCell(4));
    const scoresText = cellText(row.getCell(5));
    const { category, exception } = splitException(rawCategory);

    if (!category) defect(`${id}: no policy-issue text.`);
    if (!criteriaText) defect(`${id}: no scoring criteria.`);

    const override = SHAPE_OVERRIDES[id];
    indicators.push({
      id,
      pillarId: currentPillar.id,
      pillarName: currentPillar.name,
      category,
      exception,
      criteriaText: tidy(criteriaText),
      bands: buildBands(criteriaText, scoresText, id),
      shape: override?.shape ?? 'provision',
      shapeBasis:
        override?.basis ??
        'Default. A specific provision in a specific instrument answers this indicator.',
      provenance: {
        document: methodologyDoc,
        locator: `sheet "${METHODOLOGY_SHEET}", row ${rowNumber}`,
      },
    });
    pillarIndicators.get(currentPillar.id)!.push(id);
  });

  // --- checks against the other two documents -------------------------------------------------

  const nonRegulatory = readNonRegulatory();
  const ids = new Set(indicators.map((i) => i.id));

  for (const nr of nonRegulatory.ids) {
    if (ids.has(nr)) {
      defect(
        `${nr} is listed as non-regulatory but also appears in the methodology sheet. ` +
          `ESCAP states no extraction tool is required for it.`,
      );
    }
  }

  if (indicators.length !== EXPECTED_REGULATORY) {
    defect(
      `Read ${indicators.length} regulatory indicators, expected ${EXPECTED_REGULATORY}. ` +
        `The scope of the whole run depends on this number.`,
    );
  }

  const templateIds = readTemplateIds();
  if (templateIds.size > 0) {
    const missingFromTemplate = [...ids].filter((i) => !templateIds.has(i));
    const missingFromMethodology = [...templateIds].filter(
      (i) => !ids.has(i) && !nonRegulatory.ids.includes(i),
    );
    if (missingFromTemplate.length) {
      defect(
        `In the methodology sheet but not the finals Indicator Reference: ` +
          missingFromTemplate.join(', '),
      );
    }
    if (missingFromMethodology.length) {
      defect(
        `In the finals Indicator Reference but neither regulatory nor listed non-regulatory: ` +
          missingFromMethodology.join(', '),
      );
    }
  }

  const withoutBands = indicators.filter((i) => i.bands.length === 0);
  const withoutScores = indicators.filter((i) => i.bands.some((b) => Number.isNaN(b.score)));

  // --- write ----------------------------------------------------------------------------------

  const pillars: Pillar[] = pillarOrder.map((id) => ({
    id,
    name: pillarNames.get(id)!,
    indicatorIds: pillarIndicators.get(id)!,
  }));

  const rubric: Rubric = {
    version: '2.1',
    derivedAt,
    pillars,
    indicators,
    nonRegulatory: nonRegulatory.ids,
    sources: [
      { document: methodologyDoc, locator: `sheet "${METHODOLOGY_SHEET}"` },
      {
        document: relative(repoRoot, NON_REGULATORY_MD).replace(/\\/g, '/'),
        locator: nonRegulatory.locator,
      },
      {
        document: relative(repoRoot, OUTPUT_TEMPLATE_MD).replace(/\\/g, '/'),
        locator: 'sheet "Indicator Reference" (cross-check only)',
      },
    ],
  };

  const out = join(backendRoot, 'data', 'rubric.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(rubric, null, 2) + '\n', 'utf8');

  // --- report ---------------------------------------------------------------------------------

  console.log(`rubric written to ${relative(repoRoot, out).replace(/\\/g, '/')}`);
  console.log(`  ${pillars.length} pillars, ${indicators.length} regulatory indicators`);
  console.log(`  ${nonRegulatory.ids.length} non-regulatory indicators recorded and excluded`);
  console.log(
    `  shapes: ${indicators.filter((i) => i.shape === 'provision').length} provision, ` +
      `${indicators.filter((i) => i.shape === 'framework').length} framework, ` +
      `${indicators.filter((i) => i.shape === 'practice').length} practice`,
  );
  console.log(
    `  bands: ${indicators.length - withoutBands.length} indicators parsed into score bands` +
      (withoutBands.length ? `, ${withoutBands.length} with none` : '') +
      (withoutScores.length ? `, ${withoutScores.length} with unmatched scores` : ''),
  );
  for (const p of pillars) {
    console.log(`    pillar ${String(p.id).padStart(2)}  ${p.indicatorIds.length
      .toString()
      .padStart(2)} indicators  ${p.name}`);
  }

  const notes = findings.filter((f) => f.severity === 'note');
  const defects = findings.filter((f) => f.severity === 'defect');

  if (notes.length) {
    console.log(`\n${notes.length} note(s) about ESCAP's source documents:`);
    for (const f of notes) console.log(`  - ${f.message}`);
  }
  if (defects.length) {
    console.log(`\n${defects.length} DEFECT(s) -- the rubric above is not trustworthy:`);
    for (const f of defects) console.log(`  - ${f.message}`);
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
