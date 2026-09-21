/**
 * Telling an instrument from anything else when the title is not in English.
 *
 * The defect, and it is the one that decides whether a non-English economy produces anything at
 * all: `instrumentTitle` recognised a law by English nouns in English positions, and every
 * generic adapter -- `crawl`, `sitemap`, `wp`, `drupal` -- filters through it. So the Thai Customs
 * Department, a permitted and perfectly crawlable server-rendered site, yielded **zero**
 * instruments, formally re-confirmed twice; and Russia's official publication venue, which is
 * permissive, enumerable and publishes nothing but law, would have yielded zero for the same
 * reason. A cell whose corpus is empty reports that it searched and found no restriction, which
 * is the most expensive way to be wrong in this pipeline.
 *
 * The fix asks Zone 0, which already knew. `instrumentTypes[].localName` states what an economy
 * calls each kind of instrument beside the kind it maps to, and nothing was reading it.
 *
 * These tests fix the two properties that keep it honest: that the economies publishing in
 * English are untouched, and that a word shared by two tiers is not allowed to decide between
 * them.
 */
import { describe, expect, it } from 'vitest';
import { instrumentTitle, instrumentWords } from '../src/discover/titles.js';
import { availableProfiles, loadProfile } from '../src/profile/index.js';

const wordsFor = (code: string) => instrumentWords(loadProfile(code).instrumentTypes);

describe('the words an economy names its own instruments by', () => {
  it('is empty for every economy that publishes in English, so their registers are unchanged', () => {
    // The English profiles describe their tiers rather than naming them -- "Subsidiary
    // legislation -- Orders", "Act of the Commonwealth Parliament". Harvesting words from those
    // would match any page that mentions legislation, so only non-Latin terms are taken and
    // these four yield nothing at all.
    for (const code of ['AUS', 'SGP', 'MYS', 'IND']) {
      expect({ code, words: wordsFor(code) }).toEqual({ code, words: [] });
    }
  });

  it('is non-empty for every economy that does not', () => {
    for (const code of ['THA', 'MNG', 'RUS', 'LAO']) {
      expect(wordsFor(code).length, `${code} contributed no vocabulary`).toBeGreaterThan(0);
    }
  });

  it('drops a word two tiers share, because it cannot say which', () => {
    // Mongolia files both a Khural resolution and a Government resolution under тогтоол, so the
    // word itself decides nothing; what survives is the part that discriminates.
    const mn = wordsFor('MNG').map((w) => w.word);
    expect(mn).not.toContain('тогтоол');
    expect(mn).toContain('Засгийн');

    // Russia puts Российской Федерации in most of its tiers, for the same reason.
    const ru = wordsFor('RUS').map((w) => w.word);
    expect(ru).not.toContain('Российской');
    expect(ru).not.toContain('Федерации');
    expect(ru).toContain('Постановление');
  });

  it('never maps one word to two kinds', () => {
    for (const code of availableProfiles()) {
      const seen = new Map<string, string>();
      for (const { word, kind } of wordsFor(code)) {
        expect(seen.has(word) ? seen.get(word) : kind).toBe(kind);
        seen.set(word, kind);
      }
    }
  });
});

describe('a title in the economy\'s own language', () => {
  const cases: { code: string; title: string; kind: string }[] = [
    { code: 'RUS', title: 'Федеральный закон от 27.07.2006 № 152-ФЗ О персональных данных', kind: 'act' },
    { code: 'RUS', title: 'Постановление Правительства Российской Федерации от 01.11.2012 № 1119', kind: 'regulation' },
    { code: 'RUS', title: 'Указ Президента Российской Федерации от 05.12.2016 № 646', kind: 'order' },
    { code: 'MNG', title: 'Хувь хүний нууцын тухай хууль', kind: 'act' },
    { code: 'MNG', title: 'Засгийн газрын тогтоол дугаар 141 Журам батлах тухай', kind: 'regulation' },
    { code: 'LAO', title: 'ກົດໝາຍວ່າດ້ວຍການປົກປ້ອງຂໍ້ມູນສ່ວນບຸກຄົນ', kind: 'act' },
    { code: 'LAO', title: 'ດຳລັດວ່າດ້ວຍການຄຸ້ມຄອງທຸລະກຳທາງເອເລັກໂຕຣນິກ', kind: 'regulation' },
    { code: 'THA', title: 'พระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562', kind: 'act' },
  ];

  it('is recognised, and carries the kind its own vocabulary gives it', () => {
    for (const { code, title, kind } of cases) {
      const named = instrumentTitle(title, wordsFor(code));
      expect({ title, kind: named?.kind ?? null }).toEqual({ title, kind });
    }
  });

  it('was recognised by none of them before the economy was asked', () => {
    // The point of the change, stated as a fact rather than as a claim: with no vocabulary the
    // English grammar recognises not one of these, which is the state every non-English register
    // was built in.
    for (const { title } of cases) expect(instrumentTitle(title)).toBeNull();
  });

  it('still refuses an English page on a bilingual portal', () => {
    // The vocabulary is consulted after the filters that reject a headline or a page published
    // *about* an instrument, so a bilingual site's newsroom is refused on the terms it always was.
    const ru = wordsFor('RUS');
    expect(instrumentTitle('Public consultation on the draft Federal Law on personal data', ru)).toBeNull();
    expect(instrumentTitle('Roskomnadzor launches a new register of operators', ru)).toBeNull();
  });

  it('does not let one economy read another economy\'s law', () => {
    // A Russian title carries no Lao or Thai word, so a profile's vocabulary never reaches past
    // the economy it belongs to. Discovery is per-portal and per-economy; this keeps it so.
    const laoTitle = 'ກົດໝາຍວ່າດ້ວຍການປົກປ້ອງຂໍ້ມູນສ່ວນບຸກຄົນ';
    expect(instrumentTitle(laoTitle, wordsFor('RUS'))).toBeNull();
    expect(instrumentTitle(laoTitle, wordsFor('THA'))).toBeNull();
  });
});
