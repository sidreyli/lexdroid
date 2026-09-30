/**
 * Adding an economy is adding a profile, and nothing else.
 *
 * The defect this exists for: India had a written profile and a working discovery adapter, but
 * economy codes were translated into names through a list of three pairs written by hand. A code
 * absent from that list fell through to itself and quietly matched nothing.
 *
 * The failure is quiet in the worst way: nothing throws and no count is short. So the rule is
 * tested as a rule --
 * every profile carries its own name, and no name is written down twice.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { availableProfiles, economyNames, loadProfile, PROFILE_DIR } from '../src/profile/index.js';

describe('economy names come from the profiles', () => {
  it('names every economy that has a profile', () => {
    const names = economyNames();
    for (const code of availableProfiles()) {
      expect(names.get(code.toUpperCase())).toBe(loadProfile(code).name);
    }
  });

  it('includes the fourth economy, which is the one the hardcoded list forgot', () => {
    expect(economyNames().get('IND')).toBe('India');
  });

  it('keys by the uppercase code, because that is what a cell stores', () => {
    for (const key of economyNames().keys()) expect(key).toBe(key.toUpperCase());
  });

  /**
   * A regression guard with teeth: the point is not that these three names are absent, it is that
   * no source file enumerates the economies we happen to have. A fourth economy that has to be
   * added to a list in two places will be added to one.
   */
  it('is not written down again anywhere under src or scripts', () => {
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
          continue;
        }
        if (!entry.name.endsWith('.ts')) continue;
        // The scratch scripts are a workbench, not the product.
        if (entry.name.startsWith('_tmp_')) continue;
        const text = readFileSync(path, 'utf8');
        for (const line of text.split('\n')) {
          // Two or more economy names paired with their codes on one line is a lookup table.
          const named = ['Australia', 'India', 'Malaysia', 'Singapore'].filter((n) => line.includes(`'${n}'`));
          if (named.length >= 2) offenders.push(`${path}: ${line.trim()}`);
        }
      }
    };
    walk(join(PROFILE_DIR, '..', '..', 'src'));
    walk(join(PROFILE_DIR, '..', '..', 'scripts'));
    expect(offenders).toEqual([]);
  });
});
