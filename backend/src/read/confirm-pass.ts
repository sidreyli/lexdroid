/**
 * The confirmation pass, as something a run does rather than something somebody remembers to run.
 *
 * Asking every finding whether its provision really states the measure it was filed as is the
 * single largest accuracy move this system has: on the three mandatory economies it moved agreement
 * with ESCAP from 104 cells to 119. It lived in scripts/confirm.ts and was nobody's job to call, so
 * the runs that produced the submission never had it, and the number that proved it came from a
 * diagnostic nobody downstream could see.
 *
 * The pass is keyed by the question -- one provision, one indicator, one measure -- and not by the
 * run. So the same provision filed under the same measure in three cells is one question with one
 * answer, a second run over the same corpus reads the answer instead of paying for it again, and
 * an interrupted pass resumes where it stopped.
 *
 * Nothing here fetches, parses, searches or scores. The provisions and the findings are already in
 * the store; this asks one question about each and banks the answer.
 */
import type { Db } from '../db/index.js';
import { confirmMeasure, measureOf, questionOf } from './confirm.js';
import { READING_MODEL } from '../engines/ollama.js';
import type { Emit } from '../run/events.js';
import { recordPassCost } from '../run/index.js';

export interface ConfirmPassOptions {
  runId: string;
  model?: string;
  /** One question per engine at a time; the pool enforces the rest. */
  workers?: number;
  /** Stop after this many questions. 0 asks all of them. */
  limit?: number;
  emit?: Emit;
  log?: (line: string) => void;
}

export interface ConfirmPassResult {
  /** Distinct questions this run's findings raise. */
  questions: number;
  /** Of those, the ones already banked before this pass started. */
  alreadyAnswered: number;
  asked: number;
  /** Read and found to state the measure. */
  confirmed: number;
  /** Read and found not to -- the ruling that moves a score. */
  ruledOut: number;
  /** Nobody read it. Not a provision found wanting, and counted apart from one. */
  failed: number;
  /** Rule-outs put a second time, because a rule-out deletes a finding and nothing re-opens it. */
  reasked: number;
  /** Of those, the ones the second ask answered with the provisions words after all. */
  overturned: number;
  seconds: number;
}

interface Question {
  sectionId: number;
  indicatorId: string;
  measure: string;
  instrumentTitle: string;
  headingPath: string;
  text: string;
}

/**
 * Every distinct question this run's findings raise.
 *
 * DISTINCT because a provision filed under one measure in three cells is one question. The join
 * to the run is what scopes it: a pass over one run does not re-ask another run's corpus.
 */
export function questionsOf(db: Db, runId: string): Question[] {
  return db
    .prepare(
      `SELECT DISTINCT r.section_id AS sectionId,
              json_extract(j.value, '$.indicatorId') AS indicatorId,
              json_extract(j.value, '$.measure') AS measure,
              i.title AS instrumentTitle, s.heading_path AS headingPath, s.text AS text
         FROM reading r
         JOIN cell c ON c.id = r.cell_id
         JOIN section s ON s.id = r.section_id
         JOIN document d ON d.id = s.document_id
         JOIN instrument i ON i.id = d.instrument_id,
              json_each(r.attributes) j
        WHERE c.run_id = ?
          AND json_extract(j.value, '$.measure') IS NOT NULL`,
    )
    .all(runId) as Question[];
}

export async function confirmPass(db: Db, opts: ConfirmPassOptions): Promise<ConfirmPassResult> {
  const log = opts.log ?? ((): void => {});
  const emit = opts.emit ?? ((): void => {});
  const model = opts.model ?? READING_MODEL;
  const started = Date.now();
  const spent = { calls: 0, promptTokens: 0, outputTokens: 0, seconds: 0 };

  // Answered means a verdict for this question from this model. A failed ask is not one -- it used
  // to count, so a provision the engine once failed on was never asked again -- and neither is a
  // verdict to a question the catalogue has since changed, or another model's.
  const already = db.prepare(
    `SELECT 1 FROM measure_confirmation
      WHERE section_id = ? AND indicator_id = ? AND measure = ? AND model = ? AND question = ?
        AND failure IS NULL`,
  );
  // Replacing only the row for this same question and model: a failure is superseded by the
  // answer that follows it, and nothing banked under any other question is touched.
  const insert = db.prepare(
    `INSERT OR REPLACE INTO measure_confirmation
       (section_id, indicator_id, measure, question, words, failure, model, prompt_tokens, output_tokens, latency_ms, asked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const questions = questionsOf(db, opts.runId);
  // A measure the catalogue does not define cannot be asked about, and asking anyway would bank a
  // refusal against a question that was never put.
  const pending = questions.filter((q) => {
    const m = measureOf(q.indicatorId, q.measure);
    return m && !already.get(q.sectionId, q.indicatorId, q.measure, model, questionOf(m));
  });
  const todo = opts.limit && opts.limit > 0 ? pending.slice(0, opts.limit) : pending;

  const result: ConfirmPassResult = {
    questions: questions.length,
    alreadyAnswered: questions.length - pending.length,
    asked: 0,
    confirmed: 0,
    ruledOut: 0,
    failed: 0,
    reasked: 0,
    overturned: 0,
    seconds: 0,
  };

  emit({
    stage: 'confirm',
    kind: 'started',
    detail: `${todo.length} question(s) to ask, ${result.alreadyAnswered} already banked`,
    total: todo.length,
  });
  log(`  ${questions.length} question(s), ${result.alreadyAnswered} already answered, ${todo.length} to ask`);

  // A shared queue rather than a slice each: rented engines are not the same speed, and a fixed
  // slice makes the whole pass wait for the slowest card.
  let next = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const q = todo[next++];
      if (!q) return;
      const measure = measureOf(q.indicatorId, q.measure)!;
      const provision = { instrumentTitle: q.instrumentTitle, headingPath: q.headingPath, text: q.text };

      // A rule-out is put a second time before it is banked.
      //
      // The reader has already quoted this provision for this measure. The confirm ask is the
      // second opinion on that quote, and a no here deletes the finding for good: nothing
      // downstream re-opens a banked rule-out, and a cell can lose a band to one. So it has to be
      // right, and measured it is not always. Malaysia 4.5 banked a no against section 13 of the
      // Copyright Act 1987 -- the provision that states fair dealing and lists the four factors to
      // weigh it by, which is the measure almost verbatim -- and re-asking the identical question
      // returned the words, on all four engines. Same prompt, same model, temperature zero. Prefix
      // reuse in the KV cache is the likeliest cause and not one this code can see.
      //
      // This is not the reader runaway, where re-asking is useless because the loop is
      // deterministic. Here the answer measurably varies, which is the one case a second ask is
      // worth making.
      //
      // A yes is taken first time: a confirmation shows the words, and words that are in the
      // provision are in it. Only a no is doubted, and it stands unless the second ask produces
      // the words -- a second ask that fails says nothing about the provision, so the no holds.
      // At 1.1s an ask, with about a fifth of asks ruling out, the second opinion costs some
      // twenty minutes of a nine-hour run.
      const first = await confirmMeasure(provision, measure, { model });
      let c = first;
      let calls = 1;
      if (first.words === null && first.failure === null) {
        const again = await confirmMeasure(provision, measure, { model });
        calls = 2;
        result.reasked += 1;
        if (again.words !== null) result.overturned += 1;
        c = {
          ...(again.words !== null ? again : first),
          promptTokens: first.promptTokens + again.promptTokens,
          completionTokens: first.completionTokens + again.completionTokens,
          durationMs: first.durationMs + again.durationMs,
        };
      }
      insert.run(
        q.sectionId,
        q.indicatorId,
        q.measure,
        questionOf(measure),
        c.words,
        c.failure,
        // The model asked for, which is the key a later lookup uses; the engine's own spelling of
        // its name can carry a tag.
        model,
        c.promptTokens,
        c.completionTokens,
        c.durationMs,
        new Date().toISOString(),
      );
      result.asked += 1;
      spent.calls += calls;
      spent.promptTokens += c.promptTokens;
      spent.outputTokens += c.completionTokens;
      spent.seconds += c.durationMs / 1000;
      if (c.failure) result.failed += 1;
      else if (c.words) result.confirmed += 1;
      else result.ruledOut += 1;

      if (result.asked % 50 === 0) {
        const per = (Date.now() - started) / result.asked / 1000;
        const left = ((todo.length - result.asked) * per) / 60;
        const line =
          `  ${result.asked}/${todo.length}  confirmed ${result.confirmed}  ruled out ${result.ruledOut}` +
          `  failed ${result.failed}  re-asked ${result.reasked}, ${result.overturned} overturned` +
          `  ${per.toFixed(1)}s each, ~${left.toFixed(0)} min left`;
        log(line);
        emit({ stage: 'confirm', kind: 'finished', done: result.asked, total: todo.length, detail: line.trim() });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, opts.workers ?? 1) }, () => worker()));

  result.seconds = (Date.now() - started) / 1000;
  if (spent.calls > 0) recordPassCost(db, opts.runId, model, spent);
  emit({
    stage: 'confirm',
    kind: 'finished',
    done: result.asked,
    total: todo.length,
    seconds: result.seconds,
    detail:
      `${result.confirmed} confirmed, ${result.ruledOut} ruled out, ${result.failed} failed, ` +
      `${result.reasked} rule-out(s) put twice and ${result.overturned} overturned`,
  });
  return result;
}
