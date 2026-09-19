/**
 * The second question: is this provision the measure it was filed as?
 *
 * The reader is shown a pillar's twelve measures and asked which one a provision is. Asked that
 * way it always picks one, because one of them is always nearest. Australia's e-commerce licensing
 * cell was decided by "The Commissioner must develop an APP code about online privacy for
 * children"; its online-content licensing cell by "keep a copy of any contracts"; its transparency
 * cell by "seek public comment on the proposed standard", which is the opposite of the measure it
 * was filed as. Every field around the label was answered correctly. The label was the answer to a
 * multiple-choice question that had no "none of these" in front of it.
 *
 * So the label is asked again on its own, as a closed question about one measure, with the
 * provision in front of the reader and nothing else -- no rubric, no bands, no other measures to
 * be nearest to. The expected answer is that the words are not there: most provisions are not most
 * measures, and a reader confirming somebody else's label is not the same reader choosing its own.
 *
 * This is the same move the reader has already made twice and both times it held: "the words that
 * impose the measure" became "who is bound and what must they do", and then "what is this
 * provision about". Each turned a label into a claim about the document, checkable by looking.
 * This one turns the last label -- the measure itself -- into one.
 *
 * A refusal here is a ruling, not a hold. The provision was read and does not carry the measure,
 * which is evidence for a zero rather than a bar to one.
 */
import type { Measure } from '../rubric/measures.js';
import { generate, EngineFailure, READING_MODEL } from '../engines/ollama.js';
import { quoteIsInSection, windowsOf } from './index.js';
import { SYSTEM, questionText, type ConfirmInput } from './question.js';

export { measureOf, questionOf, questionFor, type ConfirmInput } from './question.js';

const SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: ['string', 'null'],
      description: 'The words from the provision that state the requirement, or null if it states none.',
    },
  },
  required: ['words'],
} as const;

export interface Confirmation {
  /** The words the reader found, or null where it found none. Null is the ruling. */
  words: string | null;
  /** Why the confirmation did not stand, when it did not. Null when the reader answered. */
  failure: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  fromCache: boolean;
}

export interface ConfirmOptions {
  model?: string;
  contextTokens?: number;
}

/**
 * Ask whether one provision states one measure.
 *
 * An engine that will not answer returns a failure rather than a refusal: a provision nobody read
 * is not a provision found wanting, and the two must not arrive downstream looking alike.
 *
 * A provision longer than one reading is asked about in overlapping parts, every part of it. It
 * used to be cut at twelve thousand characters, and a "no" about the first twelve thousand was
 * banked as a "no" about the whole provision -- a veto over a finding the reader may have made in
 * the part that was never shown. Words found in any part confirm; a "no" stands only when every
 * part answered no; a part that could not be asked leaves the question unanswered.
 */
export async function confirmMeasure(
  section: ConfirmInput,
  measure: Measure,
  opts: ConfirmOptions = {},
): Promise<Confirmation> {
  const parts = windowsOf(section.text);
  const total: Confirmation = {
    words: null,
    failure: null,
    model: opts.model ?? READING_MODEL,
    promptTokens: 0,
    completionTokens: 0,
    durationMs: 0,
    fromCache: true,
  };
  const failures: string[] = [];
  for (const [n, shown] of parts.entries()) {
    const one = await askOnce(section, measure, shown, parts.length > 1 ? { index: n + 1, of: parts.length } : null, opts);
    total.model = one.model;
    total.promptTokens += one.promptTokens;
    total.completionTokens += one.completionTokens;
    total.durationMs += one.durationMs;
    total.fromCache &&= one.fromCache;
    if (one.words) return { ...total, words: one.words, failure: null };
    if (one.failure) failures.push(parts.length > 1 ? `part ${n + 1}: ${one.failure}` : one.failure);
  }
  return { ...total, words: null, failure: failures.length ? failures.join('; ') : null };
}

async function askOnce(
  section: ConfirmInput,
  measure: Measure,
  shown: string,
  part: { index: number; of: number } | null,
  opts: ConfirmOptions,
): Promise<Confirmation> {
  const started = Date.now();
  let res;
  try {
    res = await generate(questionText(section, measure, shown, part), SYSTEM, {
      schema: SCHEMA,
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.contextTokens ? { contextTokens: opts.contextTokens } : {}),
    });
  } catch (err) {
    if (!(err instanceof EngineFailure)) throw err;
    return {
      words: null,
      failure: err.message,
      model: opts.model ?? READING_MODEL,
      promptTokens: err.promptTokens,
      completionTokens: err.completionTokens,
      durationMs: err.durationMs || Date.now() - started,
      fromCache: false,
    };
  }

  const base = {
    model: res.model,
    promptTokens: res.promptTokens,
    completionTokens: res.completionTokens,
    durationMs: res.durationMs,
    fromCache: res.fromCache,
  };
  const ruling = rulingOf(res.text, shown, measure);
  return { ...base, words: ruling.words, failure: ruling.failure };
}

/**
 * The reader's answer as a ruling: words that stand, a "no", or no answer at all.
 *
 * Only an explicit null is a "no". An answer that does not parse, that has no `words`, that gives
 * something other than a string, or that gives words which are not in the provision is not a
 * ruling on the provision -- it used to become one, and a "no" is evidence for a zero. Words that
 * merely hand back our own description are the same: the reader did not answer from the text.
 */
export function rulingOf(text: string, sectionText: string, measure: Measure): { words: string | null; failure: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { words: null, failure: 'the answer was not JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || !('words' in parsed)) {
    return { words: null, failure: 'the answer has no words field' };
  }
  const raw = (parsed as { words: unknown }).words;
  if (raw === null || (typeof raw === 'string' && !raw.trim())) return { words: null, failure: null };
  if (typeof raw !== 'string') return { words: null, failure: 'the words field is not text' };
  const words = confirmedWords(raw, sectionText, measure);
  return words
    ? { words, failure: null }
    : { words: null, failure: 'the words given are not the provision\'s own' };
}

/**
 * The answer that stands, or null.
 *
 * Words that are not in the provision confirm nothing, for the reason the first reading's quotes
 * are checked, and our own description handed back is not the provision's words either.
 */
export function confirmedWords(raw: unknown, sectionText: string, measure: Measure): string | null {
  const words = typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  if (!words) return null;
  if (!quoteIsInSection(words, sectionText)) return null;
  if (restates(words, measure.defines) || restates(words, measure.gloss)) return null;
  return words;
}

/** Whether an answer is our wording of the measure rather than the provision's own. */
function restates(answer: string, ours: string): boolean {
  const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = fold(answer);
  const b = fold(ours);
  if (a.length < 15 || b.length < 15) return false;
  return b.includes(a) || a.includes(b);
}
