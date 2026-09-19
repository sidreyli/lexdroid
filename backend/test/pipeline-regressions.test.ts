/**
 * The whole-pipeline review's reproducers, turned round.
 *
 * Each of these once asserted a defect (docs/whole-pipeline-review.md). They now assert the
 * behaviour that replaced it, under the name of what is guaranteed, so a regression shows up as the
 * finding it would reintroduce.
 */
import { describe, it, expect, vi } from 'vitest';

const queue = vi.hoisted(() => ({ answers: [] as string[] }));
vi.mock('../src/engines/ollama.js', async (actual) => ({
  ...(await actual<Record<string, unknown>>()),
  generate: async () => ({
    text: queue.answers.shift() ?? '{"findings":[]}',
    model: 'fixture',
    promptTokens: 1,
    completionTokens: 1,
    durationMs: 1,
    fromCache: false,
    fromResume: false,
  }),
}));
vi.mock('../src/read/index.js', async (actual) => ({
  ...(await actual<Record<string, unknown>>()),
  readFramework: async (input: { instrumentId: number }, subject: string) => ({
    instrumentId: input.instrumentId,
    subject,
    failure: 'framework engine failed',
    model: 'fixture',
    promptTokens: 0,
    completionTokens: 0,
    durationMs: 0,
  }),
}));
vi.mock('../src/shortlist/index.js', async (actual) => ({
  ...(await actual<Record<string, unknown>>()),
  shortlistInstruments: async () => [],
}));
vi.mock('../src/retrieve/index.js', async (actual) => ({
  ...(await actual<Record<string, unknown>>()),
  retrieveForIndicator: async (_db: unknown, i: { id: string }) => ({
    indicatorId: i.id,
    economy: 'SGP',
    queries: ['fixture'],
    depth: 24,
    surfaced: 1,
    indexedSections: 1,
    governing: [],
    perQueryDepth: 40,
    sections: [
      {
        sectionId: 1,
        documentId: 1,
        instrumentId: 1,
        instrumentTitle: 'Example Act',
        headingPath: '1 Example',
        text: 'Example provision',
        anchor: null,
        rank: 1,
        channels: ['dense'],
        found: [{ channel: 'dense', query: 'fixture', rank: 1, score: 0.9 }],
      },
    ],
  }),
}));

import { openDb } from '../src/db/index.js';
import { openRun, recordPillarAnswer } from '../src/run/index.js';
import { answerPillar } from '../src/cell/index.js';
import { rescoreRun } from '../src/run/rescore.js';
import { buildExportRows } from '../src/export/index.js';
import { otherLanguageCopies, counterpartOf } from '../src/retrieve/index.js';
import { materialise } from '../src/discover/index.js';
import { confirmPass } from '../src/read/confirm-pass.js';
import { loadProfile } from '../src/profile/index.js';
import { questionFor } from '../src/read/question.js';
import { readSection } from '../src/read/index.js';
import { loadRubric } from '../src/rubric/index.js';
import { decide, statesDuration, __rules } from '../src/decide/index.js';

const NO_VECTORS = { ids: new Int32Array(), matrix: new Float32Array(), dims: 0 };

function tinyStore(text = 'Example provision') {
  const db = openDb(':memory:');
  db.exec(`INSERT INTO economy(code,name,official_languages) VALUES('SGP','Singapore','["en"]');
    INSERT INTO instrument(id,economy_code,title,kind,status,source_url,discovered_via,discovered_at)
      VALUES(1,'SGP','Example Act','act','in-force','https://sso.agc.gov.sg/example','portal','2026-09-19');
    INSERT INTO document(id,instrument_id,url,content_hash,media_type,bytes,http_status,fetched_at)
      VALUES(1,1,'https://sso.agc.gov.sg/example','hash','text/html',17,200,'2026-09-19');`);
  db.prepare(`INSERT INTO document_text(document_id,text,parser,parsed_at) VALUES(1,?,'fixture','2026-09-19')`).run(text);
  db.prepare(
    `INSERT INTO section(id,document_id,ordinal,heading_path,label,text,char_start,char_end) VALUES(1,1,1,'1 Example','1',?,0,?)`,
  ).run(text, text.length);
  return db;
}

function scoreOf(db: ReturnType<typeof openDb>, indicatorId: string) {
  return db
    .prepare('SELECT state, score FROM cell JOIN cell_answer ON cell_id = cell.id WHERE indicator_id = ?')
    .get(indicatorId);
}

describe('F06: a run scores with its own engine’s second reading', () => {
  it('is not rewritten when another engine confirms the same provision later', async () => {
    const text = 'Every employer shall retain employee records for five years.';
    const db = tinyStore(text);
    const finding = {
      indicatorId: '7.3', measure: 'minimum-retention', quote: text, dutyBearer: 'Every employer',
      dutyAct: 'shall retain employee records', dutyForce: 'requires', mandatory: true, dutyBearerKind: 'organisation',
      definingWords: 'for five years', imposingWords: 'shall retain employee records', subjectWords: 'employee records',
      statedPeriod: 'five years', requirement: 'A duty to retain records.', sectorScope: 'all', dataScope: 'personal',
    };
    queue.answers.push(JSON.stringify({ findings: [finding] }));
    const q = questionFor('7.3', 'minimum-retention');
    const insert = db.prepare(
      'INSERT INTO measure_confirmation(section_id,indicator_id,measure,question,words,model,asked_at) VALUES(1,?,?,?,?,?,?)',
    );
    // This run's own engine read the provision a second time and ruled the measure out.
    insert.run('7.3', 'minimum-retention', q, null, 'fixture', '2026-09-19');
    const run = openRun(db, { economies: ['SGP'], pillars: [7], model: 'fixture' });
    const answer = await answerPillar(db, 7, 'SGP', { model: 'fixture', vectors: NO_VECTORS });
    expect(answer.decisions.find((d) => d.indicatorId === '7.3')?.score).toBe(0);
    recordPillarAnswer(run, answer);
    const before = scoreOf(db, '7.3');

    // A second engine answers the same question the other way.
    insert.run('7.3', 'minimum-retention', q, 'for five years', 'other-model', '2026-09-19');
    rescoreRun(db, run.id);
    expect(scoreOf(db, '7.3')).toEqual(before);
    db.close();
  });
});

describe('F01: a framework nobody could read is not an absent framework', () => {
  it('stays unresolved live, on the record and after a rescore', async () => {
    const db = tinyStore();
    const run = openRun(db, { economies: ['SGP'], pillars: [7], model: 'fixture' });
    const answer = await answerPillar(db, 7, 'SGP', { vectors: NO_VECTORS });
    expect(answer.decisions.find((d) => d.indicatorId === '7.1')?.state).toBe('unresolved');
    recordPillarAnswer(run, answer);
    expect(db.prepare('SELECT count(*) n FROM framework_reading').get()).toEqual({ n: 0 });
    rescoreRun(db, run.id);
    const after = db
      .prepare("SELECT state, score FROM cell JOIN cell_answer ON cell_id = cell.id WHERE indicator_id = '7.1'")
      .get();
    expect(after).toEqual({ state: 'unresolved', score: null });
    db.close();
  });
});

/** One provision read under one indicator, and the decision it alone supports. */
async function decideOne(indicatorId: string, text: string, finding: Record<string, unknown>) {
  queue.answers.push(JSON.stringify({ findings: [finding] }));
  const indicator = loadRubric().indicators.find((i) => i.id === indicatorId)!;
  const reading = await readSection(
    { sectionId: 1, instrumentTitle: 'Example Act', headingPath: '1', text },
    Number(indicatorId.split('.')[0]),
    'Privacy',
    [indicator],
  );
  expect(reading.findings).toHaveLength(1);
  return decide({
    indicator,
    economy: 'SGP',
    evidence: [
      {
        finding: reading.findings[0]!,
        sectionId: 1,
        instrumentId: 1,
        instrumentTitle: 'Example Act',
        headingPath: '1',
        citation: 'https://sso.agc.gov.sg/example#s1',
        bindingness: 'binding',
        instrumentStatus: 'in-force',
        amendsAnotherAct: false,
      },
    ],
    coverage: { sectionsRead: 1, sectionsIndexed: 1, instrumentsConsidered: 1 },
    surfaced: [{ instrumentId: 1, instrumentTitle: 'Example Act', rank: 1 }],
  });
}

const retention = (text: string, definingWords: string, statedPeriod: string | null) => ({
  indicatorId: '7.3', measure: 'minimum-retention', quote: text, dutyBearer: 'Every employer',
  dutyAct: 'shall retain employee records', dutyForce: 'requires', mandatory: true, dutyBearerKind: 'organisation',
  definingWords, imposingWords: 'shall retain employee records', subjectWords: 'employee records', statedPeriod,
  requirement: 'A duty to retain records.', sectorScope: 'all', dataScope: 'personal',
});

describe('F02: 7.3 is a stated minimum period (RDTII 2.1 internal guide; finals mapping traps)', () => {
  it('records a retention duty with no stated period and scores it 0.00', async () => {
    const text = 'Every employer shall retain employee records for the prescribed period.';
    const d = await decideOne('7.3', text, retention(text, 'for the prescribed period', null));
    expect(d.score).toBe(0);
    expect(d.state).toBe('no-restriction');
    expect(d.excluded.map((x) => x.reason).join(' ')).toMatch(/states no retention period/);
  });

  it('does not take the period from the reader when the provision does not state it', async () => {
    const text = 'Every employer shall retain employee records for the prescribed period.';
    const d = await decideOne('7.3', text, retention(text, 'for the prescribed period', '5 years'));
    expect(d.score).toBe(0);
  });

  it('scores a duty that states its period', async () => {
    const text = 'Every employer shall retain employee records for a period of not less than seven (7) years.';
    const d = await decideOne('7.3', text, retention(text, 'for a period of not less than seven (7) years', '7 years'));
    expect(d.state).toBe('restricted');
    expect(d.score).toBe(1);
  });

  it('knows a duration when it sees one', () => {
    expect(statesDuration('for five years')).toBe(true);
    expect(statesDuration('not less than 6 months')).toBe(true);
    expect(statesDuration('tempoh tujuh tahun')).toBe(true);
    expect(statesDuration('for the period prescribed')).toBe(false);
    expect(statesDuration('under section 7 of the Act')).toBe(false);
  });
});

describe('F03: 7.5 scores access without explicit judicial authorisation (RDTII 2.1 guide)', () => {
  // The guide asks whether government can access personal data "without the explicit authorization
  // of an independent judicial body", and scores Cambodia's surveillance "with the authorized of a
  // legitimate authority" because nothing says that authority is judicial. A provision that names
  // no authorisation has not made one explicit, so the power scores.
  it('scores a power whose provision names no authorisation at all', async () => {
    const text = 'An authorised officer may require a provider to disclose personal data in accordance with section 9.';
    const d = await decideOne('7.5', text, {
      indicatorId: '7.5', measure: 'government-access', quote: text, dutyBearer: 'An authorised officer',
      dutyAct: 'may require a provider to disclose personal data', dutyForce: 'permits', mandatory: false,
      dutyBearerKind: 'government', definingWords: 'may require a provider to disclose personal data',
      subjectWords: 'personal data', authorisation: 'unstated', authorisingWords: null, sectorScope: 'all',
      dataScope: 'personal',
    });
    expect(d.score).toBe(1);
  });
});

describe('F19: 12.5 reads the threshold, not the section number', () => {
  it('puts an S$400 threshold in the band for S$400', () => {
    const indicator = loadRubric().indicators.find((i) => i.id === '12.5')!;
    const words = 'Goods under section 3 with a value not exceeding S$400';
    const out = __rules['12.5']!(indicator, [{ finding: { definingWords: words } } as never], {
      economy: 'SGP',
      rates: { base: 'USD', asOf: '2026-09-19', fetchedAt: '2026-09-19', source: 'fixture', usdPer: { SGD: 0.75 } },
    } as never);
    expect(out.reason).toMatch(/300/);
  });
});

describe('F04: two claims in one provision are two claims', () => {
  it('scores the access power beside one that needs a court order, live and on the record', async () => {
    const quotes = [
      'The police may obtain personal data on a court order.',
      'The police may obtain personal data without judicial approval in an emergency.',
    ];
    const db = tinyStore(quotes.join(' '));
    const findings = quotes.map((quote, i) => ({
      indicatorId: '7.5', measure: 'government-access', quote, dutyBearer: 'The police',
      dutyAct: 'may obtain personal data', dutyForce: 'permits', mandatory: false, dutyBearerKind: 'government',
      definingWords: 'may obtain personal data', subjectWords: 'personal data',
      authorisation: i ? 'none' : 'court-order', authorisingWords: i ? 'without judicial approval' : 'on a court order',
      sectorScope: 'all', dataScope: 'personal',
    }));
    queue.answers.push(JSON.stringify({ findings }));
    const run = openRun(db, { economies: ['SGP'], pillars: [7], model: 'fixture' });
    const answer = await answerPillar(db, 7, 'SGP', { model: 'fixture', vectors: NO_VECTORS });
    const live = answer.decisions.find((d) => d.indicatorId === '7.5')!;
    expect(live.score).toBe(1);
    recordPillarAnswer(run, answer);

    // The basis names the power that decided it, so the row quotes that one and not the first.
    const basis = db.prepare("SELECT b.quote FROM answer_basis b JOIN cell c ON c.id = b.cell_id WHERE c.indicator_id = '7.5'").all();
    expect(basis).toEqual([{ quote: quotes[1] }]);

    rescoreRun(db, run.id);
    expect(scoreOf(db, '7.5')).toEqual({ state: 'restricted', score: 1 });

    buildExportRows(db, run.id);
    const rows = db.prepare("SELECT verbatim_snippet FROM export_row WHERE indicator_id = '7.5'").all();
    expect(rows).toEqual([{ verbatim_snippet: quotes[1] }]);
    db.close();
  });
});

describe('F05: an answer nobody could read is not "nothing applies"', () => {
  const indicator = () => loadRubric().indicators.find((i) => i.id === '7.3')!;
  const text = 'Records shall be kept for seven years.';

  it('fails a reading whose every item was malformed', async () => {
    queue.answers.push('{"findings":[{"note":"see the schedule"}]}');
    const r = await readSection({ sectionId: 1, instrumentTitle: 'Example Act', headingPath: '1', text }, 7, 'Privacy', [indicator()]);
    expect(r.failure).toMatch(/could not be read as findings/);
    expect(r.findings).toEqual([]);
  });

  it('keeps the findings of a partly malformed answer and marks it incomplete', async () => {
    queue.answers.push(
      JSON.stringify({
        findings: [
          { note: 'see the schedule' },
          { ...retention(text, 'for seven years', '7 years'), dutyBearer: null, dutyAct: 'shall be kept', imposingWords: 'shall be kept', subjectWords: 'Records' },
        ],
      }),
    );
    const r = await readSection({ sectionId: 1, instrumentTitle: 'Example Act', headingPath: '1', text }, 7, 'Privacy', [indicator()]);
    expect(r.failure).toBeNull();
    expect(r.findings).toHaveLength(1);
    expect(r.unreadable).toBe(1);
  });

  it('lets a well-formed claim the provision does not bear out stand as a checked negative', async () => {
    queue.answers.push(JSON.stringify({ findings: [retention('Records shall be kept for ten years.', 'for ten years', '10 years')] }));
    const r = await readSection({ sectionId: 1, instrumentTitle: 'Example Act', headingPath: '1', text }, 7, 'Privacy', [indicator()]);
    expect(r.failure).toBeNull();
    expect(r.findings).toEqual([]);
    expect(r.rejected).toHaveLength(1);
    expect(r.unreadable).toBeUndefined();
  });
});

describe('F15: a translation is paired with its own counterpart, not with a number', () => {
  it('keeps a provision whose only same-numbered section says something else', () => {
    const db = tinyStore('Fees payable under the Schedule are 20.');
    db.exec(`UPDATE section SET heading_path='Schedule 2 > 1 Fees', language='en' WHERE id=1;
      INSERT INTO section(id,document_id,ordinal,heading_path,label,text,char_start,char_end,language)
        VALUES(2,1,2,'Part I > 1 Duties','1','Pengawal data hendaklah mematuhi seksyen 12A Akta 709',18,70,'ms');`);
    expect([...otherLanguageCopies(db, 'SGP')]).toEqual([]);
    db.close();
  });

  it('pairs by what a translation keeps, and refuses to choose between two it cannot tell apart', () => {
    const ms = '1.1 Seksyen 12A Akta Perlindungan Data Peribadi 2010 [Akta 709] menetapkan kewajipan pegawai';
    const dpo = { id: 1, text: '1.1 Section 12A of the Personal Data Protection Act 2010 (Act 709) sets the duty of an officer' };
    const breach = { id: 2, text: '1.1 Section 12B of the Personal Data Protection Act 2010 [Act 709] sets the duty to notify a breach' };
    expect(counterpartOf(ms, [dpo, breach], '1.1')).toBe(1);
    expect(counterpartOf('1. Latar Belakang', [{ id: 1, text: '1. Background' }, { id: 2, text: '1. Background' }], '1.')).toBeNull();
    expect(counterpartOf('1. Latar Belakang', [{ id: 1, text: '1. Background' }], '1.')).toBe(1);
  });
});

describe('F14: an instrument whose document came back unreadable is asked for again', () => {
  const unread = (reason: string, attempts: number) => {
    const db = tinyStore();
    db.exec('DELETE FROM section');
    db.prepare(`INSERT INTO unread_document(document_id,reason,detail,recorded_at,attempts) VALUES(1,?,'fixture','2026-09-19',?)`).run(reason, attempts);
    return db;
  };
  const tries = async (db: ReturnType<typeof openDb>) => {
    const fetch = vi.fn(async () => ({ status: 503, url: 'x', finalUrl: 'x', mediaType: 'text/html', body: Buffer.from(''), contentHash: 'h', fromCache: false, fetchedAt: 'now' }));
    await materialise(db, loadProfile('SGP'), { fetch } as never, { instrumentIds: [1] });
    return fetch.mock.calls.length;
  };

  it('retries an empty page', async () => {
    const db = unread('empty', 1);
    expect(await tries(db)).toBe(1);
    db.close();
  });

  it('stops after three tries', async () => {
    const db = unread('empty', 3);
    expect(await tries(db)).toBe(0);
    db.close();
  });

  it('does not ask again for a document that is unreadable in itself', async () => {
    const db = unread('scanned-no-ocr', 1);
    expect(await tries(db)).toBe(0);
    db.close();
  });
});

describe('F20: a run is billed for every call it made', () => {
  it('adds the confirmation pass to the run it confirmed', async () => {
    const text = 'Every employer shall retain employee records for five years.';
    const db = tinyStore(text);
    queue.answers.push(JSON.stringify({ findings: [retention(text, 'for five years', '5 years')] }));
    const run = openRun(db, { economies: ['SGP'], pillars: [7], model: 'fixture' });
    recordPillarAnswer(run, await answerPillar(db, 7, 'SGP', { model: 'fixture', vectors: NO_VECTORS }));
    const before = db.prepare('SELECT SUM(calls) n FROM run_cost WHERE run_id = ?').get(run.id) as { n: number };

    const pass = await confirmPass(db, { runId: run.id, model: 'fixture' });
    expect(pass.asked).toBeGreaterThan(0);
    const after = db.prepare('SELECT SUM(calls) n FROM run_cost WHERE run_id = ?').get(run.id) as { n: number };
    expect(after.n - before.n).toBe(pass.asked);
    db.close();
  });
});

describe('F11: a reviewer’s correction survives the export being rebuilt', () => {
  it('carries the verdict to the regenerated row and puts the corrected words back on it', async () => {
    const text = 'Every employer shall retain employee records for five years.';
    const db = tinyStore(text);
    queue.answers.push(JSON.stringify({ findings: [retention(text, 'for five years', '5 years')] }));
    const run = openRun(db, { economies: ['SGP'], pillars: [7], model: 'fixture' });
    recordPillarAnswer(run, await answerPillar(db, 7, 'SGP', { model: 'fixture', vectors: NO_VECTORS }));
    buildExportRows(db, run.id);

    const before = db.prepare("SELECT id, verbatim_snippet FROM export_row WHERE indicator_id = '7.3'").get() as {
      id: number; verbatim_snippet: string;
    };
    const corrected = 'shall retain employee records for five years';
    // What the interface's write does on an edit: the ledger entry, and the row changed in place.
    db.prepare(
      `INSERT INTO review_action (export_row_id, action, attestation, changed_fields, reviewer, acted_at)
       VALUES (?, 'edit', 'checked', ?, 'reviewer', '2026-09-20T00:00:00.000Z')`,
    ).run(before.id, JSON.stringify({ verbatimSnippet: { from: before.verbatim_snippet, to: corrected } }));
    db.prepare('UPDATE export_row SET verbatim_snippet = ? WHERE id = ?').run(corrected, before.id);

    const rebuilt = buildExportRows(db, run.id);
    expect(rebuilt.reviewsCarried).toBe(1);
    expect(rebuilt.reviewsDropped).toBe(0);
    const after = db
      .prepare(
        `SELECT e.verbatim_snippet, r.action FROM export_row e JOIN review_action r ON r.export_row_id = e.id
          WHERE e.indicator_id = '7.3'`,
      )
      .get();
    expect(after).toEqual({ verbatim_snippet: corrected, action: 'edit' });
    db.close();
  });
});
