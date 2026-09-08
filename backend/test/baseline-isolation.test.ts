/**
 * The baseline quarantine, enforced.
 *
 * ESCAP's completed databases answer the questions we are being marked on. If discovery could see
 * them, every instrument would be tagged KNOWN by construction and the tool would look accurate on
 * the three economies they have already done -- then collapse on the sealed live-test economy,
 * which is the one that counts.
 *
 * So: no module under src/ may reach src/baseline, except src/baseline itself and the evaluator.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(here, '..');
const srcRoot = join(backendRoot, 'src');

/** The only places allowed to know the baseline exists. */
const ALLOWED = ['baseline', 'eval'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js|sql)$/.test(entry)) out.push(full);
  }
  return out;
}

function topLevelModule(file: string): string {
  return relative(srcRoot, file).split(sep)[0] ?? '';
}

/**
 * A module's code with its comments removed.
 *
 * A comment saying why the boundary exists -- "this is deliberately not read from ESCAP's legal
 * inventory" -- is exactly the documentation we want, and must not be what fails the test. Only
 * code that actually reaches for the sample kit should.
 */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*--.*$/gm, '')
    .replace(/\/\/.*$/gm, '');
}

const files = walk(srcRoot);
const pipelineFiles = files.filter((f) => !ALLOWED.includes(topLevelModule(f)));

describe('the baseline is not reachable from the pipeline', () => {
  it('has pipeline modules to check', () => {
    // Guards against the test passing because the walk found nothing.
    expect(pipelineFiles.length).toBeGreaterThan(0);
  });

  it('no pipeline module imports src/baseline', () => {
    const offenders: string[] = [];
    for (const file of pipelineFiles) {
      const body = readFileSync(file, 'utf8');
      if (/(?:from|require\s*\()\s*['"][^'"]*baseline[^'"]*['"]/.test(body)) {
        offenders.push(relative(backendRoot, file));
      }
    }
    expect(offenders, `these modules import the baseline: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no pipeline module names the baseline database file', () => {
    const offenders: string[] = [];
    for (const file of pipelineFiles) {
      if (/baseline\.db|BASELINE_DB_PATH/.test(code(file))) {
        offenders.push(relative(backendRoot, file));
      }
    }
    expect(offenders, `these modules reach for baseline.db: ${offenders.join(', ')}`).toEqual([]);
  });

  it('no pipeline module reads ESCAP\'s completed databases directly', () => {
    const offenders: string[] = [];
    for (const file of pipelineFiles) {
      if (/Round [12] Database|Legal Inventory/i.test(code(file))) offenders.push(relative(backendRoot, file));
    }
    expect(offenders, `these modules read the sample kit: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the working store and the baseline store are different files', async () => {
    const { WORKING_DB_PATH } = await import('../src/db/index.js');
    const { BASELINE_DB_PATH } = await import('../src/baseline/index.js');
    expect(WORKING_DB_PATH).not.toBe(BASELINE_DB_PATH);
  });

  it('the working schema defines no baseline table', () => {
    const schema = readFileSync(join(srcRoot, 'db', 'schema.sql'), 'utf8')
      .replace(/^\s*--.*$/gm, '');
    expect(schema).not.toMatch(/CREATE TABLE[^;]*baseline/i);
  });
});
