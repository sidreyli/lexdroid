/**
 * A crossing allowed only against a licence is a requirement to hold one, and binds every importer.
 */
import { describe, expect, it } from 'vitest';
import { confinesPermission } from '../src/decide/index.js';

const f = (quote: string) => ({ dutyAct: null, quote });

describe('a permission confined to licence holders', () => {
  it('is a requirement to hold the licence', () => {
    expect(confinesPermission(f('Import of Laptops falling under HSN 8471 shall be "Restricted" and their import would be allowed against a valid Licence for Restricted Imports'))).toBe(true);
    expect(confinesPermission(f('the goods may be exported subject to a permit issued by the Director-General'))).toBe(false);
    expect(confinesPermission(f('the goods are permitted subject to an approval of the Authority'))).toBe(true);
  });

  it('is not every mention of a licence', () => {
    expect(confinesPermission(f('shall be the sole licence held by the licensee in respect of the content applications services authorised under the licence'))).toBe(false);
  });
});
