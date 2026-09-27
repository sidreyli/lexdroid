/**
 * The same law registered twice does not have to be the same bytes.
 *
 * `duplicateRegistrations` pairs on the content hash, so it sees a second copy only where the two
 * files are byte-identical. The same order reaches the register twice more often than that: the
 * gazette walk takes the numbered PDF, a portal serves its own rendering, and the two differ in a
 * timestamp or a font and hash apart. Malaysia's customs import prohibition is registered as
 * "P.U. (A) 117/2023" and again with no number at all, and the last Malaysian run handed 547
 * provisions to a cell twice under two names -- which is a counting fault before it is a wasted
 * read, because several bands turn on how many measures an economy has.
 *
 * What must not happen is the other way round: the sales tax exemption orders of 2018, 2022 and
 * 2025 repeat whole schedules, and the Islamic and conventional electronic money exemptions are
 * drafted in parallel. Both of those state a number, so both are kept.
 */
import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { duplicateProvisions } from '../src/retrieve/index.js';

function corpus(): {
  db: ReturnType<typeof openDb>;
  add: (title: string, num: string | null, status: string, texts: string[]) => number[];
} {
  const db = openDb(':memory:');
  db.prepare("INSERT INTO economy (code, name, official_languages) VALUES ('MYS','Malaysia','[\"ms\",\"en\"]')").run();
  let seq = 0;
  const add = (title: string, num: string | null, status: string, texts: string[]): number[] => {
    seq += 1;
    const instrumentId = Number(
      db
        .prepare(
          `INSERT INTO instrument (economy_code, title, official_number, kind, status, source_url, discovered_via, discovered_at)
             VALUES ('MYS', ?, ?, 'order', ?, ?, 'test', '2026-09-07')`,
        )
        .run(title, num, status, `https://x/${seq}`).lastInsertRowid,
    );
    // A different hash on purpose: these are two renderings of one order, not one file twice.
    const documentId = Number(
      db
        .prepare(
          `INSERT INTO document (instrument_id, url, content_hash, media_type, bytes, http_status, fetched_at, extraction, section_count)
             VALUES (?, ?, ?, 'application/pdf', 10, 200, '2026-09-07', 'pdf-text', ?)`,
        )
        .run(instrumentId, `https://x/${seq}.pdf`, `hash-${seq}`, texts.length).lastInsertRowid,
    );
    const ids: number[] = [];
    texts.forEach((text, ordinal) => {
      ids.push(
        Number(
          db
            .prepare(
              `INSERT INTO section (document_id, ordinal, label, heading_path, text, char_start, char_end)
                 VALUES (?, ?, ?, 'Part I', ?, 0, ?)`,
            )
            .run(documentId, ordinal, String(ordinal + 1), text, text.length).lastInsertRowid,
        ),
      );
    });
    return ids;
  };
  return { db, add };
}

const PROHIBITION = 'The goods specified in the Second Schedule are absolutely prohibited from being imported.';
const COMMENCEMENT = 'This Order comes into operation on 1 January 2023.';

describe('a provision repeated by a registration that names nothing', () => {
  it('retires the copy whose source stated neither an identifier nor a standing', () => {
    const { db, add } = corpus();
    const [gazetted] = add('CUSTOMS (PROHIBITION OF IMPORTS) ORDER 2023', 'P.U. (A) 117/2023', 'in-force', [PROHIBITION]);
    const [portal] = add('Perintah Kastam (Larangan Mengenai Import) 2023', null, 'unknown', [PROHIBITION]);
    const retired = duplicateProvisions(db, 'MYS');
    expect(retired.has(portal!)).toBe(true);
    expect(retired.has(gazetted!)).toBe(false);
  });

  it('keeps both where each states an identifier, so parallel law is not collapsed', () => {
    const { db, add } = corpus();
    const [conventional] = add('FINANCIAL SERVICES (LIMITED PURPOSE ELECTRONIC MONEY) (EXEMPTION) ORDER 2024', 'P.U. (A) 463/2024', 'in-force', [PROHIBITION]);
    const [islamic] = add('ISLAMIC FINANCIAL SERVICES (LIMITED PURPOSE ELECTRONIC MONEY) (EXEMPTION) ORDER 2024', 'P.U. (A) 461/2024', 'in-force', [PROHIBITION]);
    const retired = duplicateProvisions(db, 'MYS');
    expect(retired.has(conventional!)).toBe(false);
    expect(retired.has(islamic!)).toBe(false);
  });

  it('retires only the provisions the identified copy already holds', () => {
    const { db, add } = corpus();
    add('CUSTOMS (PROHIBITION OF IMPORTS) ORDER 2023', 'P.U. (A) 117/2023', 'in-force', [PROHIBITION]);
    const portal = add('Perintah Kastam (Larangan Mengenai Import) 2023', null, 'unknown', [PROHIBITION, COMMENCEMENT]);
    const retired = duplicateProvisions(db, 'MYS');
    expect(retired.has(portal[0]!)).toBe(true);
    // The identified copy does not hold this one, so nothing matches it and it survives.
    expect(retired.has(portal[1]!)).toBe(false);
  });

  it('leaves a bare registration alone where its words are its own', () => {
    const { db, add } = corpus();
    add('CUSTOMS (PROHIBITION OF IMPORTS) ORDER 2023', 'P.U. (A) 117/2023', 'in-force', [PROHIBITION]);
    const other = add('Guideline on Something Else', null, 'unknown', ['A registrant shall keep its contact details current.']);
    expect(duplicateProvisions(db, 'MYS').has(other[0]!)).toBe(false);
  });

  it('keeps the bare copy where every identified copy is suppressed by another rule', () => {
    const { db, add } = corpus();
    // 180 Malaysian provisions were in this position: the gazette copy retired as a second-language
    // copy or a heading, leaving the bare registration the only place the words were still readable.
    const gazetted = add('CUSTOMS (PROHIBITION OF IMPORTS) ORDER 2023', 'P.U. (A) 117/2023', 'in-force', [PROHIBITION]);
    const portal = add('Perintah Kastam (Larangan Mengenai Import) 2023', null, 'unknown', [PROHIBITION]);
    const retired = duplicateProvisions(db, 'MYS', new Set([gazetted[0]!]));
    expect(retired.has(portal[0]!)).toBe(false);
  });

  it('does not pair a provision with another in the same instrument', () => {
    const { db, add } = corpus();
    const both = add('Some Portal Page', null, 'unknown', [PROHIBITION, PROHIBITION]);
    const retired = duplicateProvisions(db, 'MYS');
    expect(retired.has(both[0]!)).toBe(false);
    expect(retired.has(both[1]!)).toBe(false);
  });
});
