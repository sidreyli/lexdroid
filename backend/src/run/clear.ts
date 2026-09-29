/**
 * Clearing the slate before the live hour: ESCAP checklist item 26, "cache and downloaded-document
 * folders can be cleared on screen before the clock starts".
 *
 * An economy already in the store would never be downloaded again. `materialise` reads only an
 * instrument it has no document for, which is the right rule for every other run and exactly the
 * wrong one here: the Run Record's document list is the hard check on the day, and a run over a
 * warm corpus lists nothing and scores zero on discovery however well it reads. So clearing is not
 * emptying a folder. It takes the economy out of the working store -- its register, its documents
 * and what was parsed from them, and every run over it -- and it empties the download cache, so the
 * run that follows walks the portals, fetches the law and reads it with the clock running.
 *
 * Destructive by design, and meant for the store the live test runs in. Runs that covered other
 * economies as well lose only this economy's cells. Other economies are not touched.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from '../db/index.js';
import { cachePath } from '../engines/cache.js';
import { CACHE_DIR } from '../fetch/index.js';

export interface ClearResult {
  economies: string[];
  runs: number;
  cells: number;
  instruments: number;
  documents: number;
  sections: number;
  /** Files taken out of the download cache, which holds every economy's pages. */
  cacheFiles: number;
  engineCacheCleared: boolean;
}

/** What clearing would take away, without taking it. */
export function clearPlan(
  db: Db,
  economies: readonly string[],
  cacheDir: string = CACHE_DIR,
): Omit<ClearResult, 'engineCacheCleared'> {
  const codes = economies.map((e) => e.toUpperCase());
  const count = (sql: string) => codes.reduce((t, c) => t + (db.prepare(sql).get(c) as { n: number }).n, 0);
  return {
    economies: codes,
    runs: runsOnlyOver(db, codes).length,
    cells: count('SELECT COUNT(*) AS n FROM cell WHERE economy_code = ?'),
    instruments: count('SELECT COUNT(*) AS n FROM instrument WHERE economy_code = ?'),
    documents: count('SELECT COUNT(*) AS n FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?'),
    sections: count(
      'SELECT COUNT(*) AS n FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?',
    ),
    cacheFiles: cacheFiles(cacheDir).length,
  };
}

export function clearEconomies(db: Db, economies: readonly string[], cacheDir: string = CACHE_DIR): ClearResult {
  const plan = clearPlan(db, economies, cacheDir);
  const codes = plan.economies;
  db.transaction(() => {
    for (const code of codes) {
      // The lexical index is contentless, so it has no foreign key to follow; its rows go by hand.
      const ids = db
        .prepare(
          'SELECT s.id FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?',
        )
        .pluck()
        .all(code) as number[];
      const unindex = db.prepare('DELETE FROM section_fts WHERE rowid = ?');
      for (const id of ids) unindex.run(id);
      // Cells first: a finding's basis names its section and instrument without a cascade, and the
      // cell is what owns it.
      db.prepare('DELETE FROM cell WHERE economy_code = ?').run(code);
    }
    for (const id of runsOnlyOver(db, codes)) db.prepare('DELETE FROM run WHERE id = ?').run(id);
    // The economy row owns its register, and the register owns everything fetched and parsed.
    for (const code of codes) db.prepare('DELETE FROM economy WHERE code = ?').run(code);
  })();

  const files = cacheFiles(cacheDir);
  for (const f of files) rmSync(f, { force: true });
  const engineCache = cachePath();
  const engineCacheCleared = existsSync(engineCache);
  if (engineCacheCleared) rmSync(engineCache, { force: true });
  return { ...plan, cacheFiles: files.length, engineCacheCleared };
}

/** Runs about nothing but the economies being cleared; a run over others keeps its record. */
function runsOnlyOver(db: Db, codes: readonly string[]): string[] {
  const rows = db.prepare('SELECT id, economies FROM run').all() as { id: string; economies: string }[];
  return rows
    .filter((r) => {
      let list: string[];
      try {
        list = (JSON.parse(r.economies) as string[]).map((e) => String(e).toUpperCase());
      } catch {
        return false;
      }
      return list.length > 0 && list.every((e) => codes.includes(e));
    })
    .map((r) => r.id);
}

function cacheFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}
