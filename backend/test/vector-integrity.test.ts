/**
 * A dense index that is not what it claims to be.
 *
 * The matrix is sized from the first row's `dims` and every other row is copied into it on trust.
 * A row of the wrong width left the rest of its slot as zeros -- a vector that matches nothing and
 * is silently ranked last -- or spilled into its neighbour's slot, so one section's embedding
 * became two sections' halves. A NaN anywhere poisons every dot product it enters, and the search
 * still returns a ranking, with no sign that it is meaningless.
 *
 * None of that is recoverable at query time. It is a corrupt index, and it has to say so.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { loadVectors } from '../src/index/index.js';

const MODEL = 'test-embed';

function indexOf(vectors: (number[] | Buffer)[], dims = 4) {
  const db = openDb(':memory:');
  db.pragma('foreign_keys = OFF');
  const insert = db.prepare('INSERT INTO section_embedding (section_id, model, dims, vector) VALUES (?, ?, ?, ?)');
  vectors.forEach((v, i) => {
    const blob = Buffer.isBuffer(v) ? v : Buffer.from(Float32Array.from(v).buffer);
    insert.run(i + 1, MODEL, dims, blob);
  });
  return db;
}

describe('loading the dense index', () => {
  it('loads an index whose rows all agree', () => {
    const db = indexOf([[1, 0, 0, 0], [0, 1, 0, 0]]);
    const loaded = loadVectors(db, { model: MODEL });
    expect(loaded.dims).toBe(4);
    expect(Array.from(loaded.ids)).toEqual([1, 2]);
    expect(loaded.matrix.length).toBe(8);
    db.close();
  });

  it('answers with an empty index where nothing is embedded, rather than throwing', () => {
    const db = openDb(':memory:');
    expect(loadVectors(db, { model: MODEL })).toEqual({ ids: new Int32Array(0), matrix: new Float32Array(0), dims: 0 });
    db.close();
  });

  it('refuses a vector with fewer bytes than its row claims', () => {
    const db = indexOf([[1, 0, 0, 0], Buffer.from(Float32Array.from([0, 1]).buffer)]);
    expect(() => loadVectors(db, { model: MODEL })).toThrow(/section 2/);
    expect(() => loadVectors(db, { model: MODEL })).toThrow(/re-embed before searching/);
    db.close();
  });

  it('refuses a vector with more bytes than its row claims, which would spill into the next', () => {
    const db = indexOf([[1, 0, 0, 0], Buffer.from(Float32Array.from([0, 1, 0, 0, 1, 1]).buffer)]);
    expect(() => loadVectors(db, { model: MODEL })).toThrow(/section 2/);
    db.close();
  });

  it('refuses an index whose rows disagree about how wide a vector is', () => {
    const db = openDb(':memory:');
    db.pragma('foreign_keys = OFF');
    const insert = db.prepare('INSERT INTO section_embedding (section_id, model, dims, vector) VALUES (?, ?, ?, ?)');
    insert.run(1, MODEL, 4, Buffer.from(Float32Array.from([1, 0, 0, 0]).buffer));
    insert.run(2, MODEL, 2, Buffer.from(Float32Array.from([0, 1]).buffer));
    expect(() => loadVectors(db, { model: MODEL })).toThrow(/2 dims.*4 dims/s);
    db.close();
  });

  it('refuses a vector holding a NaN, which would poison every score it touched', () => {
    const db = indexOf([[1, 0, 0, 0], [0, NaN, 0, 0]]);
    expect(() => loadVectors(db, { model: MODEL })).toThrow(/non-finite/);
    db.close();
  });

  it('refuses a vector holding an infinity', () => {
    const db = indexOf([[1, 0, 0, 0], [0, Infinity, 0, 0]]);
    expect(() => loadVectors(db, { model: MODEL })).toThrow(/section 2/);
    db.close();
  });
});
